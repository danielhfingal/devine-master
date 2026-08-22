<<<<<<< HEAD
# Trinity desk — modular lab

Daily freeze on `main` stays a **single HTML file**.  
This folder is the **lab split** of the same desk.

## Names (locked)

| # | Name | What it is |
|---|------|------------|
| 1 | **DEVINE MASTER** | Left card: rail, EQ, gravity, MASTER DSP, catalogue, gates |
| 2 | **SourceCast** | LP / vinyl: disc, A/B, play, scrub, capture → side A |
| 3 | **StudioCraft** | Lyrics: Craft. Sync. Create (formerly StudioDraft in code paths) |
=======
# Lab — modular StudioDraft extract

Beta 1 daily driver stays a **single file** on `main`.
This folder is the **lab** modular split for zone 3 only.
>>>>>>> 85642bc0b6e3bf9e49bd6bc09edd503b156bd9c0

## Layout

```
lab/
<<<<<<< HEAD
  DEVINE_MASTER.html                 # shell (loads 3 modules)
  css/00-tokens.css                  # shared chrome
  css/module-devine-master.css       # module 1
  css/module-sourcecast.css          # module 2
  css/module-studiocraft.css         # module 3 (StudioCraft)
  js/00-core.js                      # shared brain (load, live graph, INFO)
  js/module-devine-master.js         # DSP / MASTER / catalogue
  js/module-sourcecast.js            # vinyl scrub + capture bridge
  js/module-studiocraft.js           # lyrics (StudioCraft)
=======
  DEVINE_MASTER_Beta.html      # desk shell (core still inline)
  css/module-studiodraft.css   # Module 3 styles
  js/module-studiodraft.js     # Module 3 logic
```

## Zones (mental model)

1. **Adjustments** — still inline in the HTML (rail + EQ)
2. **Transport** — still inline (vinyl, A/B, play, MASTER)
3. **StudioDraft** — **this module** (Craft. Sync. Create)

## Features (lab)

- Clean sheet + notes/versions below fold (newline repair)
- Block follow with Neon-Jesus startSec map
- Desk INFO hover on StudioDraft controls (center over vinyl)
- No native `title` tooltips on StudioDraft buttons

## Run

```powershell
cd lab
python -m http.server 8080
# browser → http://localhost:8080/DEVINE_MASTER_Beta.html
>>>>>>> 85642bc0b6e3bf9e49bd6bc09edd503b156bd9c0
```

## Contract

<<<<<<< HEAD
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
=======
`module-studiodraft.js` expects desk globals:

- `findLyricsForFilename`, `normalizeTitle`, `fileName`
- `live`, `audioCtx`, `decodedBuffer` (follow)
- `loadFile` calls `sdApplyMatchedForName(name)` after load

## Build

`APP_BUILD = v20260820lab-no-title`
>>>>>>> 85642bc0b6e3bf9e49bd6bc09edd503b156bd9c0
