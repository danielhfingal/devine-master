#!/usr/bin/env python3
from __future__ import annotations
import json, re
from datetime import datetime, timezone
from pathlib import Path
from collections import Counter

ANALYSIS = Path("tracks/analysis")
RUNS = Path("lab/runs")
ALIASES = [
    ("espera", ["espere_que", "espera_que", "espera"]),
    ("fireflies", ["fireflies_in_tar", "fireflies"]),
    ("frank", ["frank_folks", "frank_and_folks", "frank"]),
    ("shake", ["ill_make_the_world", "world_shake", "shake", "i_ll_make"]),
    ("neon", ["neon-jesus", "neon_jesus", "neon"]),
    ("one_way", ["one-way_love", "one_way_love", "one-way", "one_way"]),
    ("ooh", ["ooh_ah", "ooh"]),
    ("pew", ["pew_pew", "pew"]),
    ("snake", ["snake_eyes", "sorry_not_sorry", "snake"]),
    ("beforedays", ["beforedays"]),
    ("got_away", ["one_that_got_away", "got_away"]),
    ("winds", ["winds_against", "winds"]),
    ("vagalumes", ["vagalumes"]),
]

def load(p): return json.loads(p.read_text(encoding="utf-8"))
def slug(s):
    s = (s or "").lower().replace("&", " and ")
    s = re.sub(r"[^\w]+", "_", s)
    return re.sub(r"_+", "_", s).strip("_")

def latest_scale():
    all_s = sorted(RUNS.glob("musical_content_scale_*.json"), key=lambda p: p.stat().st_mtime)
    if not all_s: raise SystemExit("No musical_content_scale_*.json")
    # prefer merged (has bass), then plain, never full
    merged = [p for p in all_s if "merged" in p.name and "full" not in p.name]
    if merged: return merged[-1]
    base = [p for p in all_s if "merged" not in p.name and "full" not in p.name]
    if base: return base[-1]
    return all_s[-1]

def structure_score(name):
    n = name.lower(); pen = 0
    if re.search(r"_2_|_3_|\(\d+\)", n): pen += 20
    if "s3b" in n or "devine" in n: pen -= 5
    if "mastered" not in n: pen += 5
    pen += min(len(n)//50, 3)
    return (pen, len(n))

def find_by_alias(label, items, file_key="file"):
    s = slug(label)
    for key, frags in ALIASES:
        if key in s or any(f in s for f in frags):
            cands = []
            for it in items:
                cs = slug(it[file_key] + " " + str(it.get("track") or ""))
                if any(f in cs for f in frags) or key in cs: cands.append(it)
            if cands: return sorted(cands, key=lambda x: structure_score(x[file_key]))[0]
    st = set(s.split("_")) - {"mastered","stem","tempo","key","pass","json","structure","the","and","d"}
    best, best_n = None, 0
    for it in items:
        cs = set(slug(it[file_key]).split("_")) - {"structure","pass","json","mastered","chord","bass"}
        n = len(st & cs)
        if n > best_n: best, best_n = it, n
    return best if best_n >= 2 else None

def summarize_structure(doc):
    sections = doc.get("sections") or []
    labels = [s.get("label") for s in sections if s.get("label")]
    bounds = [s.get("start") for s in sections]
    if sections: bounds = bounds + [sections[-1].get("end")]
    return {"nSections": len(sections), "labelCounts": dict(Counter(labels)),
            "labelsSequence": labels, "boundariesSec": bounds,
            "labelStatus": "provisional",
            "boundaryStatus": (doc.get("quality") or {}).get("boundaryStatus") or "machine"}

def main():
    scale_path = latest_scale()
    print("source:", scale_path)
    scale = load(scale_path)
    titles = scale.get("titles") or []
    struct_items = []
    for p in sorted(ANALYSIS.glob("*structure_pass*.json")):
        try: d = load(p)
        except Exception as e:
            struct_items.append({"file": p.name, "error": str(e)}); continue
        struct_items.append({"file": p.name, "track": d.get("track") or p.stem, "doc": d, "summary": summarize_structure(d)})
    rows, used = [], set()
    for row in titles:
        label = " ".join(str(row.get(k) or "") for k in ("titleKey","file","track"))
        entry = dict(row)
        st = find_by_alias(label, [x for x in struct_items if "error" not in x])
        if st:
            used.add(st["file"]); entry["structureFile"] = st["file"]
            entry["structure"] = st["summary"]; entry["structureStatus"] = "machine_boundaries_provisional_labels"
        else:
            entry["structureFile"] = None; entry["structure"] = None; entry["structureStatus"] = "missing"
        if not entry.get("chordsStatus"):
            if entry.get("bassChordTop"):
                entry["chords"] = "provisional_bass"; entry["chordsStatus"] = "provisional"
            else:
                entry["chords"] = entry.get("chords") or "missing"; entry["chordsStatus"] = "missing"
        rows.append(entry)
    orphans = [x["file"] for x in struct_items if "error" not in x and x["file"] not in used]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = {
        "schema": "devine_musical_content_scale_v1_full",
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "sourceScale": str(scale_path),
        "summary": {
            "titles": len(rows),
            "withStructure": sum(1 for r in rows if r.get("structure")),
            "missingStructure": sum(1 for r in rows if not r.get("structure")),
            "withBassChords": sum(1 for r in rows if r.get("bassChordTop")),
            "structureOrphans": len(orphans),
        },
        "policy": {"chords": "provisional", "structureLabels": "provisional", "keyLock": False,
                   "refuse": "No auto-lock of key, chords, or section labels"},
        "titles": rows,
        "orphanStructureFiles": orphans[:40],
    }
    out_path = RUNS / f"musical_content_scale_full_{stamp}.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"titles={out['summary']['titles']}  structure={out['summary']['withStructure']}  bass_chords={out['summary']['withBassChords']}  struct_orphans={out['summary']['structureOrphans']}")
    for r in rows:
        st = r.get("structure") or {}
        tops = ", ".join(f"{t['chord']}({t.get('share')})" for t in (r.get("bassChordTop") or [])[:3]) or "-"
        print(f"[{r.get('coverage')}] bpm={r.get('bpm')} key={r.get('keyLabel')}")
        print(f"     chords: {tops}")
        print(f"     structure: n={st.get('nSections')} labels={st.get('labelCounts')} file={r.get('structureFile')}")
    print("wrote", out_path)

if __name__ == "__main__":
    main()
