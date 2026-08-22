# DEVINE MASTER — Beta state

> **Living document.** Update on every meaningful project response.  
> Sorts first in the project directory (`00_…`).

**Last updated:** 2026-08-20 — **Beta 1 freeze** (`v20260819n`)

---

## One-line state

**Personal offline browser mastering instrument with a real metering/export spine and catalogue-shaped cold gravity — Strong as the working musical default — Beta 1 frozen daily driver, not commercial parity.**

---

## Stage

| Layer | State |
|-------|--------|
| **Product stage** | **Beta 1** (frozen daily driver) |
| **Daily UI** | `DEVINE_MASTER_Beta.html` · **`APP_BUILD = v20260819n`** |
| **Release brain** | `ai-mastering/` (Python chain, TP, provenance) |
| **Lab notebook** | `devine_master_catalogue_*.json` (v3) |
| **Identity prior** | STRONG-eligible masters → \(x_\star\) ≈ **−9.4 LUFS**, crest ≈ **10.1 dB** |
| **Safety contract** | True Peak ceiling **−1.0 dBTP** · 4× overs · streaming eligibility gates |

---

## Freeze rules (Beta 1)

- **Do not** edit `DEVINE_MASTER_Beta.html` on `main` for experiments.
- Next UI/DSP work: branch **`beta1-hotfix`** (regression only) or **`lab`** (experiments).
- Ship hotfixes only after the six checks in `BETA1_GATE.md` still pass.
- Tag suggestion: `beta-1-v20260819n`

---

## What works (Beta 1)

- Load / play / MASTER in **v20260819n** desk  
- Paths: **D.Devine Sound · Spotify Upload-Ready · Match Ⓟ**  
- Cold gravity: **Baseline · Gentle · Strong** (Strong = musical default)  
- Vinyl transport: full-disc scrub, A/B, continuous play intent  
- Safety spine: BS.1770-4 style LUFS, TP discipline, export gates, Ⓟ language  
- Catalogue JSON export / stats  
- Cold-gravity metric + hard crest ridge (squash cannot win \(V\))  
- Offline engine present: `catalogue_3x3_lab.py`, `run_3x3_offline.py`, `chain.py`  

---

## What is not done (explicitly out of Beta 1)

- Bit-perfect parity with a commercial chain  
- Adaptive “magic” mastering  
- Browser ⇄ Python sample-identical DSP (shared **safety contract** only)  
- Full-catalogue raw→master proofs (some raws still missing)  
- Externalized `LYRICS_DB` (still inlined in desk HTML)  

---

## Cold gravity (current definition)

\[
(\mathcal{T}, g, V, \lambda, \tau, \mathcal{A})
\]

- \(\mathcal{T}\): tonal feature space (LUFS, crest, width, band shape, …)  
- \(V\): potential from **STRONG** \(x_\star\) + hard crest ridge + TP wall  
- \(\lambda\): Baseline / Gentle / Strong field strength  
- \(\mathcal{A}\): admissible export manifold (TP / gates)  

**Ears + lab:** Strong is the preferred *musical* default on the D.Devine path; safety soft-warns still deserve a glance.

---

## Automation (run these)

```bash
cd ai-mastering && python3 catalogue_3x3_lab.py
python3 run_3x3_offline.py
python3 run_3x3_offline.py --all
```

Reports: `tracks/lab_3x3_report.md` · Renders: `tracks/lab_3x3_renders/`

---

## Open joints (post–Beta 1)

1. Align Beta Strong DSP with STRONG \(x_\star\) (density, not only loudness)  
2. Batch-import offline renders into catalogue schema  
3. Missing raws where applicable  
4. Externalize lyrics DB; optional TP suite CI on a branch  

---

## File map (high signal)

| Path | Role |
|------|------|
| `00_BETA_STATE.md` | **This file — beta state** |
| `BETA1_GATE.md` | Gate checklist + sign-off |
| `DEVINE_MASTER_Beta.html` | **Daily UI (Beta 1 / v20260819n)** |
| `BUILD_v20260819n.txt` | Build stamp |
| `ai-mastering/` | Offline engine |
| `tracks/` | Raws / renders / priors |
| `devine_master_catalogue_*.json` | Lab notebook exports |

---

## Desk files (2026-08-21)

| Track | File | Notes |
|-------|------|--------|
| Freeze | `DEVINE_MASTER_Beta.html` | Beta 1 · `v20260819n` |
| Lab | `DEVINE_MASTER_Lab_StudioDraft.html` | StudioDraft + SourceCast · `v20260820lab-create-ring` |
| Archive | `ui/archive/` | Old Beta 29/30 HTML |

**Zones:** DEVINE MASTER (mix) · SourceCast (play) · StudioDraft (lyrics).

