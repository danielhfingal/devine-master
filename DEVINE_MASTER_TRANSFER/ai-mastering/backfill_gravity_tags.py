#!/usr/bin/env python3
"""Backfill coldGravity on legacy catalogue rows."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "catalogue_json"

SCALE_MAP = {
    0.40: "baseline",
    0.35: "baseline",
    0.25: "gentle",
    0.22: "gentle",
    0.15: "gentle",
    0.10: "gentle",
    0.55: "strong",
    0.45: "strong",
    0.20: "strong",
}


def nearest_gravity_from_scale(scale):
    if scale is None:
        return None
    try:
        s = float(scale)
    except (TypeError, ValueError):
        return None
    best, best_d = None, 1e9
    for k, name in SCALE_MAP.items():
        d = abs(k - s)
        if d < best_d:
            best, best_d = name, d
    return best if best_d <= 0.12 else None


def backfill_entry(e: dict):
    mr = e.get("mapping_results")
    if not isinstance(mr, dict):
        mr = {}
        e["mapping_results"] = mr

    existing = mr.get("coldGravity")
    if existing in ("baseline", "gentle", "strong"):
        return e, "kept"

    ct = mr.get("coldTonal") if isinstance(mr.get("coldTonal"), dict) else {}
    if ct.get("gravity") in ("baseline", "gentle", "strong"):
        mr["coldGravity"] = ct["gravity"]
        return e, "from_coldTonal.gravity"

    g = nearest_gravity_from_scale(ct.get("scale"))
    if g:
        mr["coldGravity"] = g
        mr["gravityInferred"] = True
        mr["gravityInferSource"] = "coldTonal.scale"
        return e, "from_scale"

    mr["coldGravity"] = "baseline"
    mr["gravityInferred"] = True
    mr["gravityInferSource"] = "legacy_default_baseline"
    return e, "legacy_baseline"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalogue", type=Path, default=None)
    args = ap.parse_args()

    if args.catalogue and args.catalogue.exists():
        src = args.catalogue
    else:
        cands = []
        for folder in (EXPORTS, ROOT, ROOT / "catalogue_json"):
            if folder.exists():
                cands.extend(folder.glob("devine_master_catalogue*.json"))
        if not cands:
            raise SystemExit("No catalogue JSON found")
        src = max(cands, key=lambda p: p.stat().st_mtime)

    data = json.loads(src.read_text())
    entries = data.get("entries") or []
    counts = {"kept": 0, "from_coldTonal.gravity": 0, "from_scale": 0, "legacy_baseline": 0}

    for e in entries:
        _, how = backfill_entry(e)
        counts[how] = counts.get(how, 0) + 1

    data["gravityBackfill"] = {
        "at": datetime.now(timezone.utc).isoformat(),
        "source": str(src),
        "counts": counts,
    }
    out = (EXPORTS if EXPORTS.exists() else ROOT) / f"devine_master_catalogue_gravity_backfill_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2))
    print(json.dumps({"source": str(src), "out": str(out), "entry_count": len(entries), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
