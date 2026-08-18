# DEVINE MASTER — Start here (transfer bootstrap)

**Purpose:** Open this pack in a **new Grok session/account** so project knowledge is restored from **files**, not from old chat history.

**Last packed:** 2026-08-18

---

## Read order (mandatory)

1. `00_README_START_HERE.md` (this file)
2. `00_BETA_STATE.md` — living status of Beta
3. `01_PROJECT_IDENTITY.md` — what the product is
4. `02_DECISIONS_AND_RATIONALE.md` — locked choices and why
5. `03_FILE_MAP.md` — where everything lives
6. `04_MEASUREMENTS_AND_PRIORS.md` — numbers that drive the chain
7. `TRANSFER_PROMPT.txt` — paste as first message to new Grok

Then open code only as needed: `ai-mastering/`, `DEVINE_MASTER_Beta (29).html`.

---

## What this project is (30 seconds)

- **Local-first** mastering desk for D.Devine catalogue music (often Suno → repair → master).
- **Browser daily driver:** `DEVINE_MASTER_Beta (29).html`
- **Offline release brain:** `ai-mastering/` (Python: LUFS, true-peak, chain, Ⓟ, 3×3 lab)
- **Paths:** D.Devine Sound · Spotify Upload-Ready · Match Ⓟ
- **Cold gravity:** Baseline · Gentle · Strong (field strength toward catalogue identity)
- **Not** a cloud AI masterer; **not** a full mix suite.

---

## How to start a new Grok session

1. Upload or mount this project folder (or at least all `00_*.md`–`04_*.md` + `TRANSFER_PROMPT.txt` + key JSON).
2. Paste **entire** contents of `TRANSFER_PROMPT.txt` as message 1.
3. Ask Grok to confirm Beta state in one paragraph against `00_BETA_STATE.md`.
4. Only then continue work (fixes, DSP, docs).

---

## Non‑negotiables for any assistant

- Preserve existing masters and sources (non-destructive; versioned outputs).
- Daily driver stays **Beta 29** unless explicitly frozen to a new name.
- D.Devine loudness identity tracks **STRONG prior** (~−9.4 LUFS), not generic −14.
- Spotify path remains **~−14 LUFS** for platform cleanliness.
- True-peak discipline **≤ −1 dBTP** (hard gate mindset).
- Crest floor on STRONG-oriented work **~9.53 dB** — do not “win” loudness by over-squashing.
- Prefer smallest reliable change; no speculative rewrites of the whole stack.

---

## Quick commands (offline)

```bash
cd ai-mastering
pip install -r requirements.txt   # if present; else soundfile pyloudnorm pedalboard numpy scipy

# Catalogue 3×3 aggregation (auto-picks richest catalogue JSON)
python3 catalogue_3x3_lab.py

# Offline 3×3 renders (resume-safe; use --force to overwrite)
python3 run_3x3_offline.py --songs Wind,Espera
python3 run_3x3_offline.py --all --presets devine --force
```

---

## After transfer — verify

Ask the new session:

1. What is the daily UI file and product stage?
2. What is STRONG \(x_\star\) (LUFS + crest + floor)?
3. Where do offline 3×3 renders live?

Answers must match `00_BETA_STATE.md` and `04_MEASUREMENTS_AND_PRIORS.md`.
