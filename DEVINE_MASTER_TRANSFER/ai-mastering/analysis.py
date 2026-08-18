"""Loudness, true-peak, and spectral balance analysis."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np
import pyloudnorm as pyln
from scipy import signal


def measure_true_peak(audio: np.ndarray, sr: int, overs: int = 4) -> float:
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
    max_iterations: int = 6,
    margin_db: float = 0.12,
) -> tuple[np.ndarray, dict]:
    """Strict true-peak limiter: final TP must be <= target_tp."""
    audio = np.nan_to_num(audio.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    report: dict = {
        "iterations": [],
        "final_tp": None,
        "method": "measure_then_ceiling_strict",
        "target_tp": target_tp,
        "margin_db": margin_db,
    }
    working = audio.copy()
    total_gain_db = 0.0
    work_target = target_tp - margin_db
    ceiling = 10.0 ** (work_target / 20.0)
    for i in range(max_iterations):
        tp = measure_true_peak(working, sr, overs=overs)
        report["iterations"].append({"iter": i, "tp_dbtp": round(float(tp), 3)})
        if tp <= target_tp:
            break
        reduction_db = float(np.clip((tp - work_target), 0.05, 6.0))
        working = working * (10.0 ** (-reduction_db / 20.0))
        total_gain_db -= reduction_db
    peak = float(np.max(np.abs(working)))
    if peak > ceiling:
        working = working * (ceiling / peak)
        total_gain_db += 20.0 * np.log10(max(ceiling / (peak + 1e-12), 1e-12))
    working = np.nan_to_num(working, nan=0.0, posinf=0.0, neginf=0.0)
    final_tp = measure_true_peak(working, sr, overs=overs)
    if final_tp > target_tp:
        extra = float(final_tp - work_target)
        working = working * (10.0 ** (-extra / 20.0))
        total_gain_db -= extra
        peak = float(np.max(np.abs(working)))
        if peak > ceiling:
            working = working * (ceiling / peak)
        final_tp = measure_true_peak(working, sr, overs=overs)
    report["final_tp"] = round(float(final_tp), 3)
    report["gain_applied_db"] = round(total_gain_db, 2)
    report["compliant"] = bool(final_tp <= target_tp + 1e-6)
    return working, report


def measure_loudness(audio: np.ndarray, sr: int) -> dict:
    meter = pyln.Meter(sr, block_size=0.400)
    integrated = meter.integrated_loudness(audio.T)
    true_peak_db = measure_true_peak(audio, sr, overs=4)
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


DEFAULT_TARGET_LUFS = -10.1
DEFAULT_TARGET_TP = -1.0


def gain_to_target(current_lufs: float, target_lufs: float = DEFAULT_TARGET_LUFS) -> float:
    if not np.isfinite(current_lufs) or not np.isfinite(target_lufs):
        return 1.0
    diff = float(np.clip(target_lufs - current_lufs, -24.0, 24.0))
    return 10.0 ** (diff / 20.0)


def measure_crest_factor(audio: np.ndarray, use_true_peak: bool = False, sr: int = 44100) -> float:
    if use_true_peak:
        peak_db = measure_true_peak(audio, sr)
        peak = 10.0 ** (peak_db / 20.0)
    else:
        peak = np.max(np.abs(audio))
    rms = np.sqrt(np.mean(audio ** 2))
    if rms < 1e-12:
        return 0.0
    return 20.0 * np.log10(peak / rms)
