# DEVINE MASTER — Measurements and priors

Treat numbers as **evidence**, not absolute aesthetic law. Prefer A/B against STRONG masters.

---

## STRONG prior \(x_\star\) (authoritative for D.Devine offline)

Source: `tracks/cold_gravity_strong_prior.json`  
Built from user-marked STRONG masters only.

| Feature | Value (approx.) |
|---------|-----------------|
| **LUFS** | **−9.44** |
| **Crest** | **10.14 dB** |
| **Crest floor** | **9.53 dB** (Q25 − 0.5) |
| Side/mid | Very narrow (catalogue near-mono low end behaviour) |
| Spectral shape | Relative band energies in JSON (`b_sub` … `b_air`) |

### Potential / ridge (design)

\[
V(x) = \|x - x_\star\|_W^2
+ 2.5[\max(0, c_\star - c)]^2
+ 12[\max(0, c_{\min} - c)]^2
+ 8[\max(0, \mathrm{TP}+1)]^2
\]

Over-squash cannot win \(V\) by crushing crest below the floor.

---

## Historical catalogue profile (context)

`tracks/d_devine_reference_profile.json` — earlier extraction from released masters:

- Target advisory was often **−10.1 LUFS / −1.0 dBTP**  
- Still useful for Match / documentation  
- **D.Devine Strong identity for offline density follows STRONG \(x_\star\) (−9.4), not only −10.1**

---

## Offline D.Devine remake (2026-08-18) — post density stage

Method: boost + nonlinear Limiter + TP safety; crest floor 9.53; aim −9.4 LUFS.  
Log: `tracks/lab_3x3_renders/devine_remake.log`

| Gravity | n | median LUFS | median TP | median crest |
|---------|--)------------:|----------:|-------------:|
| Baseline | 9 | ~−9.51 | ~−1.06 | ~10.52 |
| Gentle | 9 | ~−9.56 | ~−1.06 | ~10.60 |
| Strong | 9 | ~−9.51 | ~−1.07 | ~10.51 |

**Outliers / notes**

- Fireflies: remained quieter (~−11.5 to −12.5) — density did not fully close gap.  
- Alive Strong: TP ~−0.89 (slightly hot) — safety tightening candidate.  
- Lab renders use **~45 s** windows — not full-length delivery masters.

---

## Full offline 3×3 batch

- **81 / 81** cells on disk under `tracks/lab_3x3_renders/`  
- Grid: `{devine,spotify,match}` × `{baseline,gentle,strong}` × 9 sources  
- Spotify cells designed for **−14 LUFS**  
- D.Devine cells **re-forced** after density upgrade (see remake log)

---

## Catalogue JSON lab (browser masters)

- Richest export often: `devine_master_catalogue_2026-08-18 (1).json` (~195 entries)  
- Gravity tagged subset smaller (~65 with preset×gravity); many legacy rows lack gravity  
- Aggregate: `python3 ai-mastering/catalogue_3x3_lab.py` → `tracks/lab_3x3_report.md`

Example Devine cell medians from one aggregation (tagged subset): Strong ~−9.3 LUFS, high safety pass rate — interpret with sample size.

---

## Engineering constraints (always)

- **True-peak** and inter-sample peaks matter after limiting and codecs.  
- **Limiter overshoot** and linear “ceiling gain” do not densify crest.  
- **Codec peaks** (MP3/AAC/Ogg) can exceed file TP after encode — leave margin for delivery.  
- **Loudness normalization** on Spotify will turn −9.4 and −14 into different playback gain; path choice is intentional.

---

## How to refresh priors

1. Add new STRONG WAVs only when ears + gates agree.  
2. Re-run measurement script / prior fit on `tracks/mastered/strong/`.  
3. Write new `cold_gravity_strong_prior.json` (version or date in notes).  
4. Update this file and `00_BETA_STATE.md`.
