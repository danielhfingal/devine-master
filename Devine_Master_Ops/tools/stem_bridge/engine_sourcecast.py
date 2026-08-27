#!/usr/bin/env python3
"""SourceCast Stem Lab backend → contract WAV + sidecar under tracks/stems/{track_id}/.

Presets map to SourceCast configs:
  high_quality | balanced | fast | six_stem | studio_preview

Falls back to spectral (studio_preview family) when heavy checkpoints are missing.
Still writes the Phase-1 contract so the desk can Load stems.
"""

from __future__ import annotations

import json
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("engine_sourcecast")

SLOTS_4 = ("vocals", "drums", "bass", "other")


def _ops_and_sourcecast_roots() -> list[Path]:
    here = Path(__file__).resolve()
    ops = here.parents[2]
    candidates = [
        ops / "sourcecast",
        ops.parent / "sourcecast",
        ops.parent / "devine-master" / "sourcecast",
        here.parents[3] / "sourcecast",
    ]
    return [p for p in candidates if p.is_dir()]


def sourcecast_available() -> bool:
    roots = _ops_and_sourcecast_roots()
    for r in roots:
        if str(r.parent) not in sys.path:
            sys.path.insert(0, str(r.parent))
        if str(r) not in sys.path:
            sys.path.insert(0, str(r))
    try:
        from sourcecast.stemlab import StemSeparator  # noqa: F401

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


def _ensure_import() -> None:
    for r in _ops_and_sourcecast_roots():
        parent = str(r.parent)
        if parent not in sys.path:
            sys.path.insert(0, parent)


def write_contract_from_paths(
    stem_paths: dict[str, Path],
    out_root: Path,
    track_id: str,
    source: Path,
    *,
    engine_name: str,
    preset: str,
    models_used: list[str] | None = None,
    warnings: list[str] | None = None,
    sample_rate: int | None = None,
    notes: str = "",
) -> Path:
    dest = out_root / track_id
    dest.mkdir(parents=True, exist_ok=True)
    stems_meta = []
    for slot in SLOTS_4:
        src = stem_paths.get(slot)
        if src is None or not Path(src).is_file():
            raise FileNotFoundError(f"missing stem for slot {slot}: {src}")
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
            "name": engine_name,
            "version": "",
            "preset": preset,
            "device": device_label(),
            "models_used": models_used or [],
        },
        "sample_rate": sample_rate,
        "stems": stems_meta,
        "warnings": warnings or [],
        "notes": notes or "Phase 2 SourceCast path",
    }
    if sample_rate is None:
        try:
            import soundfile as sf

            info = sf.info(str(dest / stems_meta[0]["file"]))
            sidecar["sample_rate"] = int(info.samplerate)
        except Exception:
            pass

    side_path = dest / f"{track_id}__stems.json"
    side_path.write_text(json.dumps(sidecar, indent=2), encoding="utf-8")
    return dest


def separate(
    source: Path,
    track_id: str,
    out_root: Path,
    preset: str = "high_quality",
) -> Path:
    """Run SourceCast StemSeparator and write Phase-1 contract stems."""
    _ensure_import()
    if not sourcecast_available():
        raise RuntimeError(
            "sourcecast package not importable — place sourcecast/ next to Ops "
            "or on PYTHONPATH (pip install -e sourcecast)"
        )

    from sourcecast.stemlab import StemSeparator

    source = source.resolve()
    if not source.is_file():
        raise FileNotFoundError(source)

    work = out_root / "_jobs" / f"{track_id}_sc_{preset}"
    if work.exists():
        shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)

    log.info("SourceCast preset=%s → %s", preset, track_id)
    sep = StemSeparator(config=preset)
    result = sep.separate(
        source,
        output_dir=work,
        return_type="paths",
        on_progress=lambda f, s: log.info("%.0f%% %s", 100 * f, s),
    )
    paths = result.paths or {}
    stem_paths: dict[str, Path] = {}
    for slot in SLOTS_4:
        p = paths.get(slot)
        if p is None:
            cands = list(work.rglob(f"*{slot}*.wav"))
            if cands:
                p = cands[0]
        if p is None:
            raise FileNotFoundError(f"SourceCast did not produce '{slot}'")
        stem_paths[slot] = Path(p)

    dest = write_contract_from_paths(
        stem_paths,
        out_root,
        track_id,
        source,
        engine_name="sourcecast",
        preset=preset,
        models_used=list(result.models_used or []),
        warnings=list(result.warnings or []),
        sample_rate=int(result.sample_rate) if result.sample_rate else None,
        notes=f"Phase 2 SourceCast · method={result.method}",
    )
    shutil.rmtree(work, ignore_errors=True)
    return dest
