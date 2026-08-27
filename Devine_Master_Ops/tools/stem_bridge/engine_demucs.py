#!/usr/bin/env python3
"""Demucs / htdemucs contract writer for Phase-1 stems."""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("engine_demucs")
SLOTS = ("vocals", "drums", "bass", "other")


def demucs_available() -> bool:
    try:
        import demucs  # noqa: F401

        return True
    except Exception:
        return False


def device_label() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def separate(source: Path, track_id: str, out_root: Path, model: str = "htdemucs") -> Path:
    source = Path(source).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    dest = out_root / track_id
    dest.mkdir(parents=True, exist_ok=True)
    work = out_root / "_jobs" / f"{track_id}_demucs"
    if work.exists():
        shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "demucs",
        "-n",
        model,
        "-o",
        str(work),
        str(source),
    ]
    log.info("demucs: %s", " ".join(cmd))
    subprocess.run(cmd, check=True)

    # demucs writes work/{model}/{track}/vocals.wav ...
    found: dict[str, Path] = {}
    for slot in SLOTS:
        cands = list(work.rglob(f"{slot}.wav"))
        if cands:
            found[slot] = cands[0]
    if len(found) < 4:
        raise RuntimeError(f"demucs incomplete stems: {sorted(found)}")

    stems_meta = []
    for slot in SLOTS:
        name = f"{track_id}__{slot}.wav"
        target = dest / name
        shutil.copy2(found[slot], target)
        stems_meta.append({"slot": slot, "file": name})

    sidecar = {
        "schema": "devine-stems-v1",
        "track_id": track_id,
        "source_file": source.name,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "engine": {
            "name": "demucs",
            "model": model,
            "device": device_label(),
        },
        "stems": stems_meta,
    }
    (dest / f"{track_id}__stems.json").write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
    shutil.rmtree(work, ignore_errors=True)
    return dest
