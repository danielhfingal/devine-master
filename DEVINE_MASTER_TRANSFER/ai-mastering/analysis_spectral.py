"""Spectral balance helpers (split so TP-strict analysis core stays small)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import signal

REFERENCE_SPECTRUM = {
    "sub": (20, 60, 19.2),
    "bass": (60, 250, 18.1),
    "low_mid": (250, 500, 7.4),
    "mid": (500, 2000, -0.4),
    "presence": (2000, 6000, -8.6),
    "air": (6000, 16000, -16.7),
}

PROFILE_JSON = Path(__file__).resolve().parents[1] / "tracks" / "d_devine_reference_profile.json"


def load_devine_profile(path: Path | None = None):
    path = path or PROFILE_JSON
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def band_energy(audio, sr: int, low: float, high: float) -> float:
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


def spectral_balance(audio, sr: int, reference_spectrum=None) -> dict:
    mono = np.mean(audio, axis=0) if getattr(audio, "ndim", 1) > 1 else audio
    mono = np.nan_to_num(mono, nan=0.0, posinf=0.0, neginf=0.0)
    if reference_spectrum is None:
        targets = {name: ref_db for name, (_, _, ref_db) in REFERENCE_SPECTRUM.items()}
        bands = REFERENCE_SPECTRUM
    else:
        targets = {name: data["energy_db"] for name, data in reference_spectrum.items()}
        bands = REFERENCE_SPECTRUM
    results = {}
    for name, (lo, hi, _) in bands.items():
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
    suggestions = {}
    for band, data in balance.items():
        delta = data["delta_db"]
        adj = np.clip(-delta * strength, -max_boost, max_boost)
        suggestions[band] = round(float(adj), 1)
    return suggestions


def match_reference(source_audio, source_sr, ref_audio, ref_sr, match_loudness=True, match_spectrum=True, eq_strength=0.55) -> dict:
    from analysis import measure_loudness
    src_stats = measure_loudness(source_audio, source_sr)
    ref_stats = measure_loudness(ref_audio, ref_sr)
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
    params = {}
    if match_spectrum:
        eq = suggest_eq_from_spectrum(src_balance, max_boost=3.0, strength=eq_strength)
        params["low_shelf_gain"] = eq.get("bass", 0.0) * 0.7 + eq.get("sub", 0.0) * 0.3
        params["presence_gain"] = eq.get("presence", 0.0) * 0.6 + eq.get("mid", 0.0) * 0.3
        params["high_shelf_gain"] = eq.get("air", 0.0) * 0.7
        if eq.get("sub", 0.0) < -1.5:
            params["hp_freq"] = 35.0
    if match_loudness:
        result["suggested_gain_offset_db"] = -result["lufs_delta"]
    result["suggested_params"] = params
    return result
