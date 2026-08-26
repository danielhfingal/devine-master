"""Demucs-class separator → contract WAV + sidecar under tracks/stems/{track_id}/."""
from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path

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


def _run_demucs(source: Path, work: Path, model: str) -> Path:
    import subprocess
    import sys

    work.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "demucs.separate",
        "-n", model,
        "-o", str(work),
        "--two-stems", "None",
        str(source),
    ]
    # full 4-stem: omit --two-stems
    cmd = [sys.executable, "-m", "demucs.separate", "-n", model, "-o", str(work), str(source)]
    subprocess.run(cmd, check=True)
    # demucs writes work/{model}/{track_stem}/*.wav
    subs = list(work.rglob("vocals.wav"))
    if not subs:
        raise RuntimeError("demucs produced no vocals.wav")
    return subs[0].parent


def write_contract_outputs(
    stem_dir: Path,
    out_root: Path,
    track_id: str,
    source: Path,
    model: str,
) -> Path:
    dest = out_root / track_id
    dest.mkdir(parents=True, exist_ok=True)
    stems_meta = []
    for slot in SLOTS:
        src = stem_dir / f"{slot}.wav"
        if not src.is_file():
            raise FileNotFoundError(f"missing stem: {src}")
        name = f"{track_id}__{slot}.wav"
        target = dest / name
        shutil.copy2(src, target)
        stems_meta.append({"slot": slot, "file": name})

    sidecar = {
        "schema": "devine-stems-v1",
        "track_id": track_id,
        "source_file": source.name,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "engine": {
            "name": model,
            "version": "",
            "preset": "default_4stem",
            "device": device_label(),
        },
        "sample_rate": None,
        "stems": stems_meta,
        "notes": "Phase 1 Demucs-class default",
    }
    try:
        import soundfile as sf
        info = sf.info(str(dest / stems_meta[0]["file"]))
        sidecar["sample_rate"] = int(info.samplerate)
    except Exception:
        pass

    side_path = dest / f"{track_id}__stems.json"
    import json
    side_path.write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
    return dest


def separate(source: Path, track_id: str, out_root: Path, model: str = "htdemucs") -> Path:
    if not demucs_available():
        raise RuntimeError("demucs not installed. pip install -r requirements-stem.txt")
    source = source.resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    work = out_root / "_jobs" / f"{track_id}_work"
    if work.exists():
        shutil.rmtree(work, ignore_errors=True)
    stem_dir = _run_demucs(source, work, model)
    dest = write_contract_outputs(stem_dir, out_root, track_id, source, model)
    shutil.rmtree(work, ignore_errors=True)
    return dest
