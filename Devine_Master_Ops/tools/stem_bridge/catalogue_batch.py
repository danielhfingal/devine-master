#!/usr/bin/env python3
"""Catalogue stem separation — full-set or single track (CLI).

Long-running by design. Writes contract stems under tracks/stems/{track_id}/
and a batch report JSON for calibration / post-batch analyse.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from catalogue_discover import discover_mixes, load_audio_root  # noqa: E402
from engine_demucs import separate as demucs_separate  # noqa: E402

OPS = HERE.parents[1]
STEMS = OPS / "tracks" / "stems"
REPORTS = STEMS / "_batch_reports"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Catalogue stem separation batch")
    ap.add_argument("--audio-dir", type=Path, default=None)
    ap.add_argument("--full-set", action="store_true")
    ap.add_argument("--solo", action="store_true", help="Also write per-slot solo runs if engine supports")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--track", type=str, default=None, help="Single track_id or path")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    audio_dir = args.audio_dir or load_audio_root()
    STEMS.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)

    if args.track:
        p = Path(args.track)
        if p.is_file():
            mixes = [{"track_id": p.stem, "path": p}]
        else:
            mixes = [m for m in discover_mixes(audio_dir) if m["track_id"] == args.track]
            if not mixes:
                print(f"[batch] track not found: {args.track}", file=sys.stderr)
                return 1
    else:
        mixes = discover_mixes(audio_dir)

    if args.limit and args.limit > 0:
        mixes = mixes[: args.limit]

    job_id = f"batch_{_now()}"
    results = []
    done = skipped = errors = 0

    for m in mixes:
        tid = m["track_id"]
        src = Path(m["path"])
        out = STEMS / tid
        side = out / f"{tid}__stems.json"
        if side.is_file() and all((out / f"{tid}__{s}.wav").is_file() for s in ("vocals", "drums", "bass", "other")):
            skipped += 1
            results.append({"track_id": tid, "status": "skipped_complete", "path": str(out)})
            if args.verbose:
                print(f"[batch] skip complete {tid}")
            continue
        try:
            if args.verbose:
                print(f"[batch] separate {tid} <- {src}")
            demucs_separate(src, tid, STEMS)
            done += 1
            results.append({"track_id": tid, "status": "done", "path": str(out)})
        except Exception as e:
            errors += 1
            results.append({"track_id": tid, "status": "error", "error": str(e)})
            print(f"[batch] error {tid}: {e}", file=sys.stderr)

    report = {
        "schema": "devine-stem-batch-v1",
        "job_id": job_id,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "audio_dir": str(audio_dir),
        "summary": {"done": done, "skipped_complete": skipped, "error": errors},
        "results": results,
    }
    rpath = REPORTS / f"{job_id}.json"
    rpath.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"[batch] report {rpath}")
    print(f"[batch] summary {report['summary']}")
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
