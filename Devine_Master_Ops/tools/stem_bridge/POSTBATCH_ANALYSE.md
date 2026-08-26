# Post-batch → desk analysis ecosystem

## What the batch already wrote

```text
tracks/stems/{track_id}/
  {track_id}__vocals.wav
  {track_id}__drums.wav
  {track_id}__bass.wav
  {track_id}__other.wav
  {track_id}__stems.json          # contract sidecar

tracks/stems/_batch_reports/
  batch_YYYYMMDD_HHMMSS.json      # summary + per-track status
```

## Gap

Batch does **not** write `tracks/analysis/*_stem_tempo_key_pass.json`.
Desk BPM/KEY chips and Push→Desk JSON come from analysis, not from stem WAVs alone.

## Automated fill

```powershell
cd F:\devine-master-fresh\Devine_Master_Ops

# All complete stem folders
python .\tools\stem_bridge\catalogue_analyse.py

# Only tracks from your batch report
python .\tools\stem_bridge\catalogue_analyse.py --from-report .\tracks\stems\_batch_reports\batch_20260826_215030.json

# Smoke test
python .\tools\stem_bridge\catalogue_analyse.py --limit 3 -v
```

Output:

```text
tracks/analysis/{track_id}_stem_tempo_key_pass_YYYY-MM-DD.json
tracks/analysis/STEMLAB_POSTBATCH_INDEX_YYYY-MM-DD.json
```

Working values: **drums → tempo**, **bass → key** (unlocked). Ear lock on Trinity remains required before release.

## Pipeline (full automated catalogue)

1. `python catalogue_batch.py --mode full --root "F:\devine-master-fresh\Audio"`
2. `python catalogue_analyse.py --from-report <report>`
3. Spot-check / lock on desk for priority titles only
