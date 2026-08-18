#!/usr/bin/env python3
"""
Offline 3×3 renders via Python chain.py
=======================================
presets  ×  gravity  =  9 recipes per source

  devine|spotify|match  ×  baseline|gentle|strong

Writes:
  tracks/lab_3x3_renders/<song_key>/<preset>_<gravity>.wav
  tracks/lab_3x3_renders/manifest.json

Then optionally refreshes catalogue_3x3_lab.py summary.

Usage:
  python run_3x3_offline.py --songs Wind,Espera
  python run_3x3_offline.py --all
  python run_3x3_offline.py --songs Wind --presets devine --gravities strong
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils import load_audio, ensure_stereo, save_audio, resample
from chain import apply_chain
from analysis import measure_loudness, measure_crest_factor

OUT_DIR = ROOT / "tracks" / "lab_3x3_renders"
SOURCE_DIR = ROOT / "tracks" / "source"

PRESETS = ("devine", "spotify", "match")
GRAVITIES = ("baseline", "gentle", "strong")

# Target LUFS by preset (catalogue identity)
PRESET_LUFS = {
    "devine": -9.4,   # STRONG prior median (x_star)
    "spotify": -14.0,
    "match": -10.1,   # Match Ⓟ catalogue pull (profile)
}

# STRONG prior crest floor — do not win loudness by over-squashing
STRONG_CREST_FLOOR = 9.53
STRONG_CREST_TARGET = 10.14


# EQ / dynamics recipes: gravity scales how hard we lean into catalogue tone
# chain_params keys match build_mastering_chain()
def recipe(preset: str, gravity: str) -> dict:
    """Return apply_chain kwargs for one grid cell."""
    g = gravity.lower()
    # gravity → tonal / dynamics intensity
    scale = {"baseline": 0.35, "gentle": 0.65, "strong": 1.0}[g]
    # base EQ toward STRONG / Devine shape
    if preset == "spotify":
        base_eq = dict(
            low_shelf_gain=0.2 * scale,
            presence_gain=0.3 * scale,
            high_shelf_gain=0.4 * scale,
            comp_threshold=-16.0,
            comp_ratio=2.0 + 0.3 * scale,
            limiter_threshold=-1.5,
        )
        width = 1.0
        drive = 0.03 * scale
        declip = 0.15 * scale
    elif preset == "match":
        base_eq = dict(
            low_shelf_gain=0.8 * scale,
            presence_gain=0.6 * scale,
            high_shelf_gain=0.5 * scale,
            comp_threshold=-18.0,
            comp_ratio=2.3 + 0.4 * scale,
            limiter_threshold=-1.2,
        )
        width = 0.95
        drive = 0.08 * scale
        declip = 0.25 * scale
    else:  # devine — denser loudness toward STRONG x_star (crest ~10.1, not smash)
        # scale 0.35/0.65/1.0 → progressive density; Strong lands near crest target
        base_eq = dict(
            low_shelf_gain=0.7 * scale,
            presence_gain=1.1 * scale,
            high_shelf_gain=0.9 * scale,
            # Lower threshold + higher ratio on Strong = more average level under same TP
            comp_threshold=-18.0 - 4.0 * scale,   # Strong ~ -22
            comp_ratio=2.2 + 1.8 * scale,         # Strong ~ 4.0
            comp_attack=10.0,
            comp_release=80.0,
            limiter_threshold=-1.15,
        )
        width = 1.0
        drive = 0.12 * scale
        declip = 0.40 * scale

    # Staging / makeup policy by preset
    if preset == "devine":
        # Aim STRONG x_star; allow more makeup; protect crest floor + TP
        max_gain = 12.0
        min_crest = STRONG_CREST_TARGET * 0.85  # ~8.6 staging scale ref
        second_cap = 7.0
        crest_floor = STRONG_CREST_FLOOR
        # Gravity → how close to STRONG crest we densify (never below floor)
        _crest_aim = {
            "baseline": STRONG_CREST_TARGET + 1.5,  # light
            "gentle": STRONG_CREST_TARGET + 0.6,
            "strong": STRONG_CREST_TARGET + 0.15,   # ~10.3, above floor 9.53
        }[g]
        target_crest = _crest_aim
    elif preset == "match":
        max_gain = 9.0
        min_crest = 8.5
        second_cap = 4.5
        crest_floor = 9.0
        target_crest = None
    else:
        max_gain = 6.0
        min_crest = 8.0
        second_cap = 3.0
        crest_floor = None
        target_crest = None

    return {
        "target_lufs": PRESET_LUFS[preset],
        "target_tp": -1.0,
        "use_auto_staging": True,
        "chain_params": {
            "hp_freq": 28.0 if preset != "spotify" else 25.0,
            **base_eq,
        },
        "declip_strength": float(declip),
        "width": float(width),
        "mono_bass_hz": 120.0,
        "exciter_drive": float(drive),
        "exciter_mix": 0.18,
        "watermark": True,
        "watermark_level_db": -48.0,
        "max_gain_db": float(max_gain),
        "min_crest_db": float(min_crest),
        "second_makeup_cap_db": float(second_cap),
        "crest_floor_db": crest_floor,
        "target_crest_db": target_crest,
    }


def song_key(name: str) -> str:
    s = re.sub(r"\.[a-z0-9]+$", "", name, flags=re.I)
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_")
    return s


def match_sources(wanted: list[str] | None, all_sources: bool) -> list[Path]:
    files = sorted(SOURCE_DIR.glob("*.mp3")) + sorted(SOURCE_DIR.glob("*.wav"))
    if all_sources or not wanted:
        return files
    out = []
    for f in files:
        key = song_key(f.name).lower()
        if any(w.lower() in key for w in wanted):
            out.append(f)
    return out


def render_one(path: Path, preset: str, gravity: str, out_dir: Path) -> dict:
    audio, sr = load_audio(path)
    audio = ensure_stereo(audio)
    # Cap length for lab speed (first 90s) — full export flag later
    max_samp = int(sr * 45)
    if audio.shape[1] > max_samp:
        audio = audio[:, :max_samp]

    kwargs = recipe(preset, gravity)
    processed, report = apply_chain(audio, sr, **kwargs)

    # Export 16-bit wav @ 44.1 for lab
    cell_dir = out_dir / song_key(path.name)
    cell_dir.mkdir(parents=True, exist_ok=True)
    out_path = cell_dir / f"{preset}_{gravity}.wav"
    save_audio(out_path, processed, sr, fmt="wav24", target_sr=44100)

    # Re-load measure at 44.1 after save is heavy; measure in-memory
    if sr != 44100:
        proc_m = resample(processed, sr, 44100)
        msr = 44100
    else:
        proc_m, msr = processed, sr
    loud = measure_loudness(proc_m, msr)
    crest = measure_crest_factor(proc_m, use_true_peak=True, sr=msr)

    def py(v):
        if v is None:
            return None
        if hasattr(v, "item"):
            try:
                return v.item()
            except Exception:
                pass
        if isinstance(v, (bool,)):
            return bool(v)
        if isinstance(v, (int, float)):
            return float(v) if not isinstance(v, bool) else bool(v)
        return v

    tp = loud.get("true_peak_dbtp")
    return {
        "source": path.name,
        "preset": preset,
        "gravity": gravity,
        "output": str(out_path.relative_to(ROOT)),
        "lufs": py(loud.get("integrated_lufs")),
        "tp_dbtp": py(tp),
        "crest_db": py(crest),
        "target_lufs": float(kwargs["target_lufs"]),
        "safety_tp_ok": bool(tp is not None and float(tp) <= -0.95),
        "recipe": {
            "width": float(kwargs["width"]),
            "drive": float(kwargs["exciter_drive"]),
            "declip": float(kwargs["declip_strength"]),
            "chain_params": {k: (float(v) if isinstance(v, (int, float)) else v) for k, v in kwargs["chain_params"].items()},
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--songs", type=str, default="Wind,Espera",
                    help="Comma substrings to match source names, or empty with --all")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--presets", type=str, default="devine,spotify,match")
    ap.add_argument("--gravities", type=str, default="baseline,gentle,strong")
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    ap.add_argument("--force", action="store_true", help="Re-render even if wav exists")
    args = ap.parse_args()

    presets = [p.strip() for p in args.presets.split(",") if p.strip() in PRESETS]
    gravities = [g.strip() for g in args.gravities.split(",") if g.strip() in GRAVITIES]
    wanted = [s.strip() for s in args.songs.split(",") if s.strip()] if not args.all else None
    sources = match_sources(wanted, args.all)
    if not sources:
        raise SystemExit(f"No sources in {SOURCE_DIR}")

    args.out.mkdir(parents=True, exist_ok=True)
    results = []
    man_path = args.out / "manifest.json"
    # resume: skip cells that already have wav on disk
    existing = set()
    for wav in args.out.rglob("*.wav"):
        # .../song/preset_gravity.wav
        try:
            preset_g = wav.stem  # preset_gravity
            song = wav.parent.name
            existing.add((song, preset_g))
        except Exception:
            pass

    def save_manifest():
        manifest = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "tool": "run_3x3_offline.py",
            "window_sec": 45,
            "results": results,
            "cells_done": len([r for r in results if not r.get("skipped")]),
            "cells_target": len(sources) * len(presets) * len(gravities),
        }
        import tempfile, os
        data = json.dumps(manifest, indent=2)
        try:
            man_path.write_text(data)
        except OSError:
            tmp = Path("/tmp/lab_3x3_manifest.json")
            tmp.write_text(data)
            try:
                os.replace(tmp, man_path)
            except OSError as e:
                print(f"     warn: manifest save failed ({e})", flush=True)

    print(f"Sources: {[s.name for s in sources]}")
    print(f"Grid: {presets} × {gravities}")
    print(f"Existing wav cells on disk: {len(existing)}")

    for src in sources:
        sk = song_key(src.name)
        for p in presets:
            for g in gravities:
                key = (sk, f"{p}_{g}")
                out_wav = args.out / sk / f"{p}_{g}.wav"
                if (not args.force) and key in existing and out_wav.exists():
                    print(f"  skip existing {src.name} | {p} × {g}")
                    results.append({
                        "source": src.name, "preset": p, "gravity": g,
                        "output": str(out_wav.relative_to(ROOT)), "skipped": True,
                    })
                    continue
                print(f"  → {src.name} | {p} × {g}", flush=True)
                try:
                    row = render_one(src, p, g, args.out)
                    results.append(row)
                    print(f"     LUFS {row['lufs']:.2f}  TP {row['tp_dbtp']:.2f}  crest {row['crest_db']:.2f}", flush=True)
                except Exception as e:
                    print(f"     FAIL {e}", flush=True)
                    results.append({
                        "source": src.name, "preset": p, "gravity": g, "error": str(e)
                    })
                save_manifest()

    save_manifest()
    print(f"Wrote {man_path} ({len(results)} cells)")


if __name__ == "__main__":
    main()
