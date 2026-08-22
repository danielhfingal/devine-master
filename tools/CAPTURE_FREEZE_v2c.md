# Capture stack freeze — v2c (2026-08-22)

## Daily driver
- **Desk:** `tools/DEVINE_MASTER_CAPTURE_v2c.html`
  - APP_BUILD: `v20260822lab-capture-v2c`
  - Banner: `CAPTURE DESK v2c — EQ + REC%`
  - Logo: `V20260822 · CAPTURE`
- **Bridge:** `tools/capture_bridge.py`
  - `/health` must include `"build": "v1x-meter"`
  - Mid-record: `live_peak` + `meter_pct` on `/status`

## Meters (intentional)
- EQ L/R rails while recording
- Small **REC NN%** under Record button
- No corner overlay

## Run
```text
python tools/capture_bridge.py          # keep open, :8765
cd tools && python -m http.server 8766
http://127.0.0.1:8766/DEVINE_MASTER_CAPTURE_v2c.html
```
Not file://. Not Downloads.

## Do not regress
- Never add a second captureLevelTimer in `captureSetArmed` that reads only `last_peak`
- `captureLevelShow` is the single meter owner

## Probe
`tools/meter_probe.html` — isolates bridge levels without the full desk.
