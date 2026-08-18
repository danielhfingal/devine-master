"""Source repair utilities – de-clipping for raw Suno / AI exports."""
from __future__ import annotations

import numpy as np
from scipy import interpolate, signal
from typing import Optional


def detect_clipping(audio: np.ndarray, threshold: float = 0.99) -> dict:
    if audio.ndim == 1:
        audio = audio[None, :]
    abs_a = np.abs(audio)
    clipped = abs_a >= threshold
    n_clipped = int(np.sum(clipped))
    n_total = max(abs_a.size, 1)
    frac = n_clipped / n_total
    if frac > 0.005:
        severity = "heavy"
    elif frac > 0.0008:
        severity = "moderate"
    elif frac > 0.0:
        severity = "light"
    else:
        severity = "none"
    return {
        "clipped_samples": n_clipped,
        "fraction": round(frac, 6),
        "severity": severity,
        "threshold": threshold,
    }


def _repair_channel(x: np.ndarray, threshold: float, strength: float, max_run: int) -> int:
    """Cubic-spline style repair of clipped runs. Returns samples repaired."""
    mask = np.abs(x) >= threshold
    idx = np.where(mask)[0]
    if len(idx) == 0:
        return 0

    repaired = 0
    i = 0
    n = len(x)
    while i < len(idx):
        start = idx[i]
        end = start
        while i + 1 < len(idx) and idx[i + 1] == end + 1:
            i += 1
            end = idx[i]
        i += 1
        run_len = end - start + 1
        if run_len > max_run:
            continue

        left = start - 1
        right = end + 1
        if left < 2 or right >= n - 2:
            continue

        # Use a few samples on each side for spline context
        ctx_l = max(0, left - 3)
        ctx_r = min(n, right + 4)
        known_idx = np.concatenate([
            np.arange(ctx_l, left + 1),
            np.arange(right, ctx_r),
        ])
        known_val = x[known_idx]
        try:
            # Cubic spline through known points
            cs = interpolate.CubicSpline(known_idx, known_val, bc_type="natural")
            fill_idx = np.arange(start, end + 1)
            bridge = cs(fill_idx)
        except Exception:
            bridge = np.linspace(x[left], x[right], run_len + 2)[1:-1]

        # Gentle peak restoration (sin bulge) but never above ~0.97
        t = np.linspace(0, 1, run_len)
        sign = np.sign(x[start]) or 1.0
        bulge = 1.0 + 0.12 * np.sin(np.pi * t)
        bridge = bridge * bulge
        bridge = np.clip(bridge, -0.97, 0.97)

        x[start:end + 1] = strength * bridge + (1.0 - strength) * x[start:end + 1]
        repaired += run_len
    return repaired


def declip(
    audio: np.ndarray,
    threshold: float = 0.97,
    strength: float = 0.85,
    passes: int = 2,
) -> tuple[np.ndarray, dict]:
    """
    Multi-pass de-clipper for heavily clipped Suno exports.

    - Pass 1: short runs (up to ~2 ms)
    - Pass 2: medium runs (up to ~5 ms) with lower strength
    Cubic spline interpolation + soft peak restoration.
    """
    if audio.ndim == 1:
        audio = audio[None, :]

    out = audio.copy().astype(np.float32)
    # Adaptive max run by sample rate assumption ~44.1–48k
    max_run_short = 96   # ~2 ms
    max_run_med = 240    # ~5 ms

    report = {
        "strength": strength,
        "threshold": threshold,
        "passes": passes,
        "channels": [],
    }

    for ch in range(out.shape[0]):
        total = 0
        x = out[ch]
        total += _repair_channel(x, threshold, strength, max_run_short)
        if passes >= 2:
            total += _repair_channel(x, threshold * 0.99, strength * 0.7, max_run_med)
        if passes >= 3:
            # Light low-pass on residual harshness in repaired zones only – skip for transparency
            pass
        out[ch] = x
        report["channels"].append({"ch": ch, "repaired": total})

    out = np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)
    return out, report
