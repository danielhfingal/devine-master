# Lab — modular StudioDraft extract

Beta 1 daily driver stays a **single file** on `main`.
This folder is the **lab** modular split for zone 3 only.

## Layout

```
lab/
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
```

## Contract

`module-studiodraft.js` expects desk globals:

- `findLyricsForFilename`, `normalizeTitle`, `fileName`
- `live`, `audioCtx`, `decodedBuffer` (follow)
- `loadFile` calls `sdApplyMatchedForName(name)` after load

## Build

`APP_BUILD = v20260820lab-no-title`
