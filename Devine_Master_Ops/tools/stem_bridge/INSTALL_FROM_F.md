# Stem bridge install after git pull

## On main now

- `catalogue_shelf.py` — durable shelf CLI
- `catalogue_batch.py` / `catalogue_discover.py` / `engine_demucs.py` / `engine_sourcecast.py`
- `write_stem_bridge_only.py` — expands `stem_bridge.py` (shelf API + health ports)

## After pull on F:

```powershell
cd F:\devine-master-fresh\devine-master
git pull
cd ..\Devine_Master_Ops\tools\stem_bridge
python .\write_stem_bridge_only.py
# writes stem_bridge.py next to this script

cd ..\..
python .\tools\stem_bridge\catalogue_shelf.py sync
python .\tools\stem_bridge\stem_bridge.py
```

Full desk HTML + remaining modules (`catalogue_structure`, `catalogue_phase2`, `catalogue_analyse`) are in the F package:

`F_PUSH_shelf_desk_20260827.zip`

Copy those three `.py` files into `tools\stem_bridge\` if you need structure/phase2/analyse.
