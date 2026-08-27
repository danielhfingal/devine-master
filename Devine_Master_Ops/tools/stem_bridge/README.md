# Stem bridge (Phase 1 + catalogue + shelf)

Local separator service for Devine Master.

**Port:** `8766` (capture stays on `8765`)

## Start

```powershell
cd F:\devine-master-fresh\Devine_Master_Ops
python .\tools\stem_bridge\stem_bridge.py
```

Health must report `service: devine-stem-bridge`.

## Key endpoints

- `GET /health`
- `GET /catalogue/stems` · `GET /catalogue/stems/{track_id}`
- `GET /file/stems/{track_id}/{slot}`
- `GET /catalogue/shelf` · `GET /catalogue/shelf/{id}`
- `POST /separate` · `POST /catalogue/separate`

## Shelf

```powershell
python .\tools\stem_bridge\catalogue_shelf.py sync
python .\tools\stem_bridge\catalogue_shelf.py list
python .\tools\stem_bridge\catalogue_shelf.py package --id TRACK --confirm-release
```

See `SHELF.md`.
