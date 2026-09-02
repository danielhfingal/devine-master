#!/usr/bin/env python3
"""Summarize a quality_batch_gate_*.json report."""
import json, sys
from pathlib import Path
from collections import defaultdict

p = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not p or not p.is_file():
    runs = Path(__file__).resolve().parents[1] / "runs"
    files = sorted(runs.glob("quality_batch_gate_*.json"))
    if not files:
        print("No gate reports in", runs)
        sys.exit(1)
    p = files[-1]
    print("Using", p)

data = json.loads(p.read_text(encoding="utf-8"))
rows = data.get("rows") or []
ok = [r for r in rows if r.get("validation", {}).get("safetyPass")]
bad = [r for r in rows if not r.get("validation", {}).get("safetyPass")]
print(f"safetyPass {len(ok)}/{len(rows)}")
print()
# group by song base name
def base(name):
    n = name.lower().replace(" ", "_")
    for s in (" (2)", " (3)", "(2)", "(3)"):
        n = n.replace(s, "")
    return n

by = defaultdict(list)
for r in bad:
    by[base(r.get("file") or "")].append(r)

print("FAILURES by title:")
for k, lst in sorted(by.items()):
    r = lst[0]
    inp = r.get("input") or {}
    fails = r.get("validation", {}).get("hardFails") or []
    print(f"  {r.get('file')}")
    print(f"    LUFS={inp.get('lufs'):.2f}  TP={inp.get('tp'):.3f}  n_variants_fail={len(lst)}")
    for f in fails:
        print(f"    hard: {f}")

print()
print("PASS sample (first 5):")
for r in ok[:5]:
    inp = r.get("input") or {}
    print(f"  {r.get('file')}: LUFS={inp.get('lufs'):.2f} TP={inp.get('tp'):.3f}")
