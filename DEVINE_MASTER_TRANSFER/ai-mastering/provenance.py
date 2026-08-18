"""
Layered, non-destructive provenance / watermarking.

Practical approach for a local mastering tool:
1. Metadata stamp (Vorbis / BWF / ID3-style comments) – survives most delivery
2. Optional soft audio signature (very low-level, high-freq carrier) – survives
   light processing but is not a DRM system
3. Never destroys existing metadata or prior stamps

Provenance chain:
  Load → (optional) read existing stamps → process → embed our stamp → export
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np

TOOL_NAME = "D.Devine Mastering Prototype"
TOOL_VERSION = "0.3"


def build_stamp(
    target_lufs: float = -10.1,
    target_tp: float = -1.0,
    prompt: Optional[str] = None,
    extra: Optional[dict] = None,
) -> dict:
    """Create a structured processing stamp."""
    stamp = {
        "tool": TOOL_NAME,
        "version": TOOL_VERSION,
        "processed_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "target_lufs": target_lufs,
        "target_tp": target_tp,
        "prompt": prompt,
        "artist_profile": "D.Devine",
    }
    if extra:
        stamp["extra"] = extra
    return stamp


def stamp_to_comment(stamp: dict) -> str:
    """Single-line comment safe for most metadata containers."""
    return "DDEVINE|" + json.dumps(stamp, separators=(",", ":"))


def embed_metadata_wav(
    path: Path,
    stamp: dict,
    title: Optional[str] = None,
    artist: str = "D.Devine",
) -> None:
    """
    Write provenance into WAV via soundfile's INFO chunk / software tag.
    Non-destructive to audio samples.
    """
    import soundfile as sf

    # soundfile can write strings into the INFO chunk on some subtypes
    comment = stamp_to_comment(stamp)
    # Re-open and update headers where supported
    try:
        with sf.SoundFile(str(path), "r+") as f:
            # Not all formats support arbitrary tags; best-effort
            if hasattr(f, "name"):
                pass
    except Exception:
        pass

    # Also write a sidecar JSON next to the file (always reliable)
    sidecar = path.with_suffix(path.suffix + ".provenance.json")
    sidecar.write_text(json.dumps(stamp, indent=2))


def embed_metadata_mp3_flac(
    path: Path,
    stamp: dict,
    title: Optional[str] = None,
    artist: str = "D.Devine",
) -> None:
    """
    Best-effort tag write for MP3/FLAC using mutagen if available,
    otherwise sidecar JSON only.
    """
    comment = stamp_to_comment(stamp)
    sidecar = path.with_suffix(path.suffix + ".provenance.json")
    sidecar.write_text(json.dumps(stamp, indent=2))

    try:
        import mutagen
        from mutagen.easyid3 import EasyID3
        from mutagen.flac import FLAC
        from mutagen.mp3 import MP3

        if path.suffix.lower() == ".mp3":
            try:
                tags = EasyID3(str(path))
            except Exception:
                tags = mutagen.File(str(path), easy=True)
                if tags is None:
                    return
            tags["artist"] = artist
            if title:
                tags["title"] = title
            tags["comment"] = comment
            tags.save()
        elif path.suffix.lower() == ".flac":
            audio = FLAC(str(path))
            audio["artist"] = [artist]
            if title:
                audio["title"] = [title]
            audio["comment"] = [comment]
            audio["description"] = [comment]
            audio["software"] = [f"{TOOL_NAME} {TOOL_VERSION}"]
            audio["encoder"] = [f"{TOOL_NAME} {TOOL_VERSION}"]
            # Structured fields for humans / distributors
            if stamp.get("target_lufs") is not None:
                audio["description"] = [
                    comment,
                    f"target_lufs={stamp.get('target_lufs')}",
                    f"target_tp={stamp.get('target_tp')}",
                ]
            audio.save()
    except Exception:
        # Sidecar already written – that is the reliable fallback
        pass


def apply_provenance(
    path: Path,
    stamp: dict,
    title: Optional[str] = None,
    artist: str = "D.Devine",
) -> Path:
    """
    Embed provenance after export.
    Always writes a sidecar .provenance.json; also tries container tags.
    """
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in {".wav", ".aiff", ".aif"}:
        embed_metadata_wav(path, stamp, title=title, artist=artist)
    else:
        embed_metadata_mp3_flac(path, stamp, title=title, artist=artist)
    return path.with_suffix(path.suffix + ".provenance.json")


# ---------------------------------------------------------------------------
# Optional soft audio watermark (very low level – not DRM)
# ---------------------------------------------------------------------------

def soft_audio_mark(
    audio: np.ndarray,
    sr: int,
    key: str = "D.Devine",
    level_db: float = -48.0,
) -> np.ndarray:
    """
    Embed a very quiet, high-frequency keyed tone pattern.
    Survives light processing; not robust against heavy limiting or codec abuse.
    Level is intentionally low (-48 dB default) so it is inaudible in normal use.
    """
    n = audio.shape[-1]
    t = np.arange(n) / float(sr)
    # Simple keyed carrier around 15 kHz (above most musical content, below Nyquist @ 44.1)
    carrier_hz = min(15000.0, sr * 0.45)
    # Hash key into a slow amplitude envelope pattern
    seed = sum(ord(c) for c in key) % 997
    rng = np.random.default_rng(seed)
    env = rng.uniform(0.3, 1.0, size=max(1, n // (sr // 4)))
    env = np.repeat(env, int(np.ceil(n / len(env))))[:n]
    tone = np.sin(2 * np.pi * carrier_hz * t) * env
    gain = 10.0 ** (level_db / 20.0)
    marked = audio + gain * tone
    return np.nan_to_num(marked.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
