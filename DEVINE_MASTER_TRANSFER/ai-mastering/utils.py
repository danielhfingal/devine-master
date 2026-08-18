"""Audio I/O and basic helpers."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Union

import numpy as np
import soundfile as sf
from scipy import signal

PathLike = Union[str, Path]

# RouteNote / Spotify friendly defaults
EXPORT_FORMATS = {
    "flac": {"subtype": "PCM_16", "ext": ".flac", "desc": "16-bit FLAC @ 44.1 kHz (RouteNote required)"},
    "flac24": {"subtype": "PCM_24", "ext": ".flac", "desc": "24-bit FLAC (archive / hi-res stores)"},
    "wav32": {"subtype": "FLOAT", "ext": ".wav", "desc": "32-bit float WAV (archive only — not RouteNote)"},
    "wav24": {"subtype": "PCM_24", "ext": ".wav", "desc": "24-bit WAV (archive only — not RouteNote)"},
    "mp3": {"subtype": None, "ext": ".mp3", "desc": "320 kbps MP3 (RouteNote alternative)"},
}


def load_audio(path: PathLike) -> tuple[np.ndarray, int]:
    """Load audio as float32. Returns (audio, sample_rate) shape (channels, samples)."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")
    audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
    return audio.T, sr


def resample(audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    """High-quality polyphase resample to target_sr (e.g. 44100)."""
    if orig_sr == target_sr:
        return audio
    gcd = np.gcd(orig_sr, target_sr)
    up = target_sr // gcd
    down = orig_sr // gcd
    channels = []
    for ch in range(audio.shape[0]):
        channels.append(signal.resample_poly(audio[ch], up, down).astype(np.float32))
    min_len = min(c.shape[0] for c in channels)
    return np.stack([c[:min_len] for c in channels])


def save_audio(
    path: PathLike,
    audio: np.ndarray,
    sr: int,
    fmt: str = "flac",
    target_sr: int | None = 44100,
) -> Path:
    """
    Save (channels, samples) float32 audio.

    fmt: flac | flac24 | wav32 | wav24 | mp3
    target_sr: resample before export (default 44100 for RouteNote/Spotify).
               Pass None to keep original sample rate.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    fmt = fmt.lower().strip()
    if fmt not in EXPORT_FORMATS:
        raise ValueError(f"Unknown format '{fmt}'. Choose from: {list(EXPORT_FORMATS)}")

    info = EXPORT_FORMATS[fmt]
    if path.suffix.lower() not in {".wav", ".mp3", ".flac", ".aiff"}:
        path = path.with_suffix(info["ext"])
    elif fmt == "mp3" and path.suffix.lower() != ".mp3":
        path = path.with_suffix(".mp3")
    elif fmt in ("flac", "flac24") and path.suffix.lower() != ".flac":
        path = path.with_suffix(".flac")
    elif fmt.startswith("wav") and path.suffix.lower() != ".wav":
        path = path.with_suffix(".wav")

    audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

    if target_sr is not None and target_sr != sr:
        audio = resample(audio, sr, target_sr)
        sr = target_sr

    if fmt == "mp3":
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            sf.write(str(tmp_path), audio.T, sr, subtype="FLOAT")
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(tmp_path),
                "-codec:a", "libmp3lame", "-b:a", "320k",
                str(path),
            ]
            subprocess.run(cmd, check=True)
        finally:
            tmp_path.unlink(missing_ok=True)
    elif fmt in ("flac", "flac24"):
        sf.write(str(path), audio.T, sr, format="FLAC", subtype=info["subtype"])
    else:
        sf.write(str(path), audio.T, sr, subtype=info["subtype"])

    return path


def ensure_stereo(audio: np.ndarray) -> np.ndarray:
    """Force stereo for consistent processing."""
    if audio.ndim == 1:
        return np.stack([audio, audio])
    if audio.shape[0] == 1:
        return np.vstack([audio, audio])
    return audio[:2]
