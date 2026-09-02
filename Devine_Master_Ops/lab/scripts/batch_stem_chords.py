#!/usr/bin/env python3
"""Batch chord_detector over catalogue stems (skip drums by default)."""
from __future__ import annotations
import argparse, subprocess, sys
from pathlib import Path

STEM_HINTS = ("bass", "vocals", "vocal", "piano", "keys", "other", "guitar", "instrumental")
SKIP_DEFAULT = ("drum", "drums", "perc")

def is_stem(path: Path, include_drums: bool) -> bool:
    n = path.stem.lower().replace("&", " ").replace("-", " ").replace("_", " ")
    if not include_drums and any(s in n.split() or s in path.stem.lower() for s in SKIP_DEFAULT):
        # also filename contains _Drums / Drums
        if "drum" in path.name.lower():
            return False
    # must look like a stem name, not a full master
    name = path.name.lower()
    if "mastered" in name and not any(h in name for h in STEM_HINTS):
        return False
    return any(h in name for h in ("bass", "vocal", "piano", "keys", "other", "guitar", "instrumental"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio-root", type=Path, default=Path(r"F:\devine-master-fresh\Audio"))
    ap.add_argument("--out-dir", type=Path, default=Path("tracks/analysis"))
    ap.add_argument("--detector", type=Path, default=Path("lab/scripts/chord_detector.py"))
    ap.add_argument("--include-drums", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    if not args.detector.is_file():
        raise SystemExit(f"Missing detector: {args.detector}")
    wavs = sorted(args.audio_root.rglob("*.wav")) + sorted(args.audio_root.rglob("*.WAV"))
    stems = [p for p in wavs if is_stem(p, args.include_drums)]
    # de-dupe
    seen = set()
    uniq = []
    for p in stems:
        k = str(p.resolve()).lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(p)
    stems = uniq
    if args.limit > 0:
        stems = stems[: args.limit]

    print(f"audio={args.audio_root}  stems={len(stems)}  drums={'yes' if args.include_drums else 'skip'}")
    ok, err = 0, 0
    for i, p in enumerate(stems, 1):
        print(f"[{i}/{len(stems)}] {p.name}")
        r = subprocess.run(
            [sys.executable, str(args.detector), str(p), "--out-dir", str(args.out_dir)],
            cwd=str(Path.cwd()),
        )
        if r.returncode == 0:
            ok += 1
        else:
            err += 1
            print(f"    FAIL code={r.returncode}")
    print(f"done ok={ok} err={err}")

if __name__ == "__main__":
    main()
