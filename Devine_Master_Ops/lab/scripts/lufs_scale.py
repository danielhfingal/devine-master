#!/usr/bin/env python3
"""LUFS scale from quality_batch_gate_*.json — target -10.1 LUFS."""
from __future__ import annotations
import argparse, json, re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TARGET_LUFS = -10.1
TP_CEILING = -1.0
TP_MARGIN = 0.05
BAND_OK = 0.30

def _num(x: Any):
    try:
        v = float(x)
        return v if abs(v) < 200 else None
    except (TypeError, ValueError):
        return None

def load_gate(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for r in data.get("rows") or []:
        if r.get("error"):
            rows.append({"source": "gate", "file": r.get("file"), "error": r.get("error")})
            continue
        inp = r.get("input") or {}
        val = r.get("validation") or {}
        rows.append({
            "source": "gate",
            "file": r.get("file"),
            "path": r.get("path"),
            "lufs": _num(inp.get("lufs")),
            "tp": _num(inp.get("tp") if "tp" in inp else inp.get("truePeakDbtp")),
            "safetyPass": val.get("safetyPass"),
            "hardFails": val.get("hardFails") or [],
        })
    return rows

def score(r, target=TARGET_LUFS):
    lufs, tp = r.get("lufs"), r.get("tp")
    delta = None if lufs is None else round(lufs - target, 4)
    abs_d = None if delta is None else abs(delta)
    if lufs is None:
        band = "unknown"
    elif abs_d <= BAND_OK:
        band = "in_band"
    elif delta > 0:
        band = "hot"
    else:
        band = "quiet"
    tp_ok = (tp is not None) and (tp <= TP_CEILING + TP_MARGIN)
    label = "?"
    if delta is not None:
        if delta > 1.5: label = "very_hot"
        elif delta > 0.30: label = "hot"
        elif delta >= -0.30: label = "on_target"
        elif delta >= -1.0: label = "quiet"
        else: label = "very_quiet"
    return {**r, "targetLufs": target, "deltaLufs": delta, "absDeltaLufs": abs_d,
            "band": band, "tpOk": tp_ok,
            "printCandidate": band == "in_band" and tp_ok,
            "scaleLabel": label}

def base_title(name):
    if not name: return ""
    n = re.sub(r"_S3b?(_g-[\d.]+)?_DEVINE.*", "", name, flags=re.I)
    n = re.sub(r"_mastered.*", "_mastered", n, flags=re.I)
    n = re.sub(r"\s*\(\d+\)", "", n)
    return n.strip()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gate", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    rows = [score(r) for r in load_gate(args.gate)]
    gate = [r for r in rows if r.get("lufs") is not None]
    gate.sort(key=lambda r: (r.get("absDeltaLufs") is None, r.get("absDeltaLufs") or 999))
    print_set = [r for r in gate if r.get("printCandidate")]
    hot = [r for r in gate if r.get("band") == "hot"]
    quiet = [r for r in gate if r.get("band") == "quiet"]
    by = {}
    for r in gate:
        t = base_title(r.get("file"))
        if not t: continue
        if t not in by or (r.get("absDeltaLufs") or 99) < (by[t].get("absDeltaLufs") or 99):
            by[t] = r
    scale = {
        "schema": "devine_lufs_scale_v1",
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "targetLufs": TARGET_LUFS,
        "bandOkDb": BAND_OK,
        "summary": {
            "gateFiles": len(gate),
            "inBand": sum(1 for r in gate if r["band"] == "in_band"),
            "hot": len(hot), "quiet": len(quiet),
            "printCandidates": len(print_set),
        },
        "printSet": print_set, "hot": hot, "quiet": quiet,
        "bestPerTitle": list(by.values()), "allGate": gate,
    }
    out = args.out or (args.gate.parent / f"lufs_scale_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json")
    out.write_text(json.dumps(scale, indent=2), encoding="utf-8")
    print(f"target {TARGET_LUFS}  |band|<={BAND_OK}  files={len(gate)}  print={len(print_set)}")
    print("\n=== PRINT SET ===")
    for r in print_set:
        print(f"  {r['file']}: LUFS {r['lufs']:.2f}  d{r['deltaLufs']:+.2f}  TP {r['tp']:.3f}")
    print("\n=== HOT ===")
    for r in hot:
        print(f"  {r['file']}: LUFS {r['lufs']:.2f}  d{r['deltaLufs']:+.2f}")
    print("\n=== QUIET ===")
    for r in quiet:
        print(f"  {r['file']}: LUFS {r['lufs']:.2f}  d{r['deltaLufs']:+.2f}")
    print("\n=== BEST PER TITLE ===")
    for r in sorted(by.values(), key=lambda x: x.get("absDeltaLufs") or 99):
        m = "PRINT" if r.get("printCandidate") else r.get("band")
        print(f"  [{m}] {r['file']}: LUFS {r['lufs']:.2f}  d{r['deltaLufs']:+.2f}")
    print("\nwrote", out)

if __name__ == "__main__":
    main()
