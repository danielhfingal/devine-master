# Phase 2 — Multi-engine + SourceCast high_quality

## Engines

| Spec | Behaviour |
|------|-----------|
| `htdemucs` | Phase 1 baseline |
| `sourcecast:high_quality` | SourceCast ensemble |
| `multi` (default) | Compare + promote SourceCast when available |

## Priority list

`tracks/stems/_priority.txt` — one track_id or path per line.

## Commands

```powershell
cd F:\devine-master-fresh\Devine_Master_Ops
$env:PYTHONPATH = "$PWD;$PWD\..;$PWD\..\sourcecast"
python .\tools\stem_bridge\catalogue_phase2.py -v
```

See tool docstring in `catalogue_phase2.py`.
