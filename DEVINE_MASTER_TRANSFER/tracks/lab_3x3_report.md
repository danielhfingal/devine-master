# DEVINE MASTER — 3×3 Catalogue Lab Report

Generated: `2026-08-18T08:52:51.013906+00:00`
Catalogue: `/home/workdir/artifacts/devine_master_catalogue_2026-08-18 (1).json`
Entries: **195** · with preset×gravity: **65** · incomplete: **130**

## Grid (median LUFS / crest / safety)

| Preset \ Gravity | Baseline | Gentle | Strong |
|------------------|----------:|-------:|-------:|
| **D.Devine Sound** | n=17 · -9.1 LUFS · c 10.4 · 100% | n=7 · -10.1 LUFS · c 12.2 · 100% | n=22 · -9.3 LUFS · c 10.9 · 100% |
| **Spotify Upload-Ready** | n=3 · -14.0 LUFS · c 12.2 · 100% | n=3 · -14.0 LUFS · c 12.2 · 100% | n=4 · -14.0 LUFS · c 13.3 · 100% |
| **Match Ⓟ** | n=3 · -9.5 LUFS · c 12.2 · 100% | n=3 · -10.1 LUFS · c 12.2 · 100% | n=3 · -9.4 LUFS · c 12.2 · 100% |

## Recommendations (catalogue evidence)

### D.Devine Sound
1. **baseline** (n=17) — score 9.78, LUFS -9.05646004975653, crest 10.400892450809792, safety 1.0, soft-warns 0.17647058823529413
2. **strong** (n=22) — score 9.61, LUFS -9.275438419055689, crest 10.925260023438184, safety 1.0, soft-warns 0.2727272727272727
3. **gentle** (n=7) — score 9.26, LUFS -10.100000000245625, crest 12.204896018612912, safety 1.0, soft-warns 0.42857142857142855

### Spotify Upload-Ready
1. **baseline** (n=3) — score 9.69, LUFS -14.00000000009718, crest 12.204896018612912, safety 1.0, soft-warns 0
2. **gentle** (n=3) — score 9.69, LUFS -14.000000000000126, crest 12.204896018612912, safety 1.0, soft-warns 0
3. **strong** (n=4) — score 9.52, LUFS -13.999999999862027, crest 13.341072975321726, safety 1.0, soft-warns 0

### Match Ⓟ
1. **baseline** (n=3) — score 9.36, LUFS -9.548437709736625, crest 12.204896018612912, safety 1.0, soft-warns 0.3333333333333333
2. **gentle** (n=3) — score 9.36, LUFS -10.10000000025868, crest 12.204896018612912, safety 1.0, soft-warns 0.3333333333333333
3. **strong** (n=3) — score 9.02, LUFS -9.415549268086307, crest 12.204896018612912, safety 1.0, soft-warns 0.6666666666666666

## Song coverage

| Song | Entries | Cells filled | Complete 3×3? |
|------|--------:|-------------:|:-------------:|
| The Wind's Against Your Ways_mastered | 27 | 9/9 | yes |
| Espera, quê - D. DeVine_mastered | 25 | 9/9 | yes |
| Frank & Folks_mastered | 18 | 3/9 | no |
| The Beforedays_mastered | 16 | 0/9 | no |
| One-way Love - I wish she dreams tonight | 14 | 2/9 | no |
| Neon-Jesus_mastered | 13 | 0/9 | no |
| Pew Pew - General bum wing_mastered | 13 | 2/9 | no |
| Sorry, not sorry Deuce - Snake eyes sold, double ones, rolled!!_mastered | 12 | 0/9 | no |
| Vagalumes no Alcatrão - D. DeVine_mastered | 12 | 0/9 | no |
| ooh...ah...Alive_mastered | 12 | 0/9 | no |
| The One That Got Away | 11 | 2/9 | no |
| Fireflies in Tar_mastered | 11 | 2/9 | no |
| ...I’ll make the world shake! _mastered | 11 | 2/9 | no |

## Local source simulations → STRONG \(x_\star\)

| File | Raw LUFS | Raw dist² | Strong V | Gentle V | Baseline V |
|------|---------:|----------:|---------:|---------:|-----------:|
| Espera_que.mp3 | -9.923282924729703 | 59.04972256519522 | 3.7 | 14.8 | 33.2 |
| Fireflies_in_Tar.mp3 | -8.662160659371068 | 10.185958401376872 | 0.6 | 2.5 | 5.7 |
| Frank_and_Folks.mp3 | -10.128880050356171 | 25.662275094864707 | 1.6 | 6.4 | 14.4 |
| One_way_Love.mp3 | -12.506468567996027 | 165.93447288631785 | 10.4 | 41.5 | 93.3 |
| Pew_Pew_General_Bum_Wing.mp3 | -11.466927197989111 | 95.06079774443081 | 5.9 | 23.8 | 53.5 |
| The_One_That_Got_Away.mp3 | -15.937834068472855 | 323.06210700625735 | 20.2 | 80.8 | 181.7 |
| The_Winds_Against_Your_Ways.mp3 | -14.859487373262047 | 242.07017850305027 | 15.1 | 60.5 | 136.2 |
| Vagalumes_no_Alcatrao.mp3 | -15.305410347315249 | 419.0658064423894 | 26.2 | 104.8 | 235.7 |
| ooh_ah_Alive.mp3 | -13.170340674703038 | 200.59308442794645 | 12.5 | 50.1 | 112.8 |

_Simulated feature-space pull only — not a full Beta render._

## Notes
- Gravity is read from `mapping_results.coldGravity` / `coldTonal.gravity`.
- Many early entries lack gravity tags (counted as incomplete for the 3×3).
- Broadened metrics use `metrics` + `analysis` + `validation_results` + processing/mapping when present.