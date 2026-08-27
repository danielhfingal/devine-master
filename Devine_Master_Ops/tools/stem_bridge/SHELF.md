# Devine Project Shelf (v1)

Durable home for a song under Ops — not only browser `localStorage`.

## Layout

```text
tracks/shelf/
  INDEX.json                          # lightweight list for OPEN
  {project_id}/
    project.json                      # devine-shelf-project/v1
    links.json                        # optional path pointers
    release/
      CHECKLIST.json                  # human gates
      PACKAGE.json                    # built only after confirm
```

## project.json (core)

| Field | Meaning |
|-------|---------|
| `id` | Stable id (usually track_id) |
| `title` | Display title |
| `status` | draft · active · locked · release_candidate · released |
| `audio.source` | Path to mix / master source |
| `stems.dir` | `tracks/stems/{id}` when present |
| `analysis` | Paths to tempo/key/structure passes |
| `lyrics` | Sheet title + optional export path |
| `locks` | tempo/key locked flags + values (human only) |
| `master` | Last MASTER summary if known |
| `release.ready` | **false until a human says yes** |

## Human gate

Nothing in `release/PACKAGE.json` is written unless:

```bash
python catalogue_shelf.py package --id Espera_que_mastered --confirm-release
```

Without `--confirm-release`, the tool only refreshes the checklist.

## Commands

```powershell
cd F:\devine-master-fresh\Devine_Master_Ops

# Build / refresh shelf entries from stems + analysis
python .\tools\stem_bridge\catalogue_shelf.py sync

# List shelf
python .\tools\stem_bridge\catalogue_shelf.py list

# One title
python .\tools\stem_bridge\catalogue_shelf.py upsert --id Espera_que_mastered

# Checklist only (no package)
python .\tools\stem_bridge\catalogue_shelf.py package --id Espera_que_mastered

# Human yes → write PACKAGE.json
python .\tools\stem_bridge\catalogue_shelf.py package --id Espera_que_mastered --confirm-release
```

## Bridge friction (related)

- Capture: **8765**
- Stem bridge: **8766**
- Health must say `devine-stem-bridge` before Load stems
