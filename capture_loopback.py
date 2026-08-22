#!/usr/bin/env python3
"""
DEVINE MASTER — system loopback capture (Windows-first)

Records what you are hearing (Suno in browser, etc.) to:
  captures/YYYYMMDD_HHMM_source_capture.wav

Also writes captures/LAST_CAPTURE.txt for a quick handoff into SourceCast A.

Design (locked):
  - Priority: system loopback
  - Format: as delivered by the loopback stream (PCM WAV)
  - Length: demos under ~10 minutes (default max 600 s)
  - After capture: path printed + LAST_CAPTURE.txt (load in desk)

Usage:
  python tools/capture_loopback.py
  python tools/capture_loopback.py --seconds 180
  python tools/capture_loopback.py --list-devices
"""

from __future__ import annotations

import argparse
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths: repo root = parent of tools/
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = ROOT / "captures"
LAST_CAPTURE_NAME = "LAST_CAPTURE.txt"


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def ensure_deps() -> None:
    missing = []
    try:
        import numpy  # noqa: F401
    except ImportError:
        missing.append("numpy")
    try:
        import soundfile  # noqa: F401
    except ImportError:
        missing.append("soundfile")
    try:
        import soundcard  # noqa: F401
    except ImportError:
        missing.append("soundcard")
    if missing:
        eprint("Missing packages:", ", ".join(missing))
        eprint("Install with:")
        eprint("  python -m pip install -r tools/requirements-capture.txt")
        sys.exit(1)


def list_devices() -> None:
    import soundcard as sc

    print("Speakers:")
    for s in sc.all_speakers():
        print(f"  [speaker] {s.name!r}")
    print("Microphones (includes loopback candidates):")
    for m in sc.all_microphones(include_loopback=True):
        print(f"  [mic/loop] {m.name!r}")


def find_loopback_mic():
    """Prefer loopback tied to the default speaker; else first loopback mic."""
    import soundcard as sc

    speaker = sc.default_speaker()
    # soundcard: get_microphone with include_loopback matches speaker name
    try:
        mic = sc.get_microphone(id=str(speaker.name), include_loopback=True)
        if mic is not None:
            return mic, speaker
    except Exception as ex:
        eprint("default speaker loopback lookup failed:", ex)

    for m in sc.all_microphones(include_loopback=True):
        name = (m.name or "").lower()
        if "loopback" in name or "stereo mix" in name or "what u hear" in name:
            return m, speaker
    # Last resort: any mic with include_loopback listing
    mics = list(sc.all_microphones(include_loopback=True))
    if not mics:
        return None, speaker
    return mics[0], speaker


def copy_clipboard(text: str) -> bool:
    try:
        if sys.platform == "win32":
            import subprocess

            p = subprocess.Popen(["clip"], stdin=subprocess.PIPE, shell=True)
            p.communicate(text.encode("utf-16-le"))
            return p.returncode == 0
    except Exception:
        pass
    return False


def record_loopback(
    out_path: Path,
    max_seconds: float,
    samplerate: int | None,
) -> Path:
    import numpy as np
    import soundfile as sf
    import soundcard as sc

    mic, speaker = find_loopback_mic()
    if mic is None:
        raise RuntimeError(
            "No loopback-capable input found. "
            "Try VB-Audio Virtual Cable or enable Stereo Mix, then --list-devices."
        )

    sr = int(samplerate or 48000)
    channels = 2
    try:
        channels = min(2, int(getattr(mic, "channels", 2) or 2))
    except Exception:
        channels = 2

    print(f"Loopback device : {mic.name}")
    print(f"Default speaker : {getattr(speaker, 'name', speaker)}")
    print(f"Sample rate     : {sr} Hz  · channels: {channels}")
    print(f"Max duration    : {max_seconds:.0f} s")
    print(f"Output          : {out_path}")
    print()
    print("Start the Suno (or other) playback, then press Enter to ARM recording…")
    try:
        input()
    except EOFError:
        pass

    stop_flag = threading.Event()
    chunks: list = []

    def wait_for_stop() -> None:
        print("Recording… press Enter to STOP (or wait for max duration).")
        try:
            input()
        except EOFError:
            time.sleep(max_seconds)
        stop_flag.set()

    waiter = threading.Thread(target=wait_for_stop, daemon=True)
    waiter.start()

    frames_target = int(sr * max_seconds)
    frames_got = 0
    block = 1024

    t0 = time.perf_counter()
    try:
        with mic.recorder(samplerate=sr, channels=channels, blocksize=block) as rec:
            while not stop_flag.is_set() and frames_got < frames_target:
                data = rec.record(numframes=block)
                if data is None or len(data) == 0:
                    continue
                chunks.append(np.asarray(data, dtype=np.float32))
                frames_got += len(data)
    except Exception as ex:
        raise RuntimeError(
            f"Loopback record failed ({ex}). "
            "On Windows, install soundcard deps and ensure loopback is allowed. "
            "Fallback: VB-Audio Cable + select that device."
        ) from ex

    stop_flag.set()
    elapsed = time.perf_counter() - t0

    if not chunks:
        raise RuntimeError("No audio captured (empty). Is something playing?")

    audio = np.concatenate(chunks, axis=0)
    # Peak safety soft clip only for file write numeric range — not a masterer
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1.0:
        audio = audio / peak

    out_path.parent.mkdir(parents=True, exist_ok=True)
    # PCM_16 WAV — archival-friendly handoff into the desk; matches “what we heard” as PCM
    sf.write(str(out_path), audio, sr, subtype="PCM_16")

    print()
    print(f"Captured {elapsed:.1f}s · peak {peak:.3f} · frames {len(audio)}")
    print(f"Wrote {out_path}")
    return out_path


def main(argv: list[str] | None = None) -> int:
    ensure_deps()

    ap = argparse.ArgumentParser(description="DEVINE MASTER system loopback capture")
    ap.add_argument(
        "--seconds",
        type=float,
        default=600.0,
        help="Max record length in seconds (default 600 = 10 min)",
    )
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=DEFAULT_OUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUT_DIR})",
    )
    ap.add_argument(
        "--samplerate",
        type=int,
        default=0,
        help="Sample rate Hz (default 48000). 0 = 48000",
    )
    ap.add_argument(
        "--list-devices",
        action="store_true",
        help="List audio devices and exit",
    )
    ap.add_argument(
        "--source-tag",
        type=str,
        default="source",
        help="Name tag in filename (default: source → …_source_capture.wav)",
    )
    args = ap.parse_args(argv)

    if args.list_devices:
        list_devices()
        return 0

    max_seconds = max(5.0, min(float(args.seconds), 600.0))  # hard cap 10 min
    sr = int(args.samplerate) if args.samplerate and args.samplerate > 0 else 48000
    out_dir = args.out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    tag = "".join(c if c.isalnum() or c in "-_" else "_" for c in args.source_tag) or "source"
    out_path = out_dir / f"{stamp}_{tag}_capture.wav"

    try:
        written = record_loopback(out_path, max_seconds=max_seconds, samplerate=sr)
    except Exception as ex:
        eprint("ERROR:", ex)
        return 1

    last = out_dir / LAST_CAPTURE_NAME
    last.write_text(str(written.resolve()) + "\n", encoding="utf-8")
    print(f"LAST_CAPTURE → {last}")

    if copy_clipboard(str(written.resolve())):
        print("Path copied to clipboard.")

    print()
    print("Next: open DEVINE MASTER → Load this file into SourceCast A → MASTER.")
    print(f"  {written.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
