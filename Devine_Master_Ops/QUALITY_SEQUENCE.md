# Devine Master — Quality Sequence (ordered)

**Rule:** Sharpen in order. Skipping steps puts noise into every later step.  
**Ears (S6)** confirm after the model is sharper — they do not replace S1–S5.

| Step | Name | Purpose | Status |
|------|------|---------|--------|
| **S0** | Face freeze | Design tokens only; no chrome noise | Done (FREEZE1) |
| **S1** | Measurement truth | One meter path for LUFS + TP; export uses same function | **Active** |
| **S2** | Limit + export | Look-ahead ceiling holds; WAV/TPDF; gate matches meter | Next |
| **S3** | Preset targets | D.Devine / Spotify / Match hit stated LUFS+TP | After S2 |
| **S4** | Cold map | Tonal/dynamics mapping consistent, not random | After S3 |
| **S5** | Analysis tools | BPM/KEY/structure confidence (honest, not inflated) | Parallel only if it does not touch master path |
| **S6** | Ears gate | Musical A/B after a model change | Last |

## S1 — Measurement truth (current)

**Single source of truth**

- `MEASUREMENT_SPEC_VERSION = bs1770-4+tp4x-v1`
- `measureBS1770(buffer)` → Integrated LUFS + True Peak (4×)
- `measureLoudness` is an alias — do not invent a second loudness path
- Live UI and MASTER/export **must** call the same core

**S1 pass criteria**

1. Pre- and post-master numbers both come from `measureBS1770`
2. Eligibility / Streaming Export uses the **same** TP/LUFS as the report
3. No “display rounded green / file red” split without an explicit residual clamp story
4. Spec version visible on export status line

**S1 non-goals**

- No new meters UI
- No new presets
- No ear “which sounds better” yet

## S2 preview (do not start until S1 closed)

- Limiter ceiling vs measured TP agreement on hard catalogue tracks
- TPDF 16-bit path unchanged unless proven broken
- Gate thresholds align with STREAM_TP_CEILING_DBTP (−1.0)

## How to work a step

1. Change **one** subsystem  
2. Batch or multi-track check where possible  
3. Write results into catalogue / taskspec notes  
4. Only then open the next step  

Noise is unwelcome. Sequence is the product discipline.


## S1a — Single metrics bag (noise kill)

**Problem:** UI tiles, status line, eligibility panel, and Quality Gate could *look* aligned while reading different precision or different code paths (DOM text vs re-measure vs opts.loud).

**Fix:** After MASTER, one object owns the truth:

```js
window._lastMasterMetrics = {
  lufs, tp, integratedLUFS, truePeakdBTP,
  method, spec, build, at
}
```

- Tiles written from `loud` (same measureBS1770 call)
- Eligibility prefers `opts.loud` → `_lastMasterMetrics` → re-measure only as last resort
- Quality Gate prefers `_lastMasterMetrics` over parsing tile text

**Remaining known soft noise (not fixed in S1a):** tile display rounds to 0.1 dB; gate uses finer TP for hard pass. That is display precision, not a second meter — document, do not dual-path.


## S1b — Catalogue audit

See `S1_CATALOGUE_AUDIT_2026-09-01.md`. Window note aligned to 60s. S1 ready to close after one confirming master row.


## S1 CLOSED (2026-09-01)

Confirmed on s1b catalogue (Neon-Jesus centre_60s, 0 splits). See `S1_CLOSED_S2_OPEN_2026-09-01.md`.

## S2 OPEN — limit/export

TP cluster ≈ −1.0587 is force margin (−1.0 − 0.05), not meter noise. Sharpen policy honesty then post-dither proof.
