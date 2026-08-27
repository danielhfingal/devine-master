# Post-batch analyse

Fill `tracks/analysis` from contract stems after a catalogue batch.

```powershell
cd F:\devine-master-fresh\Devine_Master_Ops
python .\tools\stem_bridge\catalogue_analyse.py --from-report .\tracks\stems\_batch_reports\batch_YYYYMMDD_HHMMSS.json -v
```

Writes `*_stem_tempo_key_pass_*.json` under `tracks/analysis`.
