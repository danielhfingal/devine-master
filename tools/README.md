# tools — Capture v1.0

Loopback record (“what you’re hearing”) → `captures\` → Lab SourceCast **A**.

## Golden path

1. **One** bridge only:
   ```text
   tools\start_capture_bridge.bat
   ```
   Wait for `self-test OK`.

2. Open Lab **StudioDraft (46)**.

3. **Record** once → play Suno on **Speakers (Realtek)** → **Stop** (Record again).

4. WAV loads into **A** (silent captures are flagged).

## Rules that prevent pain

- Never run two `capture_bridge.py` windows (port 8765 stacks → empty responses).
- Session bat **kills stale PIDs** on 8765 before start.
- Preferred device defaults toward **Speakers (Realtek High Definition Audio)** (index 0).
- **Shift+click Record** = change device.
- Stop response includes `peak` + `silent`; desk warns if peak &lt; 0.001.

## Files

| File | Role |
|------|------|
| `capture_bridge.py` | HTTP API :8765 |
| `capture_loopback.py` | CLI recorder |
| `start_capture_bridge.bat` | Clear port + start one bridge |
| `start_devine_session.bat` | Bridge + open Lab (46) |
| `DEVINE_MASTER_Lab_StudioDraft (46).html` | Desk Record/Stop UI |

## Reset device to Speakers (0)

```powershell
python tools\capture_bridge.py --device "Speakers (Realtek High Definition Audio)"
```

In desk console: `localStorage.removeItem("devine_capture_device")` then reload.
