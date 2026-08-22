# DEVINE MASTER

Personal offline mastering + lyric craft + Suno capture desk.  
**One-operator tool** — not for distribution.

## Open these (most used → least)

| Priority | File | Role |
|----------|------|------|
| **1** | `tools/DEVINE_MASTER_CAPTURE_v2c.html` | **Daily capture desk** (Record → SourceCast → MASTER) |
| **2** | `tools/capture_bridge.py` | Local loopback bridge (`127.0.0.1:8765`) |
| **3** | `DEVINE_MASTER_Beta.html` | **Beta 1 freeze** (`v20260819n`) — mix/master desk |
| **4** | `DEVINE_MASTER_Lab_StudioDraft.html` | Lab: StudioDraft + SourceCast + MASTER |
| **5** | `tracks/lyrics/` | Lyric sheets |
| **6** | `catalogue/` | Catalogue JSON |
| **7** | `ai-mastering/` | Offline Python mastering chain |

## Quick start (capture)

```powershell
cd F:\devine-master-fresh\devine-master
python tools\capture_bridge.py
# open tools\DEVINE_MASTER_CAPTURE_v2c.html
```

Or one-time autostart (bridge at logon), then only open the HTML and press **Record**.

## Zones

| Zone | Role |
|------|------|
| **DEVINE MASTER** | Mix / master / export |
| **SourceCast** | Play / A·B / vinyl / scrub |
| **StudioDraft** | Lyrics — Craft · Sync · Create |

## Active docs (root)

- `00_BETA_STATE.md` — freeze status  
- `BETA1_GATE.md` — Beta 1 checklist  
- `CAPTURE_PIPELINE_DECISIONS.md` — Suno loopback decisions  

Longer docs → `docs/`

## Archive

Unused / historical desks and stamps → `archive/` (see `archive/README.md`).

## Layout

```
tools/           CAPTURE v2c desk + bridge (top of stack)
DEVINE_MASTER_Beta.html
DEVINE_MASTER_Lab_StudioDraft.html
tracks/          lyrics, prompts, masters
catalogue/       catalogue JSON
ai-mastering/    offline engine
lab/             optional StudioDraft modules
docs/            project docs & history notes
archive/         old HTML, builds, transfer snapshot
```
