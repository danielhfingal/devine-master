# Trinity desk — modular lab

Daily freeze on `main` stays a **single HTML file**.  
This folder is the **lab split** of the same desk.

## Names (locked)

| # | Name | What it is |
|---|------|------------|
| 1 | **DEVINE MASTER** | Left card: rail, EQ, gravity, MASTER DSP, catalogue, gates |
| 2 | **SourceCast** | LP / vinyl: disc, A/B, play, scrub, capture → side A |
| 3 | **StudioCraft** | Lyrics: Craft. Sync. Create (formerly StudioDraft in code paths) |

## Layout

```
lab/
  DEVINE_MASTER.html                 # shell (loads 3 modules)
  css/00-tokens.css                  # shared chrome
  css/module-devine-master.css       # module 1
  css/module-sourcecast.css          # module 2
  css/module-studiocraft.css         # module 3 (StudioCraft)
  js/00-core.js                      # shared brain (load, live graph, INFO)
  js/module-devine-master.js         # DSP / MASTER / catalogue
  js/module-sourcecast.js            # vinyl scrub + capture bridge
  js/module-studiocraft.js           # lyrics (StudioCraft)
```

## Contract

Scripts are **classic globals** (not ES modules) so the audio graph stays one process.

Load order is mandatory:

1. `00-core.js`
2. `module-devine-master.js`
3. `module-sourcecast.js`
4. `module-studiocraft.js`

`module-sourcecast.js` defines `window.updateScrubUI` / `window.setVinylSpin` for the core tick loop.

## Run

Serve this folder over HTTP (not file://).

## Freeze

Do not treat this split as the Beta 1 daily driver. Pack back to one HTML before freeze.


## Product names vs file names

| Product name | Role | Current file stem (lab) |
|--------------|------|-------------------------|
| **DEVINE MASTER** | Mastering desk | `module-devine-master` |
| **SourceCast** | LP player | `module-sourcecast` |
| **StudioCraft** | Lyrics / sheet | `module-studiocraft` |

Do not call both 2 and 3 “StudioCraft”. SourceCast = transport; StudioCraft = lyrics.
