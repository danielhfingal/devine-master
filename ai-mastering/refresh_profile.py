#!/usr/bin/env python3
"""
One-command refresh of the D.Devine reference profile.

Usage:
    python refresh_profile.py

Scans tracks/mastered/ for all WAV/FLAC files, re-computes the
catalogue profile, and overwrites:
    tracks/d_devine_reference_profile.json
    tracks/d_devine_reference_profile.txt

Add new final Spotify masters to tracks/mastered/, then run this.
The mastering tool will automatically pick up the updated numbers.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from scipy import signal

# ---------------------------------------------------------------------------
# Paths (relative to project root)
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
MASTERED_DIR = ROOT / "tracks" / "mastered"
OUT_JSON = ROOT / "tracks" / "d_devine_reference_profile.json"
OUT_TXT = ROOT / "tracks" / "d_devine_reference_profile.txt"

BANDS = {
    "sub": (20, 60),
    "bass": (60, 250),
    "low_mid": (250, 500),
    "mid": (500, 2000),
    "presence": (2000, 6000),
    "air": (6000, 16000),
}

SUPPORTED = {".wav", ".flac", ".aiff", ".aif"}


def load(path: Path):
    audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
    return audio.T, sr


def true_peak_dbtp(audio: np.ndarray, sr: int, overs: int = 4) -> float:
    peaks = []
    for ch in range(audio.shape[0]):
        up = signal.resample_poly(audio[ch], up=overs, down=1)
        peaks.append(np.max(np.abs(up)))
    return 20.0 * np.log10(float(np.max(peaks)) + 1e-12)


def crest_factor_db(audio: np.ndarray, tp_db: float) -> float:
    peak = 10.0 ** (tp_db / 20.0)
    rms = float(np.sqrt(np.mean(audio ** 2)))
    if rms < 1e-12:
        return 0.0
    return 20.0 * np.log10(peak / rms)


def band_energy_db(mono: np.ndarray, sr: int, lo: float, hi: float) -> float:
    nperseg = min(4096, max(256, len(mono) // 4))
    f, _, Zxx = signal.stft(mono, fs=sr, nperseg=nperseg, noverlap=nperseg // 2)
    mag = np.abs(Zxx)
    mask = (f >= lo) & (f < hi)
    if not np.any(mask):
        return -80.0
    band_power = float(np.mean(mag[mask, :] ** 2))
    total_power = float(np.mean(mag ** 2)) + 1e-20
    return 20.0 * np.log10(np.sqrt(band_power / total_power) + 1e-12)


def stereo_width(audio: np.ndarray) -> dict:
    if audio.shape[0] < 2:
        return {"correlation": 1.0, "side_to_mid_db": -40.0, "width_note": "mono"}
    L, R = audio[0], audio[1]
    corr = 1.0
    if L.std() > 1e-9 and R.std() > 1e-9:
        c = float(np.corrcoef(L, R)[0, 1])
        if not np.isnan(c):
            corr = c
    mid = (L + R) * 0.5
    side = (L - R) * 0.5
    mid_rms = float(np.sqrt(np.mean(mid ** 2))) + 1e-12
    side_rms = float(np.sqrt(np.mean(side ** 2))) + 1e-12
    side_to_mid = float(np.clip(20.0 * np.log10(side_rms / mid_rms), -40.0, 10.0))
    if corr > 0.95:
        note = "very narrow / near-mono"
    elif corr > 0.80:
        note = "narrow / centered"
    elif corr > 0.50:
        note = "moderate width"
    else:
        note = "wide / spacious"
    return {
        "correlation": round(corr, 3),
        "side_to_mid_db": round(side_to_mid, 2),
        "width_note": note,
    }


def analyze_one(path: Path) -> dict:
    audio, sr = load(path)
    mono = np.mean(audio, axis=0)
    meter = pyln.Meter(sr, block_size=0.400)
    lufs = float(meter.integrated_loudness(audio.T))
    tp = true_peak_dbtp(audio, sr)
    crest = crest_factor_db(audio, tp)
    spectrum = {name: round(band_energy_db(mono, sr, lo, hi), 2)
                for name, (lo, hi) in BANDS.items()}
    return {
        "file": path.name,
        "duration_s": round(audio.shape[1] / sr, 1),
        "sample_rate": sr,
        "integrated_lufs": round(lufs, 2),
        "true_peak_dbtp": round(tp, 2),
        "crest_factor_db": round(crest, 2),
        "spectrum_db": spectrum,
        "stereo": stereo_width(audio),
    }


def main():
    files = sorted(
        p for p in MASTERED_DIR.iterdir()
        if p.suffix.lower() in SUPPORTED
    )
    if not files:
        print(f"No audio files found in {MASTERED_DIR}")
        print("Drop final Spotify masters there, then re-run.")
        sys.exit(1)

    print(f"Scanning {len(files)} masters in {MASTERED_DIR.name}/ …")
    results = []
    for f in files:
        print(f"  • {f.name}")
        try:
            results.append(analyze_one(f))
        except Exception as e:
            print(f"    ERROR: {e}")

    if not results:
        print("No successful analyses.")
        sys.exit(1)

    lufs = [r["integrated_lufs"] for r in results]
    tp = [r["true_peak_dbtp"] for r in results]
    crest = [r["crest_factor_db"] for r in results]
    corr = [r["stereo"]["correlation"] for r in results]
    side = [r["stereo"]["side_to_mid_db"] for r in results]

    spectrum_avg = {
        b: round(float(np.mean([r["spectrum_db"][b] for r in results])), 2)
        for b in BANDS
    }
    spectrum_std = {
        b: round(float(np.std([r["spectrum_db"][b] for r in results])), 2)
        for b in BANDS
    }

    profile = {
        "artist": "D.Devine",
        "description": "Reference profile from final Spotify masters (Suno → sunomaster.com → Audacity)",
        "track_count": len(results),
        "tracks": results,
        "summary": {
            "integrated_lufs": {
                "mean": round(float(np.mean(lufs)), 2),
                "median": round(float(np.median(lufs)), 2),
                "min": round(float(np.min(lufs)), 2),
                "max": round(float(np.max(lufs)), 2),
                "std": round(float(np.std(lufs)), 2),
            },
            "true_peak_dbtp": {
                "mean": round(float(np.mean(tp)), 2),
                "median": round(float(np.median(tp)), 2),
                "min": round(float(np.min(tp)), 2),
                "max": round(float(np.max(tp)), 2),
            },
            "crest_factor_db": {
                "mean": round(float(np.mean(crest)), 2),
                "median": round(float(np.median(crest)), 2),
                "min": round(float(np.min(crest)), 2),
                "max": round(float(np.max(crest)), 2),
            },
            "spectral_balance_db": spectrum_avg,
            "spectral_balance_std": spectrum_std,
            "stereo": {
                "correlation_mean": round(float(np.mean(corr)), 3),
                "side_to_mid_db_mean": round(float(np.mean(side)), 2),
                "typical_width": (
                    "very narrow / near-mono" if np.mean(corr) > 0.95
                    else "narrow / centered" if np.mean(corr) > 0.80
                    else "moderate width" if np.mean(corr) > 0.50
                    else "wide / spacious"
                ),
            },
        },
        "recommended_mastering_targets": {
            "target_lufs": round(float(np.median(lufs)), 1),
            "target_tp": -1.0,
            "notes": (
                "Median LUFS is the primary loudness target for new material. "
                "Keep true-peak ≤ -1.0 dBTP for streaming safety."
            ),
        },
    }

    OUT_JSON.write_text(json.dumps(profile, indent=2))
    s = profile["summary"]
    lines = [
        "=" * 62,
        "D.DEVINE REFERENCE PROFILE (refreshed)",
        f"Tracks analysed: {profile['track_count']}",
        "=" * 62,
        "",
        "LOUDNESS",
        f"  Integrated LUFS   mean {s['integrated_lufs']['mean']:>6.1f}   "
        f"median {s['integrated_lufs']['median']:>6.1f}   "
        f"range [{s['integrated_lufs']['min']:.1f} … {s['integrated_lufs']['max']:.1f}]",
        f"  True Peak dBTP    mean {s['true_peak_dbtp']['mean']:>6.1f}   "
        f"median {s['true_peak_dbtp']['median']:>6.1f}   "
        f"range [{s['true_peak_dbtp']['min']:.1f} … {s['true_peak_dbtp']['max']:.1f}]",
        "",
        "DYNAMICS",
        f"  Crest factor dB   mean {s['crest_factor_db']['mean']:>6.1f}   "
        f"median {s['crest_factor_db']['median']:>6.1f}",
        "",
        "SPECTRAL BALANCE (relative energy, dB)",
        f"  Sub      (20-60)     {s['spectral_balance_db']['sub']:>6.1f}",
        f"  Bass     (60-250)    {s['spectral_balance_db']['bass']:>6.1f}",
        f"  Low-mid  (250-500)   {s['spectral_balance_db']['low_mid']:>6.1f}",
        f"  Mid      (500-2k)    {s['spectral_balance_db']['mid']:>6.1f}",
        f"  Presence (2k-6k)     {s['spectral_balance_db']['presence']:>6.1f}",
        f"  Air      (6k-16k)    {s['spectral_balance_db']['air']:>6.1f}",
        "",
        "STEREO",
        f"  Avg correlation      {s['stereo']['correlation_mean']:.3f}  ({s['stereo']['typical_width']})",
        "",
        f"Recommended target → {profile['recommended_mastering_targets']['target_lufs']} LUFS / "
        f"{profile['recommended_mastering_targets']['target_tp']} dBTP",
        "=" * 62,
    ]
    text = "\n".join(lines)
    OUT_TXT.write_text(text)
    print()
    print(text)
    print(f"\nUpdated:\n  {OUT_JSON}\n  {OUT_TXT}")


if __name__ == "__main__":
    main()
