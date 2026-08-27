#!/usr/bin/env python3
"""Discover mix files under the catalogue audio root."""

from __future__ import annotations

import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OPS = HERE.parents[1]
AUDIO_ROOT_FILE = HERE / "audio_root.txt"

AUDIO_EXT = {".wav", ".flac", ".aiff", ".aif", ".mp3", ".m4a"}


def load_audio_root() -> Path:
    if AUDIO_ROOT_FILE.is_file():
        line = AUDIO_ROOT_FILE.read_text(encoding="utf-8").strip().splitlines()
        if line:
            p = Path(line[0].strip())
            if p.is_dir():
                return p
    # defaults
    for cand in (
        Path(r"F:\devine-master-fresh\Audio"),
        OPS.parent / "Audio",
        OPS / "Audio",
    ):
        if cand.is_dir():
            return cand
    return Path(r"F:\devine-master-fresh\Audio")


def safe_track_id(name: str) -> str:
    s = re.sub(r"[^\w\-]+", "_", (name or "track").strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:80] or "track"


def discover_mixes(audio_dir: Path | None = None) -> list[dict]:
    root = Path(audio_dir) if audio_dir else load_audio_root()
    if not root.is_dir():
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        if p.suffix.lower() not in AUDIO_EXT:
            continue
        # skip obvious stem dumps
        low = p.name.lower()
        if any(x in low for x in ("__vocals", "__drums", "__bass", "__other", "_stems")):
            continue
        tid = safe_track_id(p.stem)
        if tid in seen:
            continue
        seen.add(tid)
        out.append({"track_id": tid, "path": str(p.resolve()), "name": p.name})
    return out


if __name__ == "__main__":
    for m in discover_mixes():
        print(m["track_id"], m["path"])
