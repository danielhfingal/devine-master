# DEVINE MASTER — Current state

> **Living document.** Update on every meaningful project response.  
> Sorts first in the project directory (`00_…`).

**Last updated:** 2026-09-02 — ingested `DEVINE_MASTER_quality_s2_batch3_Ops.zip` + GitHub `ae1583b`

---

## One-line state

**Daily desk is QUALITY-S2 (`v20260901lab-trinity-quality-s2`). S1 measurement truth is closed. S2 limit/export is open. S5 analysis (chords/structure) is running in parallel as provisional, not locked. F: is source of truth — do not git-pull onto daily HTML.**

---

## Authority (do not invert)

| Source | Role |
|--------|------|
| **F: `Devine_Master_Ops/daily/DEVINE_MASTER.html`** | Live daily driver |
| Zip `DEVINE_MASTER_quality_s2_batch3_Ops.zip` | Latest desk drop into this knowledge base (2026-09-01) |
| GitHub `danielhfingal/devine-master` `main` @ `ae1583b` | Sync helpers only (2026-09-02). Repo HTML is **older** than F: |
| Beta 1 freeze `v20260819n` | Historical freeze. Not the current daily. |

**Rule from `F_PUSH_SYNC_NOTE.md`:** F: is source of truth. **Do not `git pull` onto daily HTML.** Push F: → GitHub with `SYNC_FROM_F.ps1`.

---

## Stage

| Layer | State |
|-------|--------|
| **Product stage** | Quality sequence — **S1 closed, S2 open** |
| **Daily UI** | `daily/DEVINE_MASTER.html` · **`APP_BUILD = v20260901lab-trinity-quality-s2`** |
| **Banner** | `V20260901 · TRINITY · QUALITY-S2` |
| **Meter spec** | `MEASUREMENT_SPEC_VERSION = bs1770-4+tp4x-v1` |
| **Safety contract** | True Peak ceiling **−1.0 dBTP** · 4× overs · force margin **0.05 dB** (aim ≈ −1.05; cluster ≈ −1.0587 is ISP, not dual-path) |
| **Identity prior** | D.Devine / Match aim **−10.1 LUFS**; Strong-era \(x_\star\) ≈ **−9.4 LUFS** still the musical density prior |
| **Release brain** | HTML desk = release path. Offline `lab/scripts/quality_batch.py` = catalogue-scale proxy |
| **S5 lab** | Chord + structure + musical-content scale — **provisional, refuse auto-lock** |

---

## Quality sequence (ordered — do not skip)

| Step | Name | Status |
|------|------|--------|
| **S0** | Face freeze (tokens only) | Done — FREEZE1 2026-09-01 |
| **S1** | Measurement truth | **Closed 2026-09-01** — one `measureBS1770` path; `_lastMasterMetrics` bag |
| **S2** | Limit + export | **Open / active** — ceiling vs measured TP; TPDF 16-bit; gate vs −1.0 |
| **S3** | Preset targets | After S2 — D.Devine / Spotify / Match |
| **S4** | Cold map | After S3 |
| **S5** | Analysis tools | **Parallel only** — BPM/KEY/chords/structure, honest confidence |
| **S6** | Ears gate | Last — musical A/B after a model change |

S1 remaining known soft noise: tiles round to 0.1 dB; gate uses finer TP. Display precision, not a second meter.

S2 next: limiter/export honesty, then post-dither proof. Do not start S3 until S2 closes.

---

## What this knowledge base just absorbed

### From the zip (2026-09-01 QUALITY-S2 batch 3)

- Daily desk `v20260901lab-trinity-quality-s2` (installed to `daily/`, `01_ACTIVE/`, Ops root)
- `QUALITY_SEQUENCE.md`, `RUN_QUALITY_BATCH.ps1`, `EXTRACT_AND_OPEN.ps1`
- Offline meter: `lab/scripts/measure_bs1770.py` + `quality_batch.py`

Previous daily `v20260829lab-trinity-lyricsauto1` archived at  
`ARCHIVE/html/DEVINE_MASTER_v20260829lab-trinity-lyricsauto1.html`.

### From GitHub today (`ae1583b`)

- `SYNC_FROM_F.ps1` — push F: Ops lab/scripts + runs JSON + daily HTML; **never pulls**
- `F_PUSH_SYNC_NOTE.md` — F: newer than GitHub; GitHub last content push was 2026-08-28

GitHub **does not yet contain** the QUALITY-S2 desk. Root `DEVINE_MASTER.html` on GitHub is still the older ~689 KB file.

### Already in this workspace (2026-09-02, S5 parallel)

- Chord detector + 78 chord batch runs
- Structure detector; last batch Fireflies in Tar (16 sections)
- `musical_content_scale_full_20260902T194014Z.json` — 17 titles, all with structure + bass chords
- Policy: **chords/structure provisional; no auto-lock of key/chords/section labels**
- Latest S2-era gate (mixes only, 2026-09-01 23:06Z): **16/16 safetyPass**, TP cluster on the force-margin ridge

---

## Latest mix gate (16 files, all pass)

Typical D.Devine row: LUFS ≈ **−10.1**, TP ≈ **−1.059** (force margin).  
A few musical outliers stay quieter in peak (`ooh...ah...Alive` TP −3.02, `Frank & Folks` TP −2.81) and still pass −1.0.

Shake / Vagalumes original masters sit closer to **−9.2 / −9.3 LUFS** (Strong-era density), S3b rows nearer **−10.1**.

---

## S5 musical scale (provisional)

17 titles have structure + bass-chord summaries. Key/tempo **not locked** except historic locks (`ooh_ah_alive`, `pew_pew`).  
Bass-chord vs labelled key still disagrees on several titles (e.g. Espera labelled G# major, bass top Bm) — that is why auto-lock is refused.

15 structure JSON files are **orphans** (S3/S3b filename variants not merged into the 17-title scale).

---

## Open joints (now)

1. **S2** — prove limiter ceiling vs measured TP after dither on hard catalogue tracks; document force-margin as policy, not meter split
2. **Do not git-pull** GitHub HTML over F: daily
3. Push F: → GitHub with `SYNC_FROM_F.ps1` when you want the repo to catch the S2 desk
4. S5: keep chords/structure provisional; clean orphan structure files; do not lock keys from bass-chord disagreement
5. S3 preset targets only after S2 closes
6. Beta 1 `v20260819n` remains the last **named freeze**; QUALITY-S2 is the working daily, not a new freeze tag yet

---

## File map (high signal)

| Path | Role |
|------|------|
| `docs/00_BETA_STATE.md` | **This file — current state** |
| `daily/DEVINE_MASTER.html` | **Daily UI (QUALITY-S2)** |
| `01_ACTIVE/DEVINE_MASTER.html` | Same bytes (drop contract) |
| `QUALITY_SEQUENCE.md` | S0–S6 discipline |
| `SYNC_FROM_F.ps1` | F: → GitHub, no pull |
| `F_PUSH_SYNC_NOTE.md` | Authority note |
| `lab/scripts/quality_batch.py` | Offline gate/master proxy |
| `lab/scripts/measure_bs1770.py` | Python meter (same spec family) |
| `lab/scripts/chord_detector.py` | S5 chords |
| `lab/scripts/structure_detector.py` | S5 form |
| `artifacts/lab/runs/` | Batch JSON (gates, chords, structure, musical scale) |
| `ARCHIVE/html/DEVINE_MASTER_v20260829lab-trinity-lyricsauto1.html` | Previous daily |
| `docs/BETA1_GATE.md` | Historical Beta 1 gate |

---

## Historical: Beta 1 freeze (`v20260819n`, 2026-08-20)

Kept for archaeology. Not the daily driver.

- Paths: D.Devine Sound · Spotify Upload-Ready · Match Ⓟ
- Cold gravity: Baseline · Gentle · Strong (Strong = musical default)
- Do not edit `DEVINE_MASTER_Beta.html` on `main` for experiments
