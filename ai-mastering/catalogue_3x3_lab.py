#!/usr/bin/env python3
"""
DEVINE MASTER — Catalogue 3×3 Lab
=================================
Automates the preset × cold-gravity matrix across the JSON catalogue
and optional local source files.

Grid:
  presets  = devine | spotify | match
  gravity  = baseline | gentle | strong

Broadened metrics per pass:
  LUFS, TP, sample peak, crest, RMS, LRA proxy, stereo correlation,
  spectral centroid/slope, band energies, DC, safety flags, soft/hard counts,
  width/drive/EQ when present, cold-tonal scale, distance to STRONG x_star.

Usage:
  python catalogue_3x3_lab.py
  python catalogue_3x3_lab.py --catalogue path.json --sources-dir ../tracks/source
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOGUES = [
    ROOT / "devine_master_catalogue_2026-08-18 (1).json",
    ROOT / "devine_master_catalogue_2026-08-18.json",
    ROOT / "catalogue_json" / "devine_master_catalogue_2026-08-18 (3).json",
]
STRONG_PRIOR = ROOT / "tracks" / "cold_gravity_strong_prior.json"
OUT_JSON = ROOT / "tracks" / "lab_3x3_report.json"
OUT_MD = ROOT / "tracks" / "lab_3x3_report.md"

PRESETS = ("devine", "spotify", "match")
GRAVITIES = ("baseline", "gentle", "strong")
PRESET_LABEL = {
    "devine": "D.Devine Sound",
    "spotify": "Spotify Upload-Ready",
    "match": "Match Ⓟ",
}


def latest_catalogue(explicit: Path | None) -> Path:
    if explicit and explicit.exists():
        return explicit
    found = [p for p in DEFAULT_CATALOGUES if p.exists()]
    # also scan root + catalogue_json
    for folder in (ROOT, ROOT / "catalogue_json"):
        if folder.exists():
            found.extend(folder.glob("devine_master_catalogue*.json"))
    if not found:
        raise SystemExit("No catalogue JSON found")
    # prefer largest entry count / newest mtime
    def score(p: Path):
        try:
            d = json.loads(p.read_text())
            n = len(d.get("entries") or [])
        except Exception:
            n = 0
        return (n, p.stat().st_mtime)

    return max(found, key=score)


def norm_song(name: str) -> str:
    s = (name or "").lower()
    s = re.sub(r"\.[a-z0-9]+$", "", s)
    s = re.sub(r"_mastered|_strong|_ddevine|_preview", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_gravity(entry: dict) -> str | None:
    mr = entry.get("mapping_results") or {}
    if not isinstance(mr, dict):
        return None
    g = mr.get("coldGravity") or mr.get("gravity")
    if not g and isinstance(mr.get("coldTonal"), dict):
        g = mr["coldTonal"].get("gravity")
    if not g:
        pp = entry.get("processing_parameters") or {}
        g = pp.get("gravity") or pp.get("coldGravity")
    if not g:
        return None
    g = str(g).lower().strip()
    if g in GRAVITIES:
        return g
    return g or None


def extract_preset(entry: dict) -> str | None:
    p = entry.get("preset") or entry.get("preset_id")
    if not p:
        return None
    p = str(p).lower()
    if p in PRESETS:
        return p
    if "spotify" in p:
        return "spotify"
    if "match" in p:
        return "match"
    if "devine" in p:
        return "devine"
    return p


def broadened_metrics(entry: dict) -> dict[str, Any]:
    """Flatten the interesting lab fields from a catalogue entry."""
    m = entry.get("metrics") or {}
    an = entry.get("analysis") or {}
    val = entry.get("validation_results") or {}
    pp = entry.get("processing_parameters") or {}
    mr = entry.get("mapping_results") or {}
    cold = mr.get("coldTonal") if isinstance(mr, dict) else None
    cold = cold if isinstance(cold, dict) else {}
    dyn = mr.get("coldDynamics") if isinstance(mr, dict) else None
    dyn = dyn if isinstance(dyn, dict) else {}

    out: dict[str, Any] = {
        "lufs": _f(m.get("lufs", an.get("lufs"))),
        "tp_dbtp": _f(m.get("tpDbtp", an.get("truePeakDbtp"))),
        "sample_peak_dbfs": _f(m.get("samplePeakDbfs", an.get("samplePeakDbfs"))),
        "target_lufs": _f(m.get("targetLufs")),
        "crest_db": _f(an.get("crestDb") or an.get("peakToAvgDb") or dyn.get("crestDb")),
        "rms_db": _f(an.get("rmsDb")),
        "lra_lu": _f(an.get("approxLraLu")),
        "dc_offset_db": _f(an.get("dcOffsetDb")),
        "stereo_corr": _f(an.get("stereoCorrelation")),
        "spectral_centroid_hz": _f(an.get("spectralCentroidHz")),
        "spectral_slope": _f(an.get("spectralSlope")),
        "duration_sec": _f(an.get("durationSec")),
        "sample_rate": an.get("sampleRate"),
        "safety_pass": bool(entry.get("safetyPass", val.get("safetyPass"))),
        "hard_fail_count": int(entry.get("hardFailCount") or val.get("hardFailCount") or 0),
        "soft_warn_count": int(entry.get("softWarnCount") or val.get("softWarnCount") or 0),
        "streaming_eligible": val.get("streamingEligible"),
        "hard_fails": val.get("hardFails") or [],
        "soft_warns": val.get("softWarns") or [],
        "width": _f(pp.get("width")),
        "drive": _f(pp.get("drive")),
        "hpf_hz": _f(pp.get("hpfHz")),
        "lpf_khz": _f(pp.get("lpfKhz")),
        "eq_db": pp.get("eqDb"),
        "cold_scale": _f(cold.get("scale")),
        "cold_clamp_db": _f(cold.get("clampDb")),
        "cold_offsets_db": cold.get("offsetsDb"),
        "loudness_delta": None,
        "band_energy_db": an.get("bandEnergyDb"),
        "band_freqs_hz": an.get("bandFreqsHz"),
        "app_build": entry.get("appBuild") or entry.get("engine_version"),
        "provenance": entry.get("provenance"),
        "mark": entry.get("mark"),
        "ts": entry.get("ts") or entry.get("timestamp"),
        "id": entry.get("id") or entry.get("master_id"),
    }
    if out["lufs"] is not None and out["target_lufs"] is not None:
        out["loudness_delta"] = out["lufs"] - out["target_lufs"]
    return out


def _f(v):
    if v is None:
        return None
    try:
        x = float(v)
        if math.isnan(x) or math.isinf(x):
            return None
        return x
    except (TypeError, ValueError):
        return None


def median(xs: list[float]) -> float | None:
    xs = [x for x in xs if x is not None]
    if not xs:
        return None
    xs = sorted(xs)
    n = len(xs)
    mid = n // 2
    return xs[mid] if n % 2 else 0.5 * (xs[mid - 1] + xs[mid])


def aggregate(rows: list[dict]) -> dict:
    if not rows:
        return {"n": 0}
    keys = [
        "lufs", "tp_dbtp", "sample_peak_dbfs", "crest_db", "rms_db", "lra_lu",
        "stereo_corr", "spectral_centroid_hz", "loudness_delta", "width", "drive",
        "cold_scale", "hard_fail_count", "soft_warn_count",
    ]
    out: dict[str, Any] = {"n": len(rows)}
    for k in keys:
        vals = [r[k] for r in rows if r.get(k) is not None]
        out[k] = {
            "median": median(vals),
            "mean": (sum(vals) / len(vals)) if vals else None,
            "min": min(vals) if vals else None,
            "max": max(vals) if vals else None,
            "n": len(vals),
        }
    out["safety_pass_rate"] = sum(1 for r in rows if r.get("safety_pass")) / len(rows)
    out["streaming_eligible_rate"] = (
        sum(1 for r in rows if r.get("streaming_eligible")) / len(rows)
        if any(r.get("streaming_eligible") is not None for r in rows)
        else None
    )
    return out


def load_strong_prior(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text())


def dist2_to_star(feat: dict, prior: dict) -> float | None:
    star = prior.get("x_star") or {}
    weights = prior.get("weights") or {}
    keys = prior.get("feature_keys") or list(star.keys())
    if not star:
        return None
    s = 0.0
    for k in keys:
        if k not in feat or feat[k] is None or k not in star:
            continue
        w = float(weights.get(k, 1.0))
        d = float(feat[k]) - float(star[k])
        s += w * d * d
    return s


# --- optional local source measurement (lightweight) ---
def measure_local(path: Path, max_sec: float = 60.0) -> dict | None:
    try:
        import numpy as np
        import soundfile as sf
        import pyloudnorm as pyln
        from scipy import signal
    except ImportError:
        return None

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        out = Path(tmp.name)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(path), "-t", str(max_sec), "-ac", "2", "-ar", "44100", "-f", "wav", str(out)],
            capture_output=True,
            check=True,
        )
        x, sr = sf.read(out, always_2d=True)
        x = x.astype("float64")
        mid = 0.5 * (x[:, 0] + x[:, 1])
        up = signal.resample_poly(mid, 2, 1)
        tp = 20 * math.log10(float(np.max(np.abs(up)) + 1e-12))
        peak = float(np.max(np.abs(mid)) + 1e-12)
        rms = float(np.sqrt(np.mean(mid ** 2)) + 1e-12)
        crest = 20 * math.log10(peak / rms)
        try:
            lufs = float(pyln.Meter(sr).integrated_loudness(x))
        except Exception:
            lufs = None
        nperseg = min(len(mid), 4096)
        f, Pxx = signal.welch(mid, fs=sr, nperseg=nperseg)
        bands_def = [(20, 60), (60, 150), (150, 500), (500, 2500), (2500, 6000), (6000, 16000)]
        names = ["b_sub", "b_bass", "b_low_mid", "b_mid", "b_presence", "b_air"]
        band_v = []
        for lo, hi in bands_def:
            msk = (f >= lo) & (f < hi)
            band_v.append(10 * math.log10(float(np.mean(Pxx[msk]) + 1e-20)))
        ref = sum(band_v) / len(band_v)
        bands = {n: band_v[i] - ref for i, n in enumerate(names)}
        L, R = x[:, 0], x[:, 1]
        em = float(np.mean((0.5 * (L + R)) ** 2) + 1e-12)
        es = float(np.mean((0.5 * (L - R)) ** 2) + 1e-12)
        sm = 10 * math.log10(es / em)
        return {
            "lufs": lufs,
            "tp": tp,
            "crest": crest,
            "side_mid_db": sm,
            **bands,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        out.unlink(missing_ok=True)


def simulate_pull(src: dict, prior: dict, gravity: str) -> dict:
    star = prior["x_star"]
    alpha = {"baseline": 0.25, "gentle": 0.50, "strong": 0.75}[gravity]
    keys = list(star.keys())
    out = {k: (1 - alpha) * src[k] + alpha * star[k] for k in keys if k in src and src[k] is not None}
    # crest ridge awareness: don't allow simulated crest below floor
    floor = prior.get("crest_min_allowed")
    if floor is not None and out.get("crest") is not None and out["crest"] < floor:
        out["crest"] = floor
    return out


def V_hard(feat: dict, prior: dict) -> float | None:
    star = prior.get("x_star") or {}
    if not star:
        return None
    d2 = dist2_to_star(feat, prior)
    if d2 is None:
        return None
    vc = prior.get("V_crest") or {}
    c_star = star.get("crest")
    c = feat.get("crest")
    floor = vc.get("floor", prior.get("crest_min_allowed"))
    coef_med = float(vc.get("below_median_coef", 2.5))
    coef_floor = float(vc.get("below_floor_coef", 12.0))
    val = d2
    if c is not None and c_star is not None and c < c_star:
        val += coef_med * (c_star - c) ** 2
    if c is not None and floor is not None and c < floor:
        val += coef_floor * (floor - c) ** 2
    tp = feat.get("tp")
    if tp is not None and tp > -1.0:
        val += 8.0 * (tp + 1.0) ** 2
    return val


def run_lab(catalogue_path: Path, sources_dir: Path | None, prior_path: Path) -> dict:
    cat = json.loads(catalogue_path.read_text())
    entries = cat.get("entries") or []
    prior = load_strong_prior(prior_path)

    # Normalize all entries into rows
    rows = []
    for e in entries:
        preset = extract_preset(e)
        gravity = extract_gravity(e)
        song = e.get("song") or e.get("fileName") or ""
        metrics = broadened_metrics(e)
        rows.append({
            "song": song,
            "song_key": norm_song(song),
            "preset": preset,
            "gravity": gravity,
            **metrics,
        })

    # 3×3 cells (only rows with both preset and gravity)
    grid: dict[str, dict[str, list]] = {p: {g: [] for g in GRAVITIES} for p in PRESETS}
    incomplete = []
    for r in rows:
        if r["preset"] in PRESETS and r["gravity"] in GRAVITIES:
            grid[r["preset"]][r["gravity"]].append(r)
        else:
            incomplete.append(r)

    cell_summary = {
        p: {g: aggregate(grid[p][g]) for g in GRAVITIES}
        for p in PRESETS
    }

    # Per-song coverage of full 3×3
    by_song: dict[str, dict] = defaultdict(lambda: {"presets": set(), "gravities": set(), "cells": set(), "n": 0})
    for r in rows:
        sk = r["song_key"] or r["song"]
        by_song[sk]["n"] += 1
        by_song[sk]["title"] = r["song"]
        if r["preset"]:
            by_song[sk]["presets"].add(r["preset"])
        if r["gravity"]:
            by_song[sk]["gravities"].add(r["gravity"])
        if r["preset"] in PRESETS and r["gravity"] in GRAVITIES:
            by_song[sk]["cells"].add(f"{r['preset']}×{r['gravity']}")

    song_coverage = []
    for sk, info in sorted(by_song.items(), key=lambda x: -x[1]["n"]):
        song_coverage.append({
            "song_key": sk,
            "title": info.get("title"),
            "n_entries": info["n"],
            "presets": sorted(info["presets"]),
            "gravities": sorted(info["gravities"]),
            "cells": sorted(info["cells"]),
            "cells_filled": len(info["cells"]),
            "cells_total": 9,
            "complete_3x3": len(info["cells"]) >= 9,
        })

    # Local source simulation against STRONG prior
    local = []
    if sources_dir and sources_dir.exists() and prior:
        for src in sorted(sources_dir.glob("*.mp3")):
            feat = measure_local(src)
            if not feat or feat.get("error"):
                local.append({"file": src.name, "error": (feat or {}).get("error", "measure failed")})
                continue
            cell = {}
            for g in GRAVITIES:
                pulled = simulate_pull(feat, prior, g)
                cell[g] = {
                    "lufs": pulled.get("lufs"),
                    "crest": pulled.get("crest"),
                    "dist2": dist2_to_star(pulled, prior),
                    "V_hard": V_hard(pulled, prior),
                }
            local.append({
                "file": src.name,
                "raw": {
                    "lufs": feat.get("lufs"),
                    "crest": feat.get("crest"),
                    "tp": feat.get("tp"),
                    "dist2": dist2_to_star(feat, prior),
                    "V_hard": V_hard(feat, prior),
                },
                "simulated_pull_toward_strong_x_star": cell,
                "note": "Simulation = feature-space blend toward STRONG x_star; not Beta DSP render",
            })

    # Ranking: best gravity per preset by median soft_warn + |loudness_delta| + safety
    recommendations = {}
    for p in PRESETS:
        ranked = []
        for g in GRAVITIES:
            a = cell_summary[p][g]
            if a.get("n", 0) == 0:
                continue
            lufs_med = (a.get("lufs") or {}).get("median")
            crest_med = (a.get("crest_db") or {}).get("median")
            soft = (a.get("soft_warn_count") or {}).get("mean") or 0
            safe = a.get("safety_pass_rate") or 0
            # score: prefer high safety, low soft warns; crest near prior if available
            score = safe * 10 - soft
            if crest_med is not None and prior and prior.get("x_star"):
                score -= 0.15 * abs(crest_med - prior["x_star"].get("crest", crest_med))
            ranked.append({
                "gravity": g,
                "n": a["n"],
                "score": score,
                "lufs_median": lufs_med,
                "crest_median": crest_med,
                "safety_pass_rate": safe,
                "soft_warn_mean": soft,
            })
        ranked.sort(key=lambda x: -x["score"])
        recommendations[p] = ranked

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "catalogue": str(catalogue_path),
        "schema": cat.get("schema"),
        "engine_version": cat.get("engine_version"),
        "measurement_spec": cat.get("measurement_spec"),
        "entry_count": len(entries),
        "rows_with_preset_and_gravity": sum(len(grid[p][g]) for p in PRESETS for g in GRAVITIES),
        "rows_missing_gravity_or_preset": len(incomplete),
        "grid_3x3": cell_summary,
        "song_coverage": song_coverage,
        "recommendations": recommendations,
        "strong_prior_used": str(prior_path) if prior else None,
        "local_source_simulations": local,
        "definition": {
            "presets": list(PRESETS),
            "gravities": list(GRAVITIES),
            "metrics": [
                "lufs", "tp_dbtp", "sample_peak_dbfs", "crest_db", "rms_db", "lra_lu",
                "stereo_corr", "spectral_centroid_hz", "spectral_slope", "dc_offset_db",
                "loudness_delta", "width", "drive", "cold_scale", "safety_pass",
                "hard_fail_count", "soft_warn_count", "streaming_eligible",
            ],
        },
    }
    return report


def to_markdown(report: dict) -> str:
    lines = []
    lines.append("# DEVINE MASTER — 3×3 Catalogue Lab Report")
    lines.append("")
    lines.append(f"Generated: `{report['generated_at']}`")
    lines.append(f"Catalogue: `{report['catalogue']}`")
    lines.append(f"Entries: **{report['entry_count']}** · with preset×gravity: **{report['rows_with_preset_and_gravity']}** · incomplete: **{report['rows_missing_gravity_or_preset']}**")
    lines.append("")
    lines.append("## Grid (median LUFS / crest / safety)")
    lines.append("")
    lines.append("| Preset \\ Gravity | Baseline | Gentle | Strong |")
    lines.append("|------------------|----------:|-------:|-------:|")
    for p in PRESETS:
        cells = []
        for g in GRAVITIES:
            a = report["grid_3x3"][p][g]
            if a.get("n", 0) == 0:
                cells.append("—")
                continue
            lufs = (a.get("lufs") or {}).get("median")
            crest = (a.get("crest_db") or {}).get("median")
            safe = a.get("safety_pass_rate")
            lufs_s = f"{lufs:.1f}" if lufs is not None else "?"
            crest_s = f"{crest:.1f}" if crest is not None else "?"
            safe_s = f"{100*safe:.0f}%" if safe is not None else "?"
            cells.append(f"n={a['n']} · {lufs_s} LUFS · c {crest_s} · {safe_s}")
        lines.append(f"| **{PRESET_LABEL.get(p,p)}** | " + " | ".join(cells) + " |")
    lines.append("")
    lines.append("## Recommendations (catalogue evidence)")
    lines.append("")
    for p, ranked in (report.get("recommendations") or {}).items():
        lines.append(f"### {PRESET_LABEL.get(p,p)}")
        if not ranked:
            lines.append("_No gravity-tagged passes yet._")
            continue
        for i, r in enumerate(ranked, 1):
            lines.append(
                f"{i}. **{r['gravity']}** (n={r['n']}) — score {r['score']:.2f}, "
                f"LUFS {r['lufs_median']}, crest {r['crest_median']}, "
                f"safety {r['safety_pass_rate']}, soft-warns {r['soft_warn_mean']}"
            )
        lines.append("")
    lines.append("## Song coverage")
    lines.append("")
    lines.append("| Song | Entries | Cells filled | Complete 3×3? |")
    lines.append("|------|--------:|-------------:|:-------------:|")
    for s in report.get("song_coverage") or []:
        lines.append(
            f"| {s.get('title') or s['song_key']} | {s['n_entries']} | "
            f"{s['cells_filled']}/9 | {'yes' if s['complete_3x3'] else 'no'} |"
        )
    lines.append("")
    if report.get("local_source_simulations"):
        lines.append("## Local source simulations → STRONG \(x_\\star\)")
        lines.append("")
        lines.append("| File | Raw LUFS | Raw dist² | Strong V | Gentle V | Baseline V |")
        lines.append("|------|---------:|----------:|---------:|---------:|-----------:|")
        for L in report["local_source_simulations"]:
            if L.get("error"):
                lines.append(f"| {L['file']} | error | | | | |")
                continue
            raw = L["raw"]
            sim = L["simulated_pull_toward_strong_x_star"]
            def vf(g):
                v = sim[g].get("V_hard")
                return f"{v:.1f}" if v is not None else "?"
            lines.append(
                f"| {L['file']} | {raw.get('lufs')} | {raw.get('dist2')} | "
                f"{vf('strong')} | {vf('gentle')} | {vf('baseline')} |"
            )
        lines.append("")
        lines.append("_Simulated feature-space pull only — not a full Beta render._")
    lines.append("")
    lines.append("## Notes")
    lines.append("- Gravity is read from `mapping_results.coldGravity` / `coldTonal.gravity`.")
    lines.append("- Many early entries lack gravity tags (counted as incomplete for the 3×3).")
    lines.append("- Broadened metrics use `metrics` + `analysis` + `validation_results` + processing/mapping when present.")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="DEVINE MASTER 3×3 catalogue lab")
    ap.add_argument("--catalogue", type=Path, default=None)
    ap.add_argument("--sources-dir", type=Path, default=ROOT / "tracks" / "source")
    ap.add_argument("--prior", type=Path, default=STRONG_PRIOR)
    ap.add_argument("--skip-local", action="store_true")
    ap.add_argument("--out-json", type=Path, default=OUT_JSON)
    ap.add_argument("--out-md", type=Path, default=OUT_MD)
    args = ap.parse_args()

    cat_path = latest_catalogue(args.catalogue)
    sources = None if args.skip_local else args.sources_dir
    print(f"Catalogue: {cat_path}")
    report = run_lab(cat_path, sources, args.prior)
    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(report, indent=2))
    args.out_md.write_text(to_markdown(report))
    print(f"Wrote {args.out_json}")
    print(f"Wrote {args.out_md}")
    print(f"Entries={report['entry_count']} grid_rows={report['rows_with_preset_and_gravity']}")
    for p in PRESETS:
        for g in GRAVITIES:
            n = report["grid_3x3"][p][g].get("n", 0)
            print(f"  {p:8s} × {g:8s}  n={n}")


if __name__ == "__main__":
    main()
