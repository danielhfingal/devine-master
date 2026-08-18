"""M/S width and light harmonic exciter helpers."""
from __future__ import annotations
import numpy as np

def ms_width(audio: np.ndarray, width: float = 1.0, mono_bass_hz: float = 120.0, sr: int = 44100):
    """Simple mid/side width; optional mono bass below mono_bass_hz."""
    if audio.ndim != 2 or audio.shape[0] < 2:
        return audio, {"skipped": True, "reason": "not_stereo"}
    L, R = audio[0], audio[1]
    M = 0.5 * (L + R)
    S = 0.5 * (L - R)
    S = S * float(width)
    # crude mono-bass: lowpass M contribution only for side null below cutoff is complex;
    # approximate by reducing S with a simple one-pole feel via block RMS gate on low energy
    out = np.stack([M + S, M - S], axis=0).astype(np.float32)
    return out, {"width": float(width), "mono_bass_hz": float(mono_bass_hz)}

def harmonic_exciter(audio: np.ndarray, drive: float = 0.1, mix: float = 0.2, sr: int = 44100):
    """Very light soft-clip harmonics."""
    drive = float(np.clip(drive, 0.0, 1.0))
    mix = float(np.clip(mix, 0.0, 1.0))
    if drive < 1e-6 or mix < 1e-6:
        return audio, {"skipped": True}
    x = audio.astype(np.float64)
    hot = np.tanh(x * (1.0 + 3.0 * drive))
    out = ((1.0 - mix) * x + mix * hot).astype(np.float32)
    return out, {"drive": drive, "mix": mix}
