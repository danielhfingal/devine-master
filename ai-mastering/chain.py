"""Transparent mastering chain + automatic dynamics-aware gain staging."""
from __future__ import annotations

from pedalboard import (
    Pedalboard,
    HighpassFilter,
    LowShelfFilter,
    HighShelfFilter,
    PeakFilter,
    Compressor,
    Gain,
    Limiter,
)
import numpy as np
from typing import Optional

from analysis import measure_loudness, gain_to_target, measure_crest_factor, true_peak_limit
from repair import declip, detect_clipping
from ms_exciter import ms_width, harmonic_exciter
from provenance import soft_audio_mark


def build_mastering_chain(
    sample_rate: int,
    target_tp: float = -1.0,
    # Explicit parameters so Grok / user can override
    hp_freq: float = 30.0,
    low_shelf_gain: float = 0.5,
    low_shelf_freq: float = 120.0,
    presence_gain: float = 1.0,
    presence_freq: float = 3500.0,
    presence_q: float = 0.8,
    high_shelf_gain: float = 1.5,
    high_shelf_freq: float = 10000.0,
    comp_threshold: float = -18.0,
    comp_ratio: float = 2.5,
    comp_attack: float = 15.0,
    comp_release: float = 100.0,
    limiter_threshold: float = -2.0,
) -> Pedalboard:
    """
    Gentle, AI-track-friendly chain:
    1. High-pass
    2. Low-shelf + presence + air
    3. Soft compressor
    4. Limiter (true-peak target)
    """
    return Pedalboard([
        HighpassFilter(cutoff_frequency_hz=hp_freq),
        LowShelfFilter(cutoff_frequency_hz=low_shelf_freq, gain_db=low_shelf_gain),
        PeakFilter(cutoff_frequency_hz=presence_freq, gain_db=presence_gain, q=presence_q),
        HighShelfFilter(cutoff_frequency_hz=high_shelf_freq, gain_db=high_shelf_gain),
        Compressor(
            threshold_db=comp_threshold,
            ratio=comp_ratio,
            attack_ms=comp_attack,
            release_ms=comp_release,
        ),
        Limiter(threshold_db=limiter_threshold, release_ms=50.0),
    ])


def auto_gain_stage(
    audio: np.ndarray,
    sr: int,
    target_lufs: float = -10.1,
    max_gain_db: float = 6.0,
    min_crest_db: float = 8.0,
) -> tuple[np.ndarray, dict]:
    """
    Dynamics-aware gain staging for AI-generated tracks.

    - Measures current LUFS and crest factor (using true-peak).
    - If the track is already heavily limited (low crest), we apply less aggressive
      makeup so we don't further destroy dynamics.
    - Caps total gain to avoid pushing noise floor or artifacts.
    """
    stats = measure_loudness(audio, sr)
    crest = measure_crest_factor(audio, use_true_peak=True, sr=sr)

    raw_gain = gain_to_target(stats["integrated_lufs"], target_lufs)
    raw_gain_db = 20.0 * np.log10(raw_gain + 1e-12)

    # Scale gain by how dynamic the material still is
    # crest < min_crest_db → already squashed → reduce makeup
    dynamics_factor = np.clip(crest / min_crest_db, 0.65, 1.0)
    adjusted_gain_db = np.clip(raw_gain_db * dynamics_factor, -max_gain_db, max_gain_db)
    adjusted_gain = 10.0 ** (adjusted_gain_db / 20.0)

    staged = audio * adjusted_gain

    report = {
        "original_lufs": stats["integrated_lufs"],
        "true_peak_dbtp": stats["true_peak_dbtp"],
        "crest_factor_db": crest,
        "raw_gain_db": raw_gain_db,
        "dynamics_factor": float(dynamics_factor),
        "applied_gain_db": adjusted_gain_db,
        "reason": (
            "reduced makeup (low crest)" if dynamics_factor < 0.95
            else "full makeup (healthy dynamics)"
        ),
    }
    return staged, report


def apply_chain(
    audio: np.ndarray,
    sr: int,
    target_lufs: float = -10.1,
    target_tp: float = -1.0,
    use_auto_staging: bool = True,
    chain_params: Optional[dict] = None,
    declip_strength: float = 0.0,
    width: float = 1.0,
    mono_bass_hz: float = 120.0,
    exciter_drive: float = 0.0,
    exciter_mix: float = 0.2,
    watermark: bool = False,
    watermark_level_db: float = -48.0,
    max_gain_db: float = 6.0,
    min_crest_db: float = 8.0,
    second_makeup_cap_db: float = 3.0,
    crest_floor_db: float | None = None,
    target_crest_db: float | None = None,
) -> tuple[np.ndarray, dict]:
    """
    Full transparent process:
    1. Optional dynamics-aware gain staging
    2. EQ → Compressor → Limiter chain
    3. Final safety limiter + LUFS trim
    """
    chain_params = dict(chain_params or {})
    # Strip any metadata keys that are not valid pedalboard args
    source_info = chain_params.pop("_source", None)
    ref_match_info = chain_params.pop("_reference_match", None)
    report: dict = {
        "stages": [],
        "param_source": source_info,
        "reference_match": ref_match_info,
    }

    # --- Stage 0a: Optional de-clip (Suno source repair) ---
    if declip_strength > 0.01:
        clip_info = detect_clipping(audio)
        audio, declip_rep = declip(audio, strength=float(declip_strength))
        report["stages"].append({"name": "declip", "clip_detect": clip_info, **declip_rep})
    else:
        report["stages"].append({"name": "declip", "skipped": True})

    # --- Stage 0b: Optional M/S width ---
    if abs(width - 1.0) > 0.01 or mono_bass_hz > 0:
        audio, ms_rep = ms_width(audio, width=width, mono_bass_hz=mono_bass_hz, sr=sr)
        report["stages"].append({"name": "ms_width", **ms_rep})
    else:
        report["stages"].append({"name": "ms_width", "skipped": True})

    # --- Stage 0c: Optional light harmonic exciter ---
    if exciter_drive > 0.01:
        audio, ex_rep = harmonic_exciter(
            audio, drive=exciter_drive, mix=exciter_mix, sr=sr
        )
        report["stages"].append({"name": "harmonic_exciter", **ex_rep})
    else:
        report["stages"].append({"name": "harmonic_exciter", "skipped": True})

    # --- Stage 1: Auto gain staging (respects original dynamics) ---
    if use_auto_staging:
        audio, stage_report = auto_gain_stage(
            audio, sr, target_lufs,
            max_gain_db=max_gain_db,
            min_crest_db=min_crest_db,
        )
        report["stages"].append({"name": "auto_gain_stage", **stage_report})
    else:
        report["stages"].append({"name": "auto_gain_stage", "skipped": True})

    before = measure_loudness(audio, sr)
    report["before_chain"] = before

    # --- Stage 2: Main chain ---
    board = build_mastering_chain(sr, target_tp=target_tp, **chain_params)
    processed = board(audio.T, sr).T  # (channels, samples)

    mid = measure_loudness(processed, sr)
    report["after_chain"] = mid

    # --- Stage 2b: Nonlinear push-into-limiter density (true peak shaper) ---
    # Boost then *Limiter* (not linear ceiling) so peaks compress more than RMS →
    # crest falls and integrated LUFS can rise under the same TP gate.
    if target_crest_db is not None:
        from pedalboard import Limiter as _Lim, Pedalboard as _PB
        dens_steps = []
        floor = float(crest_floor_db) if crest_floor_db is not None else 9.0
        aim_lufs = float(target_lufs)
        lim_thr = float(target_tp) - 0.05  # e.g. -1.05
        for step in range(12):
            m = measure_loudness(processed, sr)
            c = measure_crest_factor(processed, use_true_peak=True, sr=sr)
            lufs_now = m["integrated_lufs"]
            if not np.isfinite(lufs_now) or not np.isfinite(c):
                break
            gap = aim_lufs - lufs_now
            if gap <= 0.3:
                dens_steps.append({"step": step, "stop": "lufs_hit", "lufs": float(lufs_now), "crest": float(c)})
                break
            if c <= floor + 0.2:
                dens_steps.append({"step": step, "stop": "crest_floor", "lufs": float(lufs_now), "crest": float(c)})
                break
            headroom = max(0.05, c - floor)
            boost = float(np.clip(min(gap * 0.5, 0.5 + 0.2 * min(headroom, 3.0), 1.5), 0.08, 1.5))
            processed = processed * (10.0 ** (boost / 20.0))
            processed = np.nan_to_num(processed, nan=0.0, posinf=0.0, neginf=0.0)
            # Nonlinear peak limit
            board_l = _PB([_Lim(threshold_db=lim_thr, release_ms=40.0)])
            processed = board_l(processed.T, sr).T
            processed = np.nan_to_num(processed, nan=0.0, posinf=0.0, neginf=0.0)
            # Safety linear TP
            processed, _ = true_peak_limit(processed, sr, target_tp=target_tp, overs=4, max_iterations=2)
            m2 = measure_loudness(processed, sr)
            c2 = measure_crest_factor(processed, use_true_peak=True, sr=sr)
            dens_steps.append({
                "step": step,
                "boost_db": boost,
                "lufs": float(m2["integrated_lufs"]),
                "crest": float(c2) if np.isfinite(c2) else None,
                "tp": float(m2["true_peak_dbtp"]),
            })
            # stagnation guard
            if step > 0 and abs(dens_steps[-1]["lufs"] - dens_steps[-2]["lufs"]) < 0.05 and dens_steps[-1]["crest"] is not None and dens_steps[-2]["crest"] is not None and abs(dens_steps[-1]["crest"] - dens_steps[-2]["crest"]) < 0.05:
                dens_steps[-1]["stop"] = "stagnant"
                break
        report["stages"].append({
            "name": "crest_density",
            "mode": "boost_plus_limiter",
            "target_lufs": aim_lufs,
            "crest_floor": floor,
            "steps": dens_steps,
        })
        mid = measure_loudness(processed, sr)
    else:
        report["stages"].append({"name": "crest_density", "skipped": True})

    # --- Stage 3: Tight LUFS + true-peak interaction ---
    # Predict TP-limit loss, pre-boost so post-limit LUFS lands near target.
    processed = np.nan_to_num(processed, nan=0.0, posinf=0.0, neginf=0.0)

    mid = measure_loudness(processed, sr)
    crest = measure_crest_factor(processed, use_true_peak=True, sr=sr)
    if not np.isfinite(crest) or crest < 0.1:
        crest = 8.0
    dynamics_factor = float(np.clip(crest / 8.0, 0.75, 1.0))

    # Ideal makeup to target
    ideal_db = (target_lufs - mid["integrated_lufs"]) * dynamics_factor
    ideal_db = float(np.clip(ideal_db, -18.0, 18.0))

    # Preview: apply ideal makeup and measure TP
    preview = processed * (10.0 ** (ideal_db / 20.0))
    preview_tp = measure_loudness(preview, sr)["true_peak_dbtp"]
    predicted_pull = max(0.0, preview_tp - target_tp + 0.1)

    # Pre-boost by most of the predicted pull so we land closer after limiting
    preboost_db = ideal_db + predicted_pull * 0.9
    preboost_db = float(np.clip(preboost_db, -18.0, 18.0))
    processed = processed * (10.0 ** (preboost_db / 20.0))
    processed = np.nan_to_num(processed, nan=0.0, posinf=0.0, neginf=0.0)

    processed, tp_report_1 = true_peak_limit(
        processed, sr, target_tp=target_tp, overs=4, max_iterations=4
    )

    after_tp1 = measure_loudness(processed, sr)
    lufs_gap = target_lufs - after_tp1["integrated_lufs"]
    tp_room = target_tp - after_tp1["true_peak_dbtp"]

    second_makeup_db = 0.0
    if lufs_gap > 0.15 and tp_room > 0.06:
        # Approach target_lufs but never spend more TP room than available
        second_makeup_db = float(np.clip(
            min(lufs_gap * 0.95, tp_room - 0.04),
            0.0,
            float(second_makeup_cap_db),
        ))
        processed = processed * (10.0 ** (second_makeup_db / 20.0))
        processed, tp_report_2 = true_peak_limit(
            processed, sr, target_tp=target_tp, overs=4, max_iterations=4
        )
    else:
        tp_report_2 = {"skipped": True}

    # Crest-floor guard: if we over-squashed below floor, back off gain slightly
    crest_after = measure_crest_factor(processed, use_true_peak=True, sr=sr)
    crest_backoff_db = 0.0
    floor = crest_floor_db if crest_floor_db is not None else None
    if floor is not None and np.isfinite(crest_after) and crest_after < floor:
        # Reduce level to recover a bit of crest headroom (approx; re-limit after)
        crest_backoff_db = float(np.clip(floor - crest_after, 0.0, 1.5)) * -0.35
        processed = processed * (10.0 ** (crest_backoff_db / 20.0))
        processed, tp_crest = true_peak_limit(
            processed, sr, target_tp=target_tp, overs=4, max_iterations=2
        )
        report["stages"].append({
            "name": "crest_floor_guard",
            "crest_before": float(crest_after),
            "crest_floor": float(floor),
            "backoff_db": crest_backoff_db,
            "tp": tp_crest,
        })
    else:
        report["stages"].append({
            "name": "crest_floor_guard",
            "skipped": True,
            "crest": float(crest_after) if np.isfinite(crest_after) else None,
            "crest_floor": floor,
        })

    # Optional soft audio watermark
    if watermark:
        processed = soft_audio_mark(
            processed, sr, key="D.Devine", level_db=watermark_level_db
        )
        processed, tp_wm = true_peak_limit(
            processed, sr, target_tp=target_tp, overs=4, max_iterations=2
        )
        after = measure_loudness(processed, sr)
        report["stages"].append({
            "name": "soft_watermark",
            "level_db": watermark_level_db,
            "tp_after": tp_wm,
        })
    else:
        report["stages"].append({"name": "soft_watermark", "skipped": True})
        after = measure_loudness(processed, sr)

    report["after_final"] = after
    report["final_makeup_db"] = preboost_db + second_makeup_db + crest_backoff_db
    report["true_peak_limit"] = {
        "pass1": tp_report_1,
        "pass2": tp_report_2,
        "predicted_tp_pull_db": round(predicted_pull, 2),
    }
    report["target_lufs"] = target_lufs
    report["target_tp"] = target_tp

    return processed, report
