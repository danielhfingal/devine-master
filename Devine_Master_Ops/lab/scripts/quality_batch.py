#!/usr/bin/env python3
"""Devine Master offline quality batch — harden without hand-driving the desk."""
from __future__ import annotations
import argparse, json, re, sys
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from measure_bs1770 import load_audio, measure_bs1770

STREAM_TP_CEILING = -1.0
STREAM_TP_TOL = 0.05
PRESET_LUFS = {"devine": -10.1, "spotify": -14.0, "match": -10.1}
AUDIO_EXT = {".wav", ".flac", ".mp3", ".m4a", ".aiff", ".aif"}

STEM_SUFFIXES = (
    "_bass", "_drums", "_vocals", "_vocal", "_instrumental", "_other",
    "_piano", "_guitar", "_synth", "_strings", "_perc", "_fx",
)

def _is_stem_name(name: str) -> bool:
    n = name.lower()
    stem = Path(n).stem
    for s in STEM_SUFFIXES:
        if stem.endswith(s) or s in stem.replace(" ", "_"):
            # "Frank & Folks_Bass" etc.
            if stem.endswith(s) or stem.endswith(s.lstrip("_")):
                return True
            parts = stem.replace("-", " ").replace("&", " ").split()
            if any(p == s.lstrip("_") for p in parts):
                return True
    # explicit patterns
    for s in (" bass", " drums", " vocals", " instrumental", " other", " piano", " guitar"):
        if stem.endswith(s.strip()) or stem.endswith(s.strip().replace(" ", "_")):
            return True
    if re.search(r"(?:^|[\s_\-])(bass|drums|vocals?|instrumental|other|piano|guitar)(?:$|[\s_\-])", stem):
        return True
    return False

def discover(root: Path, mixes_only: bool = True):
    files = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in AUDIO_EXT:
            continue
        if "stems" in p.parts:
            continue
        if mixes_only and _is_stem_name(p.name):
            continue
        files.append(p)
    return files

def hard_gates(m, target_lufs=None):
    hard, soft = [], []
    if not (m["tp"] <= STREAM_TP_CEILING + STREAM_TP_TOL):
        hard.append(f"True Peak {m['tp']:.3f} dBTP > {STREAM_TP_CEILING}+{STREAM_TP_TOL}")
    if m["lufs"] > -3 or m["lufs"] < -30:
        hard.append(f"LUFS {m['lufs']:.1f} outside sane range")
    if target_lufs is not None and abs(m["lufs"] - target_lufs) > 1.5:
        soft.append(f"LUFS {m['lufs']:.1f} off aim {target_lufs:.1f}")
    return {"safetyPass": len(hard) == 0, "streamingEligible": len(hard) == 0,
            "hardFails": hard, "softWarns": soft, "hardFailCount": len(hard), "softWarnCount": len(soft)}

def apply_lufs_aim(audio, sr, target):
    m = measure_bs1770(audio, sr)
    delta = target - m["lufs"]
    g = float(np.clip(10 ** (delta / 20.0), 10 ** (-12 / 20), 10 ** (12 / 20)))
    return audio * g, {"fromLufs": m["lufs"], "target": target, "gainDb": 20 * np.log10(g)}

def force_tp_ceiling_sr(audio, sr, ceiling=-1.0, margin=0.05):
    target_db = ceiling - margin
    target_lin = 10 ** (target_db / 20.0)
    out = np.clip(audio, -target_lin, target_lin).copy()
    for _ in range(6):
        m = measure_bs1770(out, sr)
        peak_lin = 10 ** (m["tp"] / 20.0)
        if peak_lin <= target_lin * 1.00001:
            break
        out *= (target_lin * 0.999) / max(peak_lin, 1e-12)
    return out

def process_master(audio, sr, preset):
    target = PRESET_LUFS[preset]
    aimed, aim_info = apply_lufs_aim(audio, sr, target)
    limited = force_tp_ceiling_sr(aimed, sr)
    if preset == "spotify":
        limited, aim_info = apply_lufs_aim(limited, sr, target)
        limited = force_tp_ceiling_sr(limited, sr)
    return limited, {"preset": preset, "loudnessAim": aim_info}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio-root", type=Path, required=True)
    ap.add_argument("--mode", choices=["measure", "gate", "master"], default="gate")
    ap.add_argument("--presets", default="devine,spotify,match")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--include-stems", action="store_true", help="include Bass/Drums/Vocals etc.")
    args = ap.parse_args()
    root = args.audio_root
    if not root.is_dir():
        print("ERROR: audio root not found:", root, file=sys.stderr)
        sys.exit(2)
    files = discover(root, mixes_only=not args.include_stems)
    if args.limit > 0:
        files = files[: args.limit]
    presets = [p.strip() for p in args.presets.split(",") if p.strip() in PRESET_LUFS]
    runs_dir = Path(__file__).resolve().parents[1] / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = args.out or (runs_dir / f"quality_batch_{args.mode}_{stamp}.json")
    rows = []
    print(f"[batch] root={root} files={len(files)} mode={args.mode}")
    for i, fp in enumerate(files, 1):
        try:
            rel = str(fp.relative_to(root))
        except ValueError:
            rel = str(fp)
        print(f"[{i}/{len(files)}] {rel}")
        try:
            audio, sr = load_audio(fp)
        except Exception as e:
            rows.append({"file": rel, "error": str(e)})
            continue
        base = measure_bs1770(audio, sr)
        entry = {"file": rel, "path": str(fp), "input": base, "mode": args.mode,
                 "engine": "quality_batch_python_v1", "measurement_spec": "bs1770-4+tp4x-v1-python"}
        if args.mode in ("measure", "gate"):
            entry["validation"] = hard_gates(base)
            rows.append(entry)
            continue
        entry["editions"] = {}
        for preset in presets:
            out_audio, proc = process_master(audio, sr, preset)
            mout = measure_bs1770(out_audio, sr)
            val = hard_gates(mout, PRESET_LUFS[preset])
            entry["editions"][preset] = {"processing": proc, "output": mout, "validation": val,
                "metrics": {"lufs": mout["lufs"], "tpDbtp": mout["tp"], "targetLufs": PRESET_LUFS[preset],
                            "metricsSource": "measure_bs1770_python"}}
            print(f"    {preset}: LUFS {mout['lufs']:.2f}  TP {mout['tp']:.3f}  elig={val['streamingEligible']}")
        rows.append(entry)
    report = {"schema": "devine_quality_batch_v1", "exportedAt": datetime.now(timezone.utc).isoformat(),
              "audioRoot": str(root), "mode": args.mode, "fileCount": len(files), "rows": rows}
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("[batch] wrote", out_path)
    if args.mode in ("gate", "measure"):
        ok = sum(1 for r in rows if r.get("validation", {}).get("safetyPass"))
        bad = [r for r in rows if not r.get("validation", {}).get("safetyPass")]
        print(f"[batch] safetyPass {ok}/{len(rows)}")
        if bad:
            print(f"[batch] FAIL {len(bad)} — reasons:")
            for r in bad:
                fails = r.get("validation", {}).get("hardFails") or [r.get("error") or "unknown"]
                inp = r.get("input") or {}
                print(f"  - {r.get('file')}: LUFS {inp.get('lufs', float('nan')):.2f}  TP {inp.get('tp', float('nan')):.3f}  | {'; '.join(fails)}")
    if args.mode == "master":
        for preset in presets:
            ok = sum(1 for r in rows if r.get("editions", {}).get(preset, {}).get("validation", {}).get("safetyPass"))
            print(f"[batch] {preset} safetyPass {ok}/{len(rows)}")

if __name__ == "__main__":
    main()
