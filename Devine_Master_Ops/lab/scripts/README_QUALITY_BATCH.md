# Offline quality batch

Automates measure / gate / simple master across the Audio folder so you do not hand-load every track.

## Authority
- **Release path:** HTML desk (full chain).
- **This harness:** catalogue-scale measurement + loudness-aim + TP ceiling proxy.

## Setup
```powershell
cd F:\devine-master-fresh\Devine_Master_Ops
python -m pip install numpy soundfile
```

## Run
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\RUN_QUALITY_BATCH.ps1 -Mode gate
powershell -NoProfile -ExecutionPolicy Bypass -File .\RUN_QUALITY_BATCH.ps1 -Mode master -Limit 3
```

Or:
```powershell
python lab\scripts\quality_batch.py --audio-root "F:\devine-master-fresh\Audio" --mode master --presets devine,spotify,match
```

Reports: `lab\runs\quality_batch_*.json`
