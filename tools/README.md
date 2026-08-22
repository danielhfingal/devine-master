# DEVINE MASTER — tools

## Capture freeze (2026-08-22) — v2c

| File | Role |
|------|------|
| `capture_bridge.py` | Loopback capture, `build: v1x-meter`, live_peak + meter_pct |
| `DEVINE_MASTER_CAPTURE_v2c.html` | Daily driver desk (EQ L/R + REC% meters) |
| `meter_probe.html` | Bridge-only meter test |
| `CAPTURE_FREEZE_v2c.md` | Freeze notes |

### Run
```bash
python tools/capture_bridge.py
cd tools && python -m http.server 8766
# open http://127.0.0.1:8766/DEVINE_MASTER_CAPTURE_v2c.html
```

**Never** `git pull` over a working local bridge until `capture_bridge.py` on remote is non-empty and contains `v1x-meter`.
