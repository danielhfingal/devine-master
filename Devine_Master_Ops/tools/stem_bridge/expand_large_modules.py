#!/usr/bin/env python3
"""Expand large stem_bridge modules after git pull."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
scripts = [
    "write_stem_bridge_only.py",
    "write_catalogue_structure.py",
    "write_catalogue_phase2.py",
    "write_catalogue_analyse.py",
]
for s in scripts:
    p = ROOT / s
    if not p.is_file():
        print("missing", p, file=sys.stderr)
        continue
    subprocess.check_call([sys.executable, str(p)])
print("done")
