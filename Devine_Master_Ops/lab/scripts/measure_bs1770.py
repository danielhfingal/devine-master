#!/usr/bin/env python3
"""BS.1770-4-style integrated LUFS + 4x cubic true peak (offline hardening)."""
from __future__ import annotations
import math
from typing import Any, Dict, Tuple
import numpy as np

def _k_weight_sos(sr: float):
    def bilinear_hp(fc, sr, q=0.5):
        w0 = 2 * math.pi * fc / sr
        alpha = math.sin(w0) / (2 * q)
        cosw = math.cos(w0)
        b0 = (1 + cosw) / 2
        b1 = -(1 + cosw)
        b2 = (1 + cosw) / 2
        a0 = 1 + alpha
        a1 = -2 * cosw
        a2 = 1 - alpha
        return np.array([b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0])
    def bilinear_highshelf(fc, sr, gain_db=4.0, q=0.707):
        A = 10 ** (gain_db / 40)
        w0 = 2 * math.pi * fc / sr
        alpha = math.sin(w0) / (2 * q)
        cosw = math.cos(w0)
        b0 = A * ((A + 1) + (A - 1) * cosw + 2 * math.sqrt(A) * alpha)
        b1 = -2 * A * ((A - 1) + (A + 1) * cosw)
        b2 = A * ((A + 1) + (A - 1) * cosw - 2 * math.sqrt(A) * alpha)
        a0 = (A + 1) - (A - 1) * cosw + 2 * math.sqrt(A) * alpha
        a1 = 2 * ((A - 1) - (A + 1) * cosw)
        a2 = (A + 1) - (A - 1) * cosw - 2 * math.sqrt(A) * alpha
        return np.array([b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0])
    return bilinear_highshelf(1500.0, sr, 4.0), bilinear_hp(38.0, sr, 0.5)

def _sosfilt(sos_ab, x: np.ndarray) -> np.ndarray:
    b0, b1, b2, a1, a2 = sos_ab
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(x.shape[0]):
        xn = float(x[i])
        yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        y[i] = yn
        x2, x1 = x1, xn
        y2, y1 = y1, yn
    return y

def _true_peak_dbtp_mono(x: np.ndarray, overs: int = 4) -> float:
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    n = x.shape[0]
    if n < 4:
        return -120.0 if peak < 1e-12 else 20.0 * math.log10(peak)
    for i in range(1, n - 2):
        y0, y1, y2, y3 = float(x[i - 1]), float(x[i]), float(x[i + 1]), float(x[i + 2])
        for k in range(1, overs):
            t = k / overs
            a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3
            a1 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3
            a2 = -0.5 * y0 + 0.5 * y2
            a3 = y1
            yt = ((a0 * t + a1) * t + a2) * t + a3
            peak = max(peak, abs(yt))
    return -120.0 if peak < 1e-12 else 20.0 * math.log10(peak)

def _true_peak_dbtp(x: np.ndarray, overs: int = 4) -> float:
    if x.ndim == 2:
        peak = 0.0
        for c in range(x.shape[1]):
            p = 10 ** (_true_peak_dbtp_mono(x[:, c], overs) / 20.0)
            peak = max(peak, p)
        return -120.0 if peak < 1e-12 else 20.0 * math.log10(peak)
    return _true_peak_dbtp_mono(x, overs)

def measure_bs1770(audio: np.ndarray, sr: int, max_sec: float = 60.0) -> Dict[str, Any]:
    if audio.ndim == 1:
        audio = audio[:, None]
    n, ch = audio.shape
    max_n = int(sr * max_sec)
    off = 0
    if n > max_n:
        off = (n - max_n) // 2
        audio = audio[off : off + max_n]
        n = audio.shape[0]
    pre, rlb = _k_weight_sos(float(sr))
    filtered = []
    for c in range(ch):
        y = _sosfilt(pre, audio[:, c].astype(np.float64))
        y = _sosfilt(rlb, y)
        filtered.append(y)
    filtered = np.stack(filtered, axis=1)
    block = max(1, int(sr * 0.4))
    hop = max(1, int(block * 0.25))
    z = []
    for start in range(0, n - block + 1, hop):
        seg = filtered[start : start + block]
        ms = np.mean(seg ** 2, axis=0)
        z.append(float(np.sum(ms)))
    if not z:
        return {"lufs": -70.0, "tp": -120.0, "integratedLUFS": -70.0, "truePeakdBTP": -120.0,
                "method": "BS.1770-4-style+cubicTP4x", "windowNote": "empty", "sampleRate": sr, "channels": ch}
    z = np.array(z, dtype=np.float64)
    with np.errstate(divide="ignore"):
        lj = -0.691 + 10.0 * np.log10(np.maximum(z, 1e-20))
    abs_gate = lj > -70.0
    if not np.any(abs_gate):
        integrated = -70.0
    else:
        z_abs = z[abs_gate]
        gamma = -0.691 + 10.0 * np.log10(np.mean(z_abs) + 1e-20) - 10.0
        rel = lj > gamma
        use = abs_gate & rel
        if not np.any(use):
            use = abs_gate
        integrated = -0.691 + 10.0 * np.log10(np.mean(z[use]) + 1e-20)
    tp = _true_peak_dbtp(audio.astype(np.float64), overs=4)
    win = "full" if off == 0 else f"centre_{int(max_sec)}s"
    return {"lufs": float(integrated), "tp": float(tp), "integratedLUFS": float(integrated),
            "truePeakdBTP": float(tp), "method": "BS.1770-4-style+cubicTP4x",
            "windowNote": win, "sampleRate": sr, "channels": ch}

def load_audio(path: Path) -> Tuple[np.ndarray, int]:
    import soundfile as sf
    data, sr = sf.read(str(path), always_2d=True)
    return data.astype(np.float64), int(sr)
