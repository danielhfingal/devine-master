# Capture pipeline — decisions (locked 2026-08-21)

**Status:** Design only — not built yet. Trinity desk is stable daily base.

## Goal
Record/import what you are hearing → land in SourceCast A → master with existing DEVINE MASTER.

## Locked decisions

| Item | Choice |
|------|--------|
| Priority capture | **(c) System loopback** (“record what I’m hearing”) |
| Record format | **Match the source/site output** (do not force a different codec at capture) |
| Where it lives | **(c) Both** — import in the desk; loopback via **local script** on F: |
| Length | Demos **under ~10 minutes** (music only) |
| After capture | **Auto-load into SourceCast A** and stop |
| Naming | `YYYYMMDD_HHMM_source_capture.<ext>` under a **fixed folder on F:** |

## Architecture (when built)

1. **Loopback script** (Windows): WASAPI loopback or virtual cable → write file with native format from the stream (or lossless sibling if the API only gives PCM).
2. **Desk import**: existing file load; optional “watch folder” or “open last capture” later.
3. **Master**: unchanged Trinity path (SourceCast → DEVINE MASTER → export).

## Non-goals (this slice)
- Full DAW / stems / transcription
- Hour-long captures
- Cloud upload

## Suggested F: folder (confirm when implementing)
`F:\devine-master-fresh\devine-master\captures\` 
or `F:\Devine Master\captures\`
