#!/usr/bin/env python3
"""Scan tracks/analysis for mastered tempo/key passes → musical content scale."""
from __future__ import annotations
import json, re
from datetime import datetime, timezone
from pathlib import Path

ANALYSIS = Path("tracks/analysis")
OUT_DIR = Path("lab/runs")

def load(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        return {"_error": str(e), "_path": str(p)}

def bpm_key(d: dict):
    tw = d.get("tempo_working") or {}
    kw = d.get("key_working") or {}
    s = d.get("summary") or {}
    bpm = tw.get("bpm") if isinstance(tw, dict) else None
    if bpm is None and isinstance(s, dict):
        bpm = s.get("tempo") or s.get("bpm")
    key = kw.get("key") if isinstance(kw, dict) else None
    mode = kw.get("mode") if isinstance(kw, dict) else None
    camelot = kw.get("camelot") if isinstance(kw, dict) else None
    label = s.get("key") if isinstance(s, dict) else None
    if not label and key:
        label = f"{key} {mode or ''} {camelot or ''}".strip()
    return bpm, label, key, mode, camelot

def flags(bpm):
    f = []
    if bpm is None:
        return f
    try:
        b = float(bpm)
    except (TypeError, ValueError):
        return f
    if b < 70:
        f.append(f"half_time_candidate:{b*2:.1f}")
    if b > 160:
        f.append(f"double_time_candidate:{b/2:.1f}")
    return f

def is_mastered_name(name: str) -> bool:
    n = name.lower()
    if "stem_tempo_key_pass" not in n and "stem_tempo_key" not in n:
        return False
    if any(x in n for x in ("_bass_", "_drums_", "_vocals_", "_guitar_", "_other_",
                            "_instrumental_", "_piano_", "stemlab_batch", "stemlab_post")):
        return False
    return "mastered" in n or name in (
        "Frank_Folks_stem_tempo_key_pass.json",
        "Pew_Pew_stem_tempo_key_pass.json",
        "ooh_ah_Alive_stem_tempo_key_pass.json",
        "Neon-Jesus_mastered_stem_tempo_key_pass.json",
    )

def title_key(name: str) -> str:
    n = re.sub(r"_stem_tempo_key_pass.*", "", name, flags=re.I)
    n = re.sub(r"_\d{4}-\d{2}-\d{2}$", "", n)
    n = re.sub(r"_2$", "", n)
    n = re.sub(r"_3$", "", n)
    n = re.sub(r"_mastered$", "_mastered", n, flags=re.I)
    return n.lower()

def score_file(p: Path) -> tuple:
    """Prefer: no _2/_3, larger size, undated rich names."""
    n = p.name
    pen = 0
    if re.search(r"_2_stem|_2\.json", n): pen += 10
    if re.search(r"_3_stem|_3\.json", n): pen += 10
    if re.search(r"\d{4}-\d{2}-\d{2}", n): pen += 1
    return (pen, -p.stat().st_size, n)

def main():
    if not ANALYSIS.is_dir():
        raise SystemExit(f"missing {ANALYSIS}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    by = {}
    structure = {}
    for p in ANALYSIS.glob("*.json"):
        if "stem_structure_pass" in p.name.lower():
            structure[title_key(p.name.replace("_stem_structure_pass", ""))] = p.name
            continue
        if not is_mastered_name(p.name):
            continue
        tk = title_key(p.name)
        by.setdefault(tk, []).append(p)

    rows = []
    for tk, files in sorted(by.items()):
        files = sorted(files, key=score_file)
        best = files[0]
        d = load(best)
        bpm, label, key, mode, camelot = bpm_key(d)
        fam = list((d.get("key") or {}).keys()) if isinstance(d.get("key"), dict) else []
        rich = len(fam) >= 2
        row = {
            "titleKey": tk,
            "file": best.name,
            "alternates": [f.name for f in files[1:3]],
            "schema": d.get("schema"),
            "track": d.get("track"),
            "bpm": bpm,
            "keyLabel": label,
            "key": key,
            "mode": mode,
            "camelot": camelot,
            "keyLocked": d.get("keyLocked"),
            "tempoLocked": d.get("tempoLocked"),
            "families": fam,
            "coverage": "rich" if rich else "thin",
            "tempoFlags": flags(bpm),
            "structureFile": structure.get(tk) or structure.get(tk.replace("_mastered", "")),
            "chords": "missing",
            "midi": "missing",
            "error": d.get("_error"),
        }
        rows.append(row)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = {
        "schema": "devine_musical_content_scale_v1",
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "analysisRoot": str(ANALYSIS.resolve()),
        "summary": {
            "titles": len(rows),
            "rich": sum(1 for r in rows if r["coverage"] == "rich"),
            "thin": sum(1 for r in rows if r["coverage"] == "thin"),
            "withStructure": sum(1 for r in rows if r.get("structureFile")),
            "tempoFlagged": sum(1 for r in rows if r["tempoFlags"]),
        },
        "titles": rows,
    }
    path = OUT_DIR / f"musical_content_scale_{stamp}.json"
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")

    print(f"titles={out['summary']['titles']}  rich={out['summary']['rich']}  thin={out['summary']['thin']}  structure={out['summary']['withStructure']}")
    print()
    for r in rows:
        fl = ",".join(r["tempoFlags"]) if r["tempoFlags"] else "-"
        st = r["structureFile"] or "-"
        print(f"[{r['coverage']}] {r['file']}")
        print(f"     bpm={r['bpm']}  key={r['keyLabel']}  flags={fl}  struct={st}")
    print()
    print("wrote", path)

if __name__ == "__main__":
    main()
