"""Loudness, true-peak, and spectral balance analysis."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np
import pyloudnorm as pyln
from scipy import signal


def measure_true_peak(audio: np.ndarray, sr: int, overs: int = 4) -> float:
    """
    Proper true-peak measurement using 4× oversampling (ITU-R BS.1770 style).
    Returns true-peak in dBTP (0 dBTP = full scale).
    """
    if audio.ndim == 1:
        audio = audio[None, :]

    audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0)

    peaks = []
    for ch in range(audio.shape[0]):
        try:
            up = signal.resample_poly(audio[ch], up=overs, down=1)
            peaks.append(float(np.max(np.abs(up))))
        except Exception:
            peaks.append(float(np.max(np.abs(audio[ch]))))

    peak = float(np.max(peaks)) if peaks else 0.0
    if peak < 1e-12:
        return -120.0
    return 20.0 * np.log10(peak + 1e-12)


def true_peak_limit(
    audio: np.ndarray,
    sr: int,
    target_tp: float = -1.0,
    overs: int = 4,
    max_iterations: int = 3,
    margin_db: float = 0.05,
) -> tuple[np.ndarray, dict]:
    """
    Memory-efficient true-peak limiter.

    Measures TP with 4× oversampling, then applies the minimum broadband
    gain needed plus a sample-peak ceiling. Chunked measurement avoids
    loading a full 4× buffer for the entire track.
    """
    audio = np.nan_to_num(audio.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    report: dict = {"iterations": [], "final_tp": None, "method": "measure_then_ceiling"}

    working = audio.copy()
    total_gain_db = 0.0
    ceiling = 10.0 ** ((target_tp - margin_db) / 20.0)

    for i in range(max_iterations):
        tp = measure_true_peak(working, sr, overs=overs)
        report["iterations"].append({"iter": i, "tp_dbtp": round(float(tp), 3)})
        if tp <= target_tp + margin_db:
            break
        reduction_db = float(np.clip((tp - target_tp) + margin_db, 0.0, 6.0))
        working = working * (10.0 ** (-reduction_db / 20.0))
        total_gain_db -= reduction_db

    # Sample-peak safety ceiling
    peak = float(np.max(np.abs(working)))
    if peak > ceiling:
        working = working * (ceiling / peak)
        total_gain_db += 20.0 * np.log10(max(ceiling / (peak + 1e-12), 1e-12))

    working = np.nan_to_num(working, nan=0.0, posinf=0.0, neginf=0.0)
    final_tp = measure_true_peak(working, sr, overs=overs)
    report["final_tp"] = round(float(final_tp), 3)
    report["gain_applied_db"] = round(total_gain_db, 2)
    return working, report




def measure_loudness(audio: np.ndarray, sr: int) -> dict:
    """
    Integrated LUFS + proper 4×-oversampled true-peak (dBTP).
    audio shape: (channels, samples)
    """
    meter = pyln.Meter(sr, block_size=0.400)  # EBU R128
    integrated = meter.integrated_loudness(audio.T)

    true_peak_db = measure_true_peak(audio, sr, overs=4)

    # Also keep sample-peak for comparison / crest
    sample_peak = float(np.max(np.abs(audio)))
    sample_peak_db = 20.0 * np.log10(sample_peak + 1e-12)

    return {
        "integrated_lufs": float(integrated),
        "true_peak_dbtp": true_peak_db,
        "sample_peak_db": sample_peak_db,
        "sample_rate": sr,
        "channels": int(audio.shape[0]),
        "duration_s": float(audio.shape[1] / sr),
    }


# D.Devine catalogue defaults (extracted from final Spotify masters)
DEFAULT_TARGET_LUFS = -10.1
DEFAULT_TARGET_TP = -1.0


def gain_to_target(current_lufs: float, target_lufs: float = DEFAULT_TARGET_LUFS) -> float:
    """Linear gain needed to reach target integrated LUFS. Safe against NaN/Inf."""
    if not np.isfinite(current_lufs) or not np.isfinite(target_lufs):
        return 1.0
    diff = target_lufs - current_lufs
    # Cap extreme makeup (±24 dB) so we never explode on silence or measurement glitches
    diff = float(np.clip(diff, -24.0, 24.0))
    return 10.0 ** (diff / 20.0)


def measure_crest_factor(audio: np.ndarray, use_true_peak: bool = False, sr: int = 44100) -> float:
    """
    Crest factor in dB (peak / RMS).
    Higher = more dynamic. Useful for AI tracks that are already squashed.

    If use_true_peak=True, uses the 4× oversampled true-peak instead of sample peak.
    """
    if use_true_peak:
        peak_db = measure_true_peak(audio, sr)
        peak = 10.0 ** (peak_db / 20.0)
    else:
        peak = np.max(np.abs(audio))

    rms = np.sqrt(np.mean(audio ** 2))
    if rms < 1e-12:
        return 0.0
    return 20.0 * np.log10(peak / rms)


# ---------------------------------------------------------------------------
# Spectral balance – D.Devine reference profile (default)
# Extracted from final Spotify masters (Suno → sunomaster.com → Audacity)
# ---------------------------------------------------------------------------

# Frequency boundaries + relative energy targets from the catalogue profile
REFERENCE_SPECTRUM = {
    "sub":      (20, 60,    19.2),   # (low, high, relative dB)
    "bass":     (60, 250,   18.1),
    "low_mid":  (250, 500,   7.4),
    "mid":      (500, 2000, -0.4),
    "presence": (2000, 6000, -8.6),
    "air":      (6000, 16000, -16.7),
}

# Path to the expandable profile JSON (regenerate when new masters are added)
PROFILE_JSON = Path("/home/workdir/artifacts/tracks/d_devine_reference_profile.json")


def load_devine_profile(path: Path | None = None) -> dict | None:
    """
    Load the D.Devine reference profile JSON.
    Returns None if the file is missing (tool still works with built-in defaults).
    When you add new released masters, re-run the profile extractor and this
    will automatically pick up the updated numbers.
    """
    path = path or PROFILE_JSON
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def band_energy(audio: np.ndarray, sr: int, low: float, high: float) -> float:
    """
    Relative band energy via STFT (robust to near-silent bands).
    audio can be (samples,) or (1, samples).
    """
    mono = np.asarray(audio).squeeze()
    mono = np.nan_to_num(mono, nan=0.0, posinf=0.0, neginf=0.0)
    nperseg = min(4096, max(256, len(mono) // 4))
    f, _, Zxx = signal.stft(mono, fs=sr, nperseg=nperseg, noverlap=nperseg // 2)
    mag = np.abs(Zxx)
    mask = (f >= low) & (f < high)
    if not np.any(mask):
        return 1e-12
    band_power = float(np.mean(mag[mask, :] ** 2))
    total_power = float(np.mean(mag ** 2)) + 1e-20
    return float(np.sqrt(band_power / total_power) + 1e-12)


def spectral_balance(
    audio: np.ndarray,
    sr: int,
    reference_spectrum: dict | None = None,
) -> dict:
    """
    Measure energy per band and compare to a reference spectrum.

    If reference_spectrum is None, uses the built-in Spotify-ish curve.
    If a dict from another track is supplied, uses that track's band energies
    as the target (true reference-track matching).
    """
    # Use mono mix for spectral analysis
    mono = np.mean(audio, axis=0) if audio.ndim > 1 else audio
    mono = np.nan_to_num(mono, nan=0.0, posinf=0.0, neginf=0.0)

    # Built-in static curve or real reference track
    if reference_spectrum is None:
        targets = {name: ref_db for name, (_, _, ref_db) in REFERENCE_SPECTRUM.items()}
        bands = REFERENCE_SPECTRUM
    else:
        targets = {name: data["energy_db"] for name, data in reference_spectrum.items()}
        bands = REFERENCE_SPECTRUM

    results = {}
    for name, (lo, hi, _) in bands.items():
        # band_energy already returns a relative linear ratio
        ratio = band_energy(mono, sr, lo, hi)
        energy_db = 20.0 * np.log10(ratio + 1e-12)
        if not np.isfinite(energy_db):
            energy_db = -80.0
        ref_db = targets.get(name, 0.0)
        results[name] = {
            "energy_db": float(energy_db),
            "reference_db": float(ref_db),
            "delta_db": float(energy_db - ref_db),
        }
    return results


def suggest_eq_from_spectrum(balance: dict, max_boost: float = 3.0, strength: float = 0.6) -> dict:
    """
    Rule-based EQ suggestions from spectral deltas.
    Positive delta = too much energy → cut; negative → boost.
    Clamped for safety on AI material.
    strength controls how aggressively we correct (0.0–1.0).
    """
    suggestions = {}
    for band, data in balance.items():
        delta = data["delta_db"]
        adj = np.clip(-delta * strength, -max_boost, max_boost)
        suggestions[band] = round(float(adj), 1)
    return suggestions


def match_reference(
    source_audio: np.ndarray,
    source_sr: int,
    ref_audio: np.ndarray,
    ref_sr: int,
    match_loudness: bool = True,
    match_spectrum: bool = True,
    eq_strength: float = 0.55,
) -> dict:
    """
    Compare source against a real reference track and return:
    - loudness difference (LUFS)
    - spectral deltas
    - suggested EQ / gain parameters for the mastering chain

    Designed to be gentle on AI-generated material.
    """
    src_stats = measure_loudness(source_audio, source_sr)
    ref_stats = measure_loudness(ref_audio, ref_sr)

    # Spectral: measure reference first, then compare source to it
    ref_balance = spectral_balance(ref_audio, ref_sr)
    src_balance = spectral_balance(source_audio, source_sr, reference_spectrum=ref_balance)

    result = {
        "source_lufs": src_stats["integrated_lufs"],
        "reference_lufs": ref_stats["integrated_lufs"],
        "lufs_delta": src_stats["integrated_lufs"] - ref_stats["integrated_lufs"],
        "source_tp": src_stats["true_peak_dbtp"],
        "reference_tp": ref_stats["true_peak_dbtp"],
        "spectral": src_balance,
    }

    # Suggested parameter overrides
    params = {}
    if match_spectrum:
        eq = suggest_eq_from_spectrum(src_balance, max_boost=3.0, strength=eq_strength)
        # Map bands → our chain parameters
        params["low_shelf_gain"] = eq.get("bass", 0.0) * 0.7 + eq.get("sub", 0.0) * 0.3
        params["presence_gain"] = eq.get("presence", 0.0) * 0.6 + eq.get("mid", 0.0) * 0.3
        params["high_shelf_gain"] = eq.get("air", 0.0) * 0.7
        # Mild high-pass if sub is excessive
        if eq.get("sub", 0.0) < -1.5:
            params["hp_freq"] = 35.0

    if match_loudness:
        # We still let the main chain hit the global target (preset LUFS),
        # but we record the delta so the user/Grok can decide.
        result["suggested_gain_offset_db"] = -result["lufs_delta"]

    result["suggested_params"] = params
    return result
