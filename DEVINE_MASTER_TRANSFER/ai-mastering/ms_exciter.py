"""M/S width control and light harmonic exciter – transparent, AI-friendly."""
from __future__ import annotations

import numpy as np
from scipy import signal
from typing import Optional


def to_ms(audio: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """L/R → Mid/Side. audio shape (2, samples)."""
    L, R = audio[0], audio[1]
    mid = (L + R) * 0.5
    side = (L - R) * 0.5
    return mid, side


def from_ms(mid: np.ndarray, side: np.ndarray) -> np.ndarray:
    """Mid/Side → L/R."""
    L = mid + side
    R = mid - side
    return np.stack([L, R])


def ms_width(
    audio: np.ndarray,
    width: float = 1.0,
    mono_bass_hz: float = 120.0,
    sr: int = 44100,
) -> tuple[np.ndarray, dict]:
    """
    Simple M/S width control.

    width:
      0.0 = mono
      1.0 = original
      1.5 = wider (use carefully on AI material)

    mono_bass_hz: force side content below this frequency to mono
                  (keeps low end solid for streaming / vinyl safety).
    """
    if audio.shape[0] < 2:
        return audio, {"width": width, "note": "mono input – skipped"}

    mid, side = to_ms(audio)

    # Mono bass: high-pass the side channel
    if mono_bass_hz > 20 and sr > 0:
        nyq = sr / 2.0
        norm = min(mono_bass_hz / nyq, 0.45)
        if norm > 0.001:
            b, a = signal.butter(2, norm, btype="high")
            side = signal.filtfilt(b, a, side)

    side = side * float(np.clip(width, 0.0, 2.0))
    out = from_ms(mid, side)
    out = np.nan_to_num(out.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)

    # Soft peak safety after width change
    peak = float(np.max(np.abs(out)))
    if peak > 1.0:
        out = out / peak

    return out, {
        "width": width,
        "mono_bass_hz": mono_bass_hz,
        "note": "applied",
    }


def harmonic_exciter(
    audio: np.ndarray,
    drive: float = 0.15,
    mix: float = 0.25,
    focus_hz: float = 3500.0,
    sr: int = 44100,
) -> tuple[np.ndarray, dict]:
    """
    Light harmonic exciter / soft saturation.

    - Soft tanh saturation for even/odd harmonics
    - High-shelf emphasis so presence/air get most of the colour
    - Parallel mix so the dry signal stays intact

    Keep drive and mix low on AI material – easy to overdo.
    """
    drive = float(np.clip(drive, 0.0, 1.0))
    mix = float(np.clip(mix, 0.0, 1.0))
    if drive < 0.01 or mix < 0.01:
        return audio, {"drive": drive, "mix": mix, "note": "bypassed"}

    x = audio.astype(np.float32)
    # Pre-emphasis (gentle high shelf via simple first-order)
    # Approximate: boost above focus_hz
    nyq = sr / 2.0
    norm = min(max(focus_hz / nyq, 0.01), 0.9)
    b, a = signal.butter(1, norm, btype="high")
    high = signal.filtfilt(b, a, x, axis=-1)

    # Soft saturation
    saturated = np.tanh(high * (1.0 + drive * 4.0)) / (1.0 + drive * 0.5)

    # Parallel blend
    wet = (1.0 - mix) * x + mix * (x + saturated * 0.5)
    wet = np.nan_to_num(wet.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)

    peak = float(np.max(np.abs(wet)))
    if peak > 0.99:
        wet = wet * (0.99 / peak)

    return wet, {
        "drive": drive,
        "mix": mix,
        "focus_hz": focus_hz,
        "note": "applied",
    }
