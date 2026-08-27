#!/usr/bin/env python3
"""
Devine Project Shelf — durable song projects under tracks/shelf/

Commands:
  sync                 Scan stems + analysis → upsert shelf entries + INDEX.json
  list                 Print shelf index
  upsert --id ID       Refresh one project
  package --id ID      Build checklist; with --confirm-release write PACKAGE.json

Release packages are never silent: --confirm-release is required.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

OPS = Path(__file__).resolve().parents[2]
STEMS = OPS / "tracks" / "stems"
ANALYSIS = OPS / "tracks" / "analysis"
SHELF = OPS / "tracks" / "shelf"
INDEX_PATH = SHELF / "INDEX.json"

SCHEMA = "devine-shelf-project/v1"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def safe_id(name: str) -> str:
    s = re.sub(r"[^\w\-]+", "_", (name or "project").strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:80] or "project"


def load_json(path: Path) -> dict | list | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_json(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2), encoding="utf-8")


def discover_track_ids() -> list[str]:
    ids: set[str] = set()
    if STEMS.is_dir():
        for d in STEMS.iterdir():
            if d.is_dir() and not d.name.startswith("_"):
                ids.add(d.name)
    if ANALYSIS.is_dir():
        for p in ANALYSIS.glob("*_stem_*pass*.json"):
            name = p.name
            for token in (
                "_stem_tempo_key_pass",
                "_stem_structure_pass",
                "_stem_lab_pass",
                "_stem_key_pass",
            ):
                if token in name:
                    ids.add(name.split(token)[0])
                    break
    return sorted(ids)


def find_analysis_paths(track_id: str) -> dict:
    out: dict[str, str] = {}
    if not ANALYSIS.is_dir():
        return out
    patterns = {
        "tempo_key": f"{track_id}_stem_tempo_key_pass*.json",
        "structure": f"{track_id}_stem_structure_pass*.json",
        "lab": f"{track_id}_stem_lab_pass*.json",
    }
    for key, pat in patterns.items():
        hits = sorted(ANALYSIS.glob(pat), key=lambda p: p.stat().st_mtime, reverse=True)
        if hits:
            out[key] = str(hits[0].resolve())
    if "tempo_key" not in out:
        for p in sorted(ANALYSIS.glob("*stem_tempo_key_pass*.json"), reverse=True):
            if track_id.lower().replace("-", "_") in p.name.lower().replace("-", "_"):
                out["tempo_key"] = str(p.resolve())
                break
    return out


def load_locks_from_analysis(paths: dict) -> dict:
    locks = {
        "tempoLocked": False,
        "tempoBpm": None,
        "keyLocked": False,
        "keyValue": None,
        "source": None,
    }
    path = paths.get("tempo_key")
    if not path:
        return locks
    doc = load_json(Path(path))
    if not isinstance(doc, dict):
        return locks
    locks["tempoLocked"] = bool(doc.get("tempoLocked"))
    locks["keyLocked"] = bool(doc.get("keyLocked"))
    tw = doc.get("tempo_working") or {}
    kw = doc.get("key_working") or {}
    summary = doc.get("summary") or {}
    locks["tempoBpm"] = tw.get("bpm") if tw.get("bpm") is not None else summary.get("tempo")
    if kw.get("key"):
        locks["keyValue"] = f"{kw.get('key')} {kw.get('mode') or ''}".strip()
        if kw.get("camelot"):
            locks["keyValue"] += f" {kw.get('camelot')}"
    elif summary.get("key"):
        locks["keyValue"] = summary.get("key")
    locks["source"] = path
    return locks


def stems_info(track_id: str) -> dict:
    d = STEMS / track_id
    if not d.is_dir():
        if STEMS.is_dir():
            for sub in STEMS.iterdir():
                if sub.is_dir() and safe_id(sub.name).lower() == safe_id(track_id).lower():
                    d = sub
                    track_id = sub.name
                    break
    info = {
        "track_id": track_id,
        "dir": None,
        "complete": False,
        "slots": [],
        "sidecar": None,
    }
    if not d.is_dir():
        return info
    info["dir"] = str(d.resolve())
    side = d / f"{d.name}__stems.json"
    slots = []
    if side.is_file():
        info["sidecar"] = str(side.resolve())
        data = load_json(side) or {}
        for st in data.get("stems") or []:
            if st.get("slot"):
                slots.append(st["slot"])
    for s in ("vocals", "drums", "bass", "other"):
        if s not in slots and (d / f"{d.name}__{s}.wav").is_file():
            slots.append(s)
    info["slots"] = slots
    info["complete"] = all(s in slots for s in ("vocals", "drums", "bass", "other"))
    return info


def empty_project(track_id: str) -> dict:
    return {
        "schema": SCHEMA,
        "id": track_id,
        "title": track_id.replace("_", " "),
        "status": "draft",
        "createdAt": _now(),
        "updatedAt": _now(),
        "audio": {"source": None, "master": None},
        "stems": {"dir": None, "complete": False, "slots": []},
        "analysis": {},
        "lyrics": {"title": None, "sheetKey": None},
        "locks": {
            "tempoLocked": False,
            "tempoBpm": None,
            "keyLocked": False,
            "keyValue": None,
            "source": None,
        },
        "master": None,
        "release": {
            "ready": False,
            "readyAt": None,
            "readyBy": None,
            "notes": "Human must confirm release — never auto-set",
        },
        "notes": "",
    }


def upsert_project(track_id: str) -> dict:
    track_id = safe_id(track_id)
    proj_dir = SHELF / track_id
    path = proj_dir / "project.json"
    existing = load_json(path)
    proj = existing if isinstance(existing, dict) else empty_project(track_id)
    proj["schema"] = SCHEMA
    proj["id"] = track_id
    proj["updatedAt"] = _now()
    if not proj.get("createdAt"):
        proj["createdAt"] = _now()

    st = stems_info(track_id)
    proj["stems"] = {
        "dir": st.get("dir"),
        "complete": bool(st.get("complete")),
        "slots": st.get("slots") or [],
        "sidecar": st.get("sidecar"),
    }
    paths = find_analysis_paths(track_id)
    proj["analysis"] = paths
    locks = load_locks_from_analysis(paths)
    prev = proj.get("locks") or {}
    if prev.get("tempoLocked") and not locks.get("tempoLocked"):
        locks["tempoLocked"] = True
        locks["tempoBpm"] = prev.get("tempoBpm") or locks.get("tempoBpm")
    if prev.get("keyLocked") and not locks.get("keyLocked"):
        locks["keyLocked"] = True
        locks["keyValue"] = prev.get("keyValue") or locks.get("keyValue")
    proj["locks"] = locks

    if paths.get("tempo_key"):
        doc = load_json(Path(paths["tempo_key"]))
        if isinstance(doc, dict) and doc.get("track"):
            proj["title"] = str(doc["track"]).replace("_", " ")

    if proj.get("release", {}).get("ready"):
        proj["status"] = "release_candidate"
    elif locks.get("tempoLocked") and locks.get("keyLocked") and st.get("complete"):
        proj["status"] = "locked"
    elif st.get("complete") or paths:
        proj["status"] = "active"
    else:
        proj["status"] = "draft"

    rel = proj.get("release") or {}
    if "ready" not in rel:
        rel["ready"] = False
    rel.setdefault("notes", "Human must confirm release — never auto-set")
    proj["release"] = rel

    write_json(path, proj)
    write_json(
        proj_dir / "links.json",
        {
            "project": str(path.resolve()),
            "stems": st.get("dir"),
            "analysis": paths,
            "updatedAt": _now(),
        },
    )
    return proj


def rebuild_index(projects: list[dict] | None = None) -> list[dict]:
    if projects is None:
        projects = []
        if SHELF.is_dir():
            for d in sorted(SHELF.iterdir()):
                if not d.is_dir() or d.name.startswith("_"):
                    continue
                doc = load_json(d / "project.json")
                if isinstance(doc, dict):
                    projects.append(doc)
    index = []
    for p in projects:
        index.append(
            {
                "id": p.get("id"),
                "title": p.get("title") or p.get("id"),
                "status": p.get("status"),
                "updatedAt": p.get("updatedAt"),
                "stemsComplete": bool((p.get("stems") or {}).get("complete")),
                "tempoLocked": bool((p.get("locks") or {}).get("tempoLocked")),
                "keyLocked": bool((p.get("locks") or {}).get("keyLocked")),
                "releaseReady": bool((p.get("release") or {}).get("ready")),
            }
        )
    index.sort(key=lambda r: str(r.get("updatedAt") or ""), reverse=True)
    write_json(INDEX_PATH, {"schema": "devine-shelf-index/v1", "updatedAt": _now(), "projects": index})
    return index


def build_checklist(proj: dict) -> dict:
    stems_ok = bool((proj.get("stems") or {}).get("complete"))
    locks = proj.get("locks") or {}
    analysis = proj.get("analysis") or {}
    items = [
        {"id": "stems", "label": "Contract stems complete (4)", "ok": stems_ok, "required": True},
        {"id": "tempo_lock", "label": "Tempo locked by human", "ok": bool(locks.get("tempoLocked")), "required": True},
        {"id": "key_lock", "label": "Key locked by human", "ok": bool(locks.get("keyLocked")), "required": True},
        {"id": "analysis", "label": "Tempo/key analysis pass present", "ok": bool(analysis.get("tempo_key")), "required": False},
        {"id": "human_confirm", "label": "Human confirmed release (--confirm-release)", "ok": bool((proj.get("release") or {}).get("ready")), "required": True},
    ]
    required_ok = all(i["ok"] for i in items if i.get("required"))
    return {
        "schema": "devine-release-checklist/v1",
        "projectId": proj.get("id"),
        "title": proj.get("title"),
        "updatedAt": _now(),
        "items": items,
        "allRequiredOk": required_ok,
        "canPackage": required_ok,
    }


def cmd_package(track_id: str, confirm: bool) -> int:
    proj = upsert_project(track_id)
    proj_dir = SHELF / safe_id(track_id)
    release_dir = proj_dir / "release"
    release_dir.mkdir(parents=True, exist_ok=True)

    checklist = build_checklist(proj)
    if confirm:
        pre = [i for i in checklist["items"] if i["required"] and i["id"] != "human_confirm"]
        if not all(i["ok"] for i in pre):
            print("[shelf] cannot confirm release — stems/locks incomplete", file=sys.stderr)
            write_json(release_dir / "CHECKLIST.json", checklist)
            rebuild_index()
            return 1
        proj["release"] = {
            "ready": True,
            "readyAt": _now(),
            "readyBy": "catalogue_shelf --confirm-release",
            "notes": "Human confirmed via CLI",
        }
        proj["status"] = "release_candidate"
        proj["updatedAt"] = _now()
        write_json(proj_dir / "project.json", proj)
        checklist = build_checklist(proj)

    write_json(release_dir / "CHECKLIST.json", checklist)

    if not confirm:
        print(f"[shelf] checklist {release_dir / 'CHECKLIST.json'}")
        print(f"[shelf] allRequiredOk={checklist['allRequiredOk']} (pass --confirm-release to package)")
        rebuild_index()
        return 0

    if not checklist["allRequiredOk"]:
        print("[shelf] checklist incomplete — PACKAGE.json not written", file=sys.stderr)
        rebuild_index()
        return 1

    package = {
        "schema": "devine-release-package/v1",
        "projectId": proj["id"],
        "title": proj.get("title"),
        "createdAt": _now(),
        "humanConfirmed": True,
        "locks": proj.get("locks"),
        "stems": proj.get("stems"),
        "analysis": proj.get("analysis"),
        "audio": proj.get("audio"),
        "checklist": checklist,
        "note": "Release candidate — human confirmed. Export masters from desk still required.",
    }
    out = release_dir / "PACKAGE.json"
    write_json(out, package)
    print(f"[shelf] PACKAGE {out}")
    rebuild_index()
    return 0


def cmd_sync(limit: int = 0) -> int:
    ids = discover_track_ids()
    if limit and limit > 0:
        ids = ids[:limit]
    projects = []
    for tid in ids:
        projects.append(upsert_project(tid))
        print(f"  upsert {tid}")
    rebuild_index(projects)
    print(f"[shelf] sync {len(projects)} projects → {INDEX_PATH}")
    return 0


def cmd_list() -> int:
    idx = load_json(INDEX_PATH)
    if not idx:
        rebuild_index()
        idx = load_json(INDEX_PATH) or {}
    rows = idx.get("projects") if isinstance(idx, dict) else []
    if not rows:
        print("[shelf] empty — run sync")
        return 0
    for r in rows:
        flags = []
        if r.get("stemsComplete"):
            flags.append("stems")
        if r.get("tempoLocked"):
            flags.append("bpm🔒")
        if r.get("keyLocked"):
            flags.append("key🔒")
        if r.get("releaseReady"):
            flags.append("RELEASE")
        print(
            f"{r.get('id'):40}  {r.get('status') or '':16}  {','.join(flags) or '—'}  {r.get('updatedAt') or ''}"
        )
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Devine durable project shelf")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_sync = sub.add_parser("sync", help="Upsert shelf from stems/analysis")
    p_sync.add_argument("--limit", type=int, default=0)

    sub.add_parser("list", help="List INDEX.json")

    p_up = sub.add_parser("upsert", help="Upsert one project")
    p_up.add_argument("--id", required=True)

    p_pkg = sub.add_parser("package", help="Checklist / release package")
    p_pkg.add_argument("--id", required=True)
    p_pkg.add_argument(
        "--confirm-release",
        action="store_true",
        help="Human yes — required to write PACKAGE.json",
    )

    args = ap.parse_args(argv)
    SHELF.mkdir(parents=True, exist_ok=True)

    if args.cmd == "sync":
        return cmd_sync(args.limit)
    if args.cmd == "list":
        return cmd_list()
    if args.cmd == "upsert":
        p = upsert_project(args.id)
        rebuild_index()
        print(json.dumps({"id": p["id"], "status": p["status"], "path": str(SHELF / p["id"] / "project.json")}, indent=2))
        return 0
    if args.cmd == "package":
        return cmd_package(args.id, bool(args.confirm_release))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
