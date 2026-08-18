# D.Devine Generator Plan (one page)

**Goal:** Private, controllable music generation in the D.Devine identity, then polish with the mastering tool (`--preset ddevine` or `spotify`).

**Dataset now:** 12 tracks paired (audio + lyrics) in `d_devine_dataset_manifest.json`, with language, BPM, key, and loudness profile.

---

## Phase A — Reference-style generation (start here)

**What:** No fine-tune. Use an open full-song / music model (or API you control) with **your** material as conditioning:

- Lyrics from the manifest (or new lyrics written in your voice)
- Style references: 1–3 masters from `tracks/mastered/` in a similar BPM/key/language band
- Prompt template locked to D.Devine habits (bilingual touches, themes, density)

**Why first:** Fast, cheap, tests whether “your lyrics + your refs” already sound on-brand before spending GPU on training.

**Workflow:**
1. Pick target: language, BPM band, key, mood (from manifest clusters).
2. Write or adapt lyrics (Grok can draft in-voice from the 12 lyric files).
3. Generate with references → export WAV/MP3.
4. Run through D.Devine mastering → A/B vs catalogue.
5. Keep winners in `tracks/source/` (and optionally promote later).

**Success test:** Blind A/B — can you tell reference-style outputs from a weak Suno default more often than not? If yes, stay on A longer. If still generic, move to B.

---

## Phase B — LoRA / light fine-tune

**What:** Small adapter on an open full-song model using the 12 pairs (audio + lyrics + metadata).

**When:** Reference-style is “close but not you.”

**Data package (already mostly ready):**
- Audio: masters as positive targets; optional raw Suno as “before” (Got Away)
- Lyrics: aligned text files
- Conditioning fields: `language`, `bpm`, `key`, `mode`, LUFS profile

**Practice:**
- Start with the smallest viable LoRA (low rank, few epochs) on 12 tracks — expect style hints, not miracles.
- Grow the set with every kept generation + every new release.
- Re-run `build_dataset.py` + enrichment after each add.

**Hardware:** Prefer a single consumer GPU or a rented box; keep training scripts offline/reproducible. No cloud lock-in for the identity.

---

## Phase C — Closed loop (always)

```
lyrics / prompt  →  generator (A or B)  →  D.Devine master  →  listen
                                              ↓
                                    keep → dataset  /  reject → notes
```

- Mastering defaults: catalogue match `--preset ddevine`, delivery `--preset spotify --format flac`.
- Watermark + provenance stay on for anything you might release.

---

## Catalogue snapshot (enriched)

| Band | Tracks (examples) |
|------|-------------------|
| ~120–140 BPM | Fireflies, Shake, Pew Pew, Got Away, Vagalumes, Alive |
| ~140–180 BPM | One-way Love, Beforedays, Espera, Neon-Jesus, Snake eyes, Frank & Folks |
| Mostly EN | Majority of set |
| PT / mixed | Vagalumes (pt); Espera, Pew Pew (mixed) |

Keys are diverse (major/minor) — good for not collapsing the model to one mood.

---

## Next concrete actions

1. **Reference-style pilot:** one new lyric (or Got Away variant) + 2 audio refs → generate → master → A/B.  
2. If pilot is weak: choose base open model + LoRA recipe (Phase B).  
3. Grow dataset only with tracks you’d stand behind.

No GPU required until Phase B. Manifest is the single source of truth:  
`tracks/d_devine_dataset_manifest.json`.
