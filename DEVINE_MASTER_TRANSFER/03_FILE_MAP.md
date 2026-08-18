# DEVINE MASTER — File map

Root of the working project (artifacts / project directory).

---

## Top-level (documentation & transfer)

| Path | Role |
|------|------|
| `00_README_START_HERE.md` | Bootstrap for new sessions |
| `00_BETA_STATE.md` | Living Beta status (sorts first) |
| `01_PROJECT_IDENTITY.md` | Product definition |
| `02_DECISIONS_AND_RATIONALE.md` | Locked decisions |
| `03_FILE_MAP.md` | This map |
| `04_MEASUREMENTS_AND_PRIORS.md` | Numbers and priors |
| `TRANSFER_PROMPT.txt` | First message for new Grok |
| `STREAMLINE.md` | Naming / layout notes |
| `INDEX.md` | Inventory snapshot |

---

## UI

| Path | Role |
|------|------|
| `DEVINE_MASTER_Beta (29).html` | **Daily driver** |
| `DEVINE_MASTER.html` | Older snapshot — not current |
| `DeVine Master/` | Pack folder (zips, beta copies, screenshots) |

---

## Offline engine (`ai-mastering/`)

| Path | Role |
|------|------|
| `chain.py` | Mastering chain + auto gain + density + TP |
| `master.py` | CLI entry |
| `analysis.py` | LUFS / crest / TP helpers |
| `utils.py` | Load/save/resample |
| `provenance.py` | Ⓟ / soft mark |
| `repair.py` | De-clip helpers |
| `ms_exciter.py` | Width / exciter |
| `catalogue_3x3_lab.py` | Aggregate catalogue JSON → 3×3 report |
| `run_3x3_offline.py` | Offline 9-cell renders per source |
| `refresh_profile.py` | Profile refresh |
| `build_dataset.py` | Lyrics/audio manifest |
| `requirements.txt` | Dependencies |

---

## Audio & data (`tracks/`)

| Path | Role |
|------|------|
| `source/*.mp3` | Canonical raws (underscore names) |
| `mastered/` | Masters (wav/mp3); `strong/` = STRONG-eligible |
| `lyrics/` | Lyric text |
| `d_devine_reference_profile.json` | Earlier catalogue profile (~−10.1 era) |
| `cold_gravity_strong_prior.json` | **STRONG \(x_\star\)** + weights + crest floor |
| `cold_gravity_metric_report.json` | Earlier metric experiment |
| `lab_3x3_report.json` / `.md` | Catalogue 3×3 aggregation |
| `lab_3x3_renders/` | Offline renders `{preset}_{gravity}.wav` + logs |

### Sources present (raw)

- Espera_que, Fireflies_in_Tar, Frank_and_Folks, One_way_Love  
- Pew_Pew_General_Bum_Wing, The_One_That_Got_Away, The_Winds_Against_Your_Ways  
- Vagalumes_no_Alcatrao, ooh_ah_Alive  

### STRONG masters (examples)

`tracks/mastered/strong/*_STRONG.wav` — Espera, Frank & Folks, World shake, One-way Love, Pew Pew  

---

## Catalogue lab notebooks (root / catalogue_json)

- `devine_master_catalogue_2026-08-18 (1).json` — often richest (~195 entries)  
- Other dated `devine_master_catalogue_*.json` snapshots  

Schema: `devine_master_catalogue_v3` · `entries[]` · measurement_spec `bs1770-4+tp4x-v1`

---

## Naming convention

- Raw: `tracks/source/{Title}.mp3`  
- Mastered: `tracks/mastered/{Title}_mastered.{wav\|mp3}`  
- STRONG: `tracks/mastered/strong/{Title}_STRONG.wav`  
- Lab cell: `tracks/lab_3x3_renders/{Title}/{preset}_{gravity}.wav`  
- Titles: ASCII underscores; no social promo suffixes in canonical paths  

---

## Archives

- `archives/`, `library/`, `*.zip` — unpacked or backup material; prefer `tracks/` for daily work.
