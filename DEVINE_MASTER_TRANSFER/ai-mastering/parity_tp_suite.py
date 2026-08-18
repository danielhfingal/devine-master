#!/usr/bin/env python3
"""TP compliance suite — assert final TP <= -1.0 dBTP on Library samples."""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
# Library may live at repo root or under artifacts-style paths
LIB_CANDIDATES = [
    ROOT / "02_Mastered_Ready" / "Library",
    ROOT / "tracks" / "source",
    ROOT / "Library",
]
OUT = ROOT / "tracks" / "lab_reports"
TARGET_TP = -1.0


def find_lib():
    for p in LIB_CANDIDATES:
        if p.exists():
            return p
    return None


def load_audio(path: Path, max_sec: float = 45.0):
    from scipy.io import wavfile

    cleanup = None
    if path.suffix.lower() != ".wav":
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            out = Path(tmp.name)
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(path), "-ac", "2", "-ar", "44100", str(out)],
            check=True,
            capture_output=True,
        )
        path, cleanup = out, out
    try:
        sr, data = wavfile.read(str(path))
        x = data.astype(np.float64)
        if x.ndim == 1:
            x = np.stack([x, x], axis=0)
        else:
            x = x.T
        if np.issubdtype(data.dtype, np.integer):
            x = x / float(np.iinfo(data.dtype).max)
        n = int(max_sec * sr)
        if x.shape[1] > n:
            start = (x.shape[1] - n) // 2
            x = x[:, start : start + n]
        return x.astype(np.float32), int(sr)
    finally:
        if cleanup and cleanup.exists():
            cleanup.unlink(missing_ok=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full-chain", action="store_true")
    ap.add_argument("--limit", type=int, default=6)
    ap.add_argument("--target-lufs", type=float, default=-9.4)
    args = ap.parse_args()

    from analysis import measure_true_peak, true_peak_limit, measure_loudness
    from chain import apply_chain

    lib = find_lib()
    if not lib:
        raise SystemExit("No Library/source audio folder found")
    files = sorted(lib.rglob("*.wav")) + sorted(lib.rglob("*.flac"))
    files = [p for p in files if p.is_file()][: args.limit]
    if not files:
        raise SystemExit("No audio files found")

    results = []
    fails = 0
    for path in files:
        audio, sr = load_audio(path)
        hot = audio * 1.8
        limited, rep = true_peak_limit(hot, sr, target_tp=TARGET_TP, overs=4)
        tp = measure_true_peak(limited, sr, overs=4)
        row = {
            "file": str(path),
            "mode": "tp_limit_only",
            "final_tp": round(float(tp), 3),
            "compliant": bool(tp <= TARGET_TP + 1e-6),
            "report": rep,
        }
        if args.full_chain:
            try:
                out, _ = apply_chain(
                    audio,
                    sr,
                    target_lufs=args.target_lufs,
                    target_tp=TARGET_TP,
                    crest_floor_db=9.53,
                    target_crest_db=10.1,
                )
                tp2 = measure_true_peak(out, sr, overs=4)
                lufs = measure_loudness(out, sr).get("integrated_lufs")
                row["full_chain"] = {
                    "final_tp": round(float(tp2), 3),
                    "lufs": round(float(lufs), 3) if lufs is not None else None,
                    "compliant": bool(tp2 <= TARGET_TP + 1e-6),
                }
                if not row["full_chain"]["compliant"]:
                    fails += 1
            except Exception as e:
                row["full_chain_error"] = str(e)
                fails += 1
        if not row["compliant"]:
            fails += 1
        results.append(row)
        print(f"{'PASS' if row['compliant'] else 'FAIL'}  TP={row['final_tp']:+.3f}  {path.name[:50]}")

    OUT.mkdir(parents=True, exist_ok=True)
    outp = OUT / f"parity_tp_suite_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    outp.write_text(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "fails": fails, "n": len(results), "results": results}, indent=2))
    print(json.dumps({"fails": fails, "n": len(results), "out": str(outp)}, indent=2))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
