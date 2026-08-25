#!/usr/bin/env python3
"""Assemble split parts then run (materializes full implementation)."""
from __future__ import annotations

from pathlib import Path
import runpy
import sys

here = Path(__file__).resolve().parent
full = here / "_batch_stemlab_impl.py"
if not full.exists() or full.stat().st_size < 1000:
    p1 = here / "_batch_stemlab.part1.txt"
    p2 = here / "_batch_stemlab.part2.txt"
    if not p1.exists() or not p2.exists():
        print(
            "batch_stemlab: missing _batch_stemlab.part1.txt / part2.txt — git pull again",
            file=sys.stderr,
        )
        raise SystemExit(2)
    full.write_text(p1.read_text(encoding="utf-8") + p2.read_text(encoding="utf-8"), encoding="utf-8")
sys.argv[0] = str(full)
runpy.run_path(str(full), run_name="__main__")
