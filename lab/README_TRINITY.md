# Trinity desk (lab) — freeze

**Banner:** `v20260822lab-trinity-freeze`

Modules: **DEVINE MASTER** · **SourceCast** · **StudioCraft**

## Daily driver

Always open the standalone:

```text
http://127.0.0.1:8080/DEVINE_MASTER_Trinity_standalone.html
```

Rebuild after modular edits:

```powershell
cd F:\devine-master-fresh\trinity-lab
python rebuild_standalone.py
```

## On F: from this tree

```powershell
cd F:\devine-master-fresh\devine-master
git fetch origin
git checkout lab
git pull origin lab
cd lab
python -m http.server 8080
```

## Freeze notes (2026-08-22)

- Gold module tabs on all three columns
- INFO hover: rail, EQ, StudioCraft (not transport Play)
- CREATE confirm: Continue / Cancel / Esc (no play-triangle trap)
- Shared globals: `mode`, `decodedBuffer`, `live` (modular boot safe)
