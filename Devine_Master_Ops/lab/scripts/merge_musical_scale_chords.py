#!/usr/bin/env python3
"""Merge musical_content_scale + Bass chord_pass tops (alias-based match)."""
from __future__ import annotations
import json, re
from datetime import datetime, timezone
from pathlib import Path

ANALYSIS = Path("tracks/analysis")
RUNS = Path("lab/runs")

# scale titleKey / filename fragment -> chord file substrings to try
ALIASES = [
    ("espera", ["espere_que", "espera_que", "espera"]),
    ("fireflies", ["fireflies_in_tar", "fireflies"]),
    ("frank", ["frank_folks", "frank_and_folks", "frank"]),
    ("shake", ["ill_make_the_world", "world_shake", "shake"]),
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

def latest_scale() -> Path:
    files = sorted(RUNS.glob("musical_content_scale_*.json"), key=lambda p: p.stat().st_mtime)
    # prefer non-merged as source
    files = [p for p in files if "merged" not in p.name] or files
    if not files:
        raise SystemExit("No musical_content_scale_*.json")
    return files[-1]

def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))

def slug(s: str) -> str:
    s = (s or "").lower().replace("&", " and ")
    s = re.sub(r"[^\w]+", "_", s)
    return re.sub(r"_+", "_", s).strip("_")

def chord_top(doc, n=3):
    top = (doc.get("summary") or {}).get("topChords") or []
    return [{"chord": t.get("chord"), "share": t.get("share"), "seconds": t.get("seconds")} for t in top[:n]]

def find_chord(label: str, chord_index: list[dict]):
    s = slug(label)
    # 1) alias rules
    for key, frags in ALIASES:
        if key in s or any(f in s for f in frags):
            for c in chord_index:
                cs = slug(c["file"] + " " + (c.get("track") or ""))
                if any(f in cs for f in frags) or key in cs:
                    return c
    # 2) longest common token overlap
    st = set(s.split("_")) - {"mastered", "stem", "tempo", "key", "pass", "json", "the", "and"}
    best, best_n = None, 0
    for c in chord_index:
        cs = set(slug(c["file"]).split("_")) - {"bass", "chord", "pass", "json", "mastered"}
        n = len(st & cs)
        if n > best_n:
            best, best_n = c, n
    if best_n >= 2:
        return best
    return None

def agreement_note(key_label, chord_names):
    if not key_label or not chord_names:
        return "insufficient"
    def root(x):
        m = re.match(r"([A-G]#?)", (x or "").replace("b", "#"))
        return m.group(1) if m else None
    kr = root(key_label)
    cr = {root(c) for c in chord_names if root(c)}
    if not kr:
        return "no_key_parse"
    if kr in cr:
        return "root_overlap"
    return "no_root_overlap"

def main():
    scale_path = latest_scale()
    scale = load(scale_path)
    titles = scale.get("titles") or []

    chord_index = []
    for p in sorted(ANALYSIS.glob("*chord_pass*.json")):
        if "bass" not in p.name.lower():
            continue
        d = load(p)
        chord_index.append({
            "file": p.name,
            "track": d.get("track") or p.stem,
            "top": chord_top(d),
            "nSegments": (d.get("summary") or {}).get("nSegments"),
        })

    used = set()
    rows = []
    for row in titles:
        label = " ".join(str(row.get(k) or "") for k in ("titleKey", "file", "track"))
        c = find_chord(label, chord_index)
        entry = dict(row)
        if c:
            used.add(c["file"])
            tops = c["top"]
            entry["chords"] = "provisional_bass"
            entry["chordsStatus"] = "provisional"
            entry["bassChordFile"] = c["file"]
            entry["bassChordTop"] = tops
            entry["bassChordSegments"] = c.get("nSegments")
            entry["chordKeyNote"] = agreement_note(
                row.get("keyLabel") or row.get("key") or "",
                [t.get("chord") for t in tops],
            )
        else:
            entry["chords"] = "missing"
            entry["chordsStatus"] = "missing"
            entry["bassChordFile"] = None
            entry["bassChordTop"] = []
            entry["chordKeyNote"] = None
        rows.append(entry)

    orphans = [c for c in chord_index if c["file"] not in used]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = {
        "schema": "devine_musical_content_scale_v1_merged",
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "sourceScale": str(scale_path),
        "summary": {
            "titles": len(rows),
            "withBassChords": sum(1 for r in rows if r.get("chords") == "provisional_bass"),
            "missingChords": sum(1 for r in rows if r.get("chords") == "missing"),
            "orphanChordFiles": len(orphans),
        },
        "policy": {
            "chords": "provisional bass chroma triad only",
            "lock": False,
            "refuse": "Do not auto-lock key from bassChordTop",
        },
        "titles": rows,
        "orphanBassChords": orphans,
    }
    out_path = RUNS / f"musical_content_scale_merged_{stamp}.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")

    print(f"scale: {scale_path.name}")
    print(f"titles={out['summary']['titles']}  bass_chords={out['summary']['withBassChords']}  missing={out['summary']['missingChords']}  orphans={out['summary']['orphanChordFiles']}")
    print()
    for r in rows:
        tops = ", ".join(f"{t['chord']}({t.get('share')})" for t in (r.get("bassChordTop") or [])[:3]) or "-"
        print(f"[{r.get('coverage')}] bpm={r.get('bpm')} key={r.get('keyLabel')}")
        print(f"     {r.get('file')}")
        print(f"     bass={r.get('bassChordFile') or '-'}  top={tops}  note={r.get('chordKeyNote')}")
    if orphans:
        print("\nORPHANS:")
        for c in orphans:
            print(f"  {c['file']}")
    print("\nwrote", out_path)

if __name__ == "__main__":
    main()
