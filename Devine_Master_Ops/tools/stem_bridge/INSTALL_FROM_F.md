# Stem bridge — after git pull

## On main

Full modules under `Devine_Master_Ops/tools/stem_bridge/`:

- `stem_bridge.py` — HTTP :8766 (shelf + catalogue stems)
- `catalogue_shelf.py` — durable shelf CLI
- `catalogue_structure.py` / `catalogue_phase2.py` / `catalogue_analyse.py`
- `engine_demucs.py` / `engine_sourcecast.py`

## F: quick start

```powershell
cd F:\devine-master-fresh\devine-master
git pull

cd F:\devine-master-fresh\Devine_Master_Ops
python .\tools\stem_bridge\catalogue_shelf.py sync
python .\tools\stem_bridge\stem_bridge.py
```

Capture stays on **8765**. Stems/shelf on **8766**.

Desk HTML: use latest `DEVINE_MASTER.html` from Ops daily or F package if root HTML lags.
