#!/usr/bin/env python3
"""
D.Devine dataset builder (no GPU).

Matches tracks/mastered audio ↔ tracks/lyrics by normalized title,
pulls duration / loudness from the reference profile when available,
writes tracks/d_devine_dataset_manifest.json

Usage:
    python build_dataset.py
    python build_dataset.py --verbose
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MASTERED_DIR = ROOT / "tracks" / "mastered"
SOURCE_DIR = ROOT / "tracks" / "source"
LYRICS_DIR = ROOT / "tracks" / "lyrics"
PROMPTS_DIR = ROOT / "tracks" / "prompts"
PROFILE_JSON = ROOT / "tracks" / "d_devine_reference_profile.json"
OUT_MANIFEST = ROOT / "tracks" / "d_devine_dataset_manifest.json"

AUDIO_EXT = {".wav", ".flac", ".aiff", ".aif", ".mp3"}
LYRICS_EXT = {".txt", ".md", ".lrc"}


def normalize_title(name: str) -> str:
    """
    Aggressive normalize for matching audio stems to lyric filenames.
    Strips mastering suffixes, featuring tags, punctuation, accents.
    """
    s = Path(name).stem
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    # common mastering / credit suffixes
    s = re.sub(r"_mastered$", "", s)
    s = re.sub(r"_ddevine_mastered$", "", s)
    s = re.sub(r"_routenote$", "", s)
    s = re.sub(r"\s*-\s*d\.?\s*devine.*$", "", s)
    s = re.sub(r"\s*-\s*i wish she dreams tonight.*$", "", s)
    s = re.sub(r"^sorry,?\s*not sorry deuce\s*-\s*", "", s)
    s = re.sub(r",?\s*double ones,?\s*rolled!*$", "", s)
    s = re.sub(r"_lyrics$", "", s)
    s = re.sub(r"\bthe one who got away\b", "the one that got away", s)
    s = re.sub(r"[^\w\s]+", " ", s)  # punctuation → space
    s = re.sub(r"\s+", " ", s).strip()
    # light synonym / spelling collapses
    s = s.replace("bum wing", "bum wing")
    s = s.replace("general bum wing", "general bum wing")
    return s


def tokens(s: str) -> set[str]:
    stop = {"the", "a", "an", "and", "de", "da", "do", "no", "na"}
    return {t for t in s.split() if t and t not in stop}


def score_match(a: str, b: str) -> float:
    """0..1 similarity from normalized titles."""
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.92
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    jacc = inter / union
    # boost if key multi-word cores overlap strongly
    return jacc


def load_profile() -> dict:
    if not PROFILE_JSON.exists():
        return {}
    try:
        return json.loads(PROFILE_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {}


def profile_by_filename(profile: dict) -> dict[str, dict]:
    """Map audio filename → analysis row from reference profile."""
    out = {}
    tracks = profile.get("tracks") or profile.get("per_track") or []
    if isinstance(tracks, dict):
        tracks = list(tracks.values())
    for row in tracks:
        if not isinstance(row, dict):
            continue
        fn = row.get("file") or row.get("filename") or row.get("name")
        if fn:
            out[Path(fn).name] = row
    return out


def read_lyrics_preview(path: Path, max_chars: int = 240) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace").strip()
    except Exception:
        return ""
    text = re.sub(r"\s+", " ", text)
    if len(text) > max_chars:
        return text[: max_chars - 1] + "…"
    return text


def count_lyrics_stats(path: Path) -> dict:
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return {"chars": 0, "lines": 0, "words": 0}
    lines = [ln for ln in raw.splitlines() if ln.strip()]
    words = re.findall(r"\S+", raw)
    return {"chars": len(raw), "lines": len(lines), "words": len(words)}


def build_manifest(verbose: bool = False) -> dict:
    def list_audio(folder: Path) -> list[Path]:
        if not folder.is_dir():
            return []
        return sorted(
            p for p in folder.iterdir()
            if p.is_file() and p.suffix.lower() in AUDIO_EXT
        )

    mastered_files = list_audio(MASTERED_DIR)
    # Source: prefer primary exports, skip tool intermediates
    skip_suffixes = (
        "_ddevine_mastered", "_routenote", "_mastered",
    )
    skip_substrings = ("_pilot_", "pilot_v")
    source_files = []
    for p in list_audio(SOURCE_DIR):
        stem_l = p.stem.lower()
        if any(stem_l.endswith(s) for s in skip_suffixes):
            continue
        if any(s in stem_l for s in skip_substrings):
            continue
        source_files.append(p)

    audio_files = mastered_files + source_files
    lyrics_files = sorted(
        p for p in LYRICS_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in LYRICS_EXT
    )

    lyrics_norm = [(normalize_title(p.name), p) for p in lyrics_files]
    profile = load_profile()
    by_file = profile_by_filename(profile)
    summary = profile.get("summary") or {}

    entries = []
    unmatched_audio = []
    used_lyrics: set[Path] = set()

    for audio in audio_files:
        an = normalize_title(audio.name)
        best, best_score = None, 0.0
        for ln, lp in lyrics_norm:
            sc = score_match(an, ln)
            if sc > best_score:
                best_score, best = sc, lp

        if best is None or best_score < 0.45:
            unmatched_audio.append(audio.name)
            if verbose:
                print(f"  NO MATCH  {audio.name}  (norm={an!r})")
            entry_lyrics = None
            match_score = 0.0
        else:
            used_lyrics.add(best)
            entry_lyrics = best
            match_score = round(best_score, 3)
            if verbose:
                print(f"  MATCH {match_score:.2f}  {audio.name}  ↔  {best.name}")

        row = by_file.get(audio.name, {})
        lyrics_rel = None
        lyrics_stats = None
        preview = None
        if entry_lyrics is not None:
            lyrics_rel = str(entry_lyrics.relative_to(ROOT))
            lyrics_stats = count_lyrics_stats(entry_lyrics)
            preview = read_lyrics_preview(entry_lyrics)

        track_id = re.sub(r"[^\w]+", "-", normalize_title(audio.name)).strip("-")
        prompt_path = PROMPTS_DIR / f"{track_id}.txt"
        prompt_info = None
        if prompt_path.exists():
            try:
                ptxt = prompt_path.read_text(encoding="utf-8", errors="replace").strip()
            except Exception:
                ptxt = ""
            prompt_info = {
                "path": str(prompt_path.relative_to(ROOT)),
                "chars": len(ptxt),
                "preview": (ptxt[:280] + "…") if len(ptxt) > 280 else ptxt,
            }

        entries.append({
            "id": track_id,
            "title": Path(audio.name).stem.replace("_mastered", "").strip(),
            "audio": {
                "path": str(audio.relative_to(ROOT)),
                "filename": audio.name,
                "suffix": audio.suffix.lower(),
                "size_bytes": audio.stat().st_size,
                "role": "mastered" if audio.parent.name == "mastered" else "source",
            },
            "lyrics": {
                "path": lyrics_rel,
                "filename": entry_lyrics.name if entry_lyrics else None,
                "match_score": match_score,
                "stats": lyrics_stats,
                "preview": preview,
            } if entry_lyrics else None,
            "prompt": prompt_info,
            "analysis": {
                "duration_s": row.get("duration_s"),
                "integrated_lufs": row.get("integrated_lufs"),
                "true_peak_dbtp": row.get("true_peak_dbtp"),
                "crest_factor_db": row.get("crest_factor_db"),
                "sample_rate": row.get("sample_rate"),
                "stereo": row.get("stereo"),
                "spectrum_db": row.get("spectrum_db"),
            },
        })

    unmatched_lyrics = [
        p.name for _, p in lyrics_norm if p not in used_lyrics
    ]

    manifest = {
        "artist": "D.Devine",
        "description": "Audio + lyrics dataset foundation for private generator / fine-tune",
        "created_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "paths": {
            "mastered": str(MASTERED_DIR.relative_to(ROOT)),
            "source": str(SOURCE_DIR.relative_to(ROOT)),
            "lyrics": str(LYRICS_DIR.relative_to(ROOT)),
            "profile": str(PROFILE_JSON.relative_to(ROOT)) if PROFILE_JSON.exists() else None,
        },
        "catalogue_summary": {
            "integrated_lufs_median": (summary.get("integrated_lufs") or {}).get("median"),
            "true_peak_dbtp_median": (summary.get("true_peak_dbtp") or {}).get("median"),
            "track_count_profile": profile.get("track_count"),
        },
        "counts": {
            "audio": len(audio_files),
            "lyrics_files": len(lyrics_files),
            "paired": sum(1 for e in entries if e["lyrics"]),
            "unmatched_audio": len(unmatched_audio),
            "unmatched_lyrics": len(unmatched_lyrics),
        },
        "unmatched_audio": unmatched_audio,
        "unmatched_lyrics": unmatched_lyrics,
        "tracks": entries,
    }
    return manifest


def main():
    ap = argparse.ArgumentParser(description="Build D.Devine audio↔lyrics manifest")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args()

    if not MASTERED_DIR.is_dir():
        raise SystemExit(f"Missing mastered dir: {MASTERED_DIR}")
    if not LYRICS_DIR.is_dir():
        raise SystemExit(f"Missing lyrics dir: {LYRICS_DIR}")

    print(f"Audio:  {MASTERED_DIR}")
    print(f"Lyrics: {LYRICS_DIR}")
    manifest = build_manifest(verbose=args.verbose)

    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    c = manifest["counts"]
    print()
    print(f"Paired:            {c['paired']} / {c['audio']} audio")
    print(f"Unmatched audio:   {c['unmatched_audio']}  {manifest['unmatched_audio']}")
    print(f"Unmatched lyrics:  {c['unmatched_lyrics']}  {manifest['unmatched_lyrics']}")
    print(f"Wrote: {OUT_MANIFEST}")


if __name__ == "__main__":
    main()
