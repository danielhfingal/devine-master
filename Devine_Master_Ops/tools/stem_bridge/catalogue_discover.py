#!/usr/bin/env python3
"""Discover mix files for catalogue stem separation (Phase 1 batch)."""
from __future__ import annotations

import os
import re
from pathlib import Path

AUDIO_EXT = {".wav", ".flac", ".mp3", ".m4a"}
SKIP_DIR_PARTS = {
    "stems", "_jobs", "node_modules", ".git", "captures", "__pycache__",
}


def safe_track_id(name: str) -> str:
    s = re.sub(r"[^\w\-]+", "_", (name or "track").strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:80] or "track"


def _default_roots(ops_root: Path) -> list[Path]:
    roots: list[Path] = []
    env = os.environ.get("STEM_SOURCE_ROOTS", "").strip()
    if env:
        for part in env.split(os.pathsep):
            part = part.strip()
            if part:
                roots.append(Path(part))
    try:
        ar = Path(__file__).resolve().parent / "audio_root.txt"
        if ar.is_file():
            for line in ar.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    roots.append(Path(line))
    except Exception:
        pass
    for rel in ("tracks/source", "tracks/masters", "../masters", "../source"):
        roots.append(ops_root / rel)
    parent = ops_root.parent
    roots.append(parent / "Audio")
    roots.append(parent)
    return roots


def stems_complete(stems_root: Path, track_id: str) -> bool:
    d = stems_root / track_id
    if not d.is_dir():
        return False
    side = d / f"{track_id}__stems.json"
    if side.is_file():
        return True
    return all((d / f"{track_id}__{s}.wav").is_file() for s in ("vocals", "drums", "bass", "other"))


def discover_catalogue(ops_root: Path, extra_roots: list[Path] | None = None, limit: int | None = None) -> list[dict]:
    roots = _default_roots(ops_root)
    if extra_roots:
        roots = list(extra_roots) + roots
    seen = {}
    items = []
    for root in roots:
        root = Path(root)
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if not p.is_file() or p.suffix.lower() not in AUDIO_EXT:
                continue
            if any(part in SKIP_DIR_PARTS for part in p.parts):
                continue
            if "__" in p.stem and any(p.stem.endswith(f"__{s}") for s in ("vocals", "drums", "bass", "other")):
                continue
            tid = safe_track_id(p.stem)
            if tid in seen:
                # prefer wav
                if p.suffix.lower() == ".wav" and Path(seen[tid]["source_path"]).suffix.lower() != ".wav":
                    seen[tid] = {"track_id": tid, "source_path": str(p.resolve()), "source_name": p.name, "root": str(root)}
                continue
            seen[tid] = {"track_id": tid, "source_path": str(p.resolve()), "source_name": p.name, "root": str(root)}
    items = list(seen.values())
    items.sort(key=lambda x: x["track_id"].lower())
    if limit:
        items = items[:limit]
    return items
