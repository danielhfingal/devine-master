# Stem Bridge (Phase 1)

Local Demucs-class stem separation for Devine Master Ops.

```powershell
cd F:\devine-master-fresh\Devine_Master_Ops\tools\stem_bridge
pip install -r requirements-stem.txt
python catalogue_batch.py --mode full
python catalogue_analyse.py --from-report ..\..\tracks\stems\_batch_reports\batch_YYYYMMDD_HHMMSS.json
```

Contract stems: `tracks/stems/{track_id}/` + `__stems.json`  
Analysis: `tracks/analysis/*_stem_tempo_key_pass_*.json` via `catalogue_analyse.py`
