#!/usr/bin/env python3
"""Catalogue stem separation — full-set or single track (CLI)."""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from catalogue_discover import discover_catalogue, safe_track_id, stems_complete

OPS = Path(__file__).resolve().parents[2]
STEMS_ROOT = OPS / "tracks" / "stems"
REPORTS = OPS / "tracks" / "stems" / "_batch_reports"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_batch(items: list[dict], *, force: bool = False, model: str = "htdemucs", dry_run: bool = False) -> dict:
    from engine_demucs import demucs_available, separate

    if not dry_run and not demucs_available():
        raise RuntimeError("demucs not installed — pip install -r requirements-stem.txt")

    STEMS_ROOT.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)

    report = {
        "schema": "devine-stem-batch-v1",
        "started_at": _now(),
        "model": model,
        "force": force,
        "total": len(items),
        "results": [],
    }
    t0 = time.time()

    for i, it in enumerate(items, start=1):
        tid = it["track_id"]
        src = Path(it["source_path"])
        row = {"track_id": tid, "source_path": str(src), "index": i, "of": len(items)}
        print(f"\n[{i}/{len(items)}] {tid}", flush=True)
        print(f"  source: {src}", flush=True)

        if not force and stems_complete(STEMS_ROOT, tid):
            row["status"] = "skipped_complete"
            row["message"] = "contract stems already present"
            print("  skip (complete)", flush=True)
            report["results"].append(row)
            continue

        if not src.is_file():
            row["status"] = "error"
            row["message"] = "source missing"
            print("  ERROR missing source", flush=True)
            report["results"].append(row)
            continue

        if dry_run:
            row["status"] = "dry_run"
            report["results"].append(row)
            print("  dry-run", flush=True)
            continue

        try:
            dest = separate(src, tid, STEMS_ROOT, model=model)
            row["status"] = "done"
            row["dest"] = str(dest)
            print(f"  done → {dest}", flush=True)
        except Exception as e:
            row["status"] = "error"
            row["message"] = str(e)
            print(f"  ERROR {e}", flush=True)
        report["results"].append(row)

    report["finished_at"] = _now()
    report["elapsed_sec"] = round(time.time() - t0, 1)
    done = sum(1 for r in report["results"] if r["status"] == "done")
    skip = sum(1 for r in report["results"] if r["status"] == "skipped_complete")
    err = sum(1 for r in report["results"] if r["status"] == "error")
    report["summary"] = {"done": done, "skipped_complete": skip, "error": err}

    name = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    path = REPORTS / name
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    report["report_path"] = str(path)
    print(f"\n[batch] report {path}", flush=True)
    print(f"[batch] summary {report['summary']}", flush=True)
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="Devine catalogue stem batch")
    ap.add_argument("--mode", choices=("full", "single"), default="full")
    ap.add_argument("--track-id", default="")
    ap.add_argument("--in", dest="source", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--model", default="htdemucs")
    ap.add_argument("--discover-only", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--root", action="append", default=[])
    args = ap.parse_args()

    extra = [Path(r) for r in args.root]

    if args.mode == "single":
        if not args.source:
            print("single mode requires --in path", file=sys.stderr)
            return 2
        tid = safe_track_id(args.track_id or Path(args.source).stem)
        items = [{
            "track_id": tid,
            "source_path": str(Path(args.source).resolve()),
            "source_name": Path(args.source).name,
            "root": str(Path(args.source).resolve().parent),
        }]
    else:
        limit = args.limit if args.limit > 0 else None
        items = discover_catalogue(OPS, extra_roots=extra, limit=limit)

    if args.discover_only:
        print(json.dumps({"count": len(items), "tracks": items}, indent=2))
        return 0

    if not items:
        print("No sources found. Set STEM_SOURCE_ROOTS or pass --root", file=sys.stderr)
        return 1

    print(f"[batch] mode={args.mode} tracks={len(items)} force={args.force}", flush=True)
    run_batch(items, force=args.force, model=args.model, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
