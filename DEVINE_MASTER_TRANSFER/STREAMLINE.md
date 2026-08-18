# DEVINE MASTER — Streamlined layout
Updated: 2026-08-18 07:28 UTC

## Audio naming convention
- Source (raw / by-dan): `tracks/source/{Title}.mp3`
- Mastered: `tracks/mastered/{Title}_mastered.{mp3|wav}`
- Titles use ASCII underscores (no X promo suffixes)

## tracks/source (raw)
- `Espera_que.mp3`
- `Fireflies_in_Tar.mp3`
- `Frank_and_Folks.mp3`
- `Pew_Pew_General_Bum_Wing.mp3`
- `The_One_That_Got_Away.mp3`
- `The_Winds_Against_Your_Ways.mp3`
- `Vagalumes_no_Alcatrao.mp3`

## tracks/mastered
- `Espera_que_mastered.mp3`
- `Espera_que_mastered.wav`
- `Fireflies_in_Tar_mastered.mp3`
- `Fireflies_in_Tar_mastered.wav`
- `Frank_and_Folks_mastered.mp3`
- `Frank_and_Folks_mastered.wav`
- `Ill_make_the_world_shake_mastered.mp3`
- `Ill_make_the_world_shake_mastered.wav`
- `Neon_Jesus_mastered.mp3`
- `Neon_Jesus_mastered.wav`
- `One_way_Love_mastered.mp3`
- `One_way_Love_mastered.wav`
- `Pew_Pew_General_Bum_Wing_mastered.mp3`
- `Pew_Pew_General_Bum_Wing_mastered.wav`
- `Snake_eyes_sold_mastered.mp3`
- `Snake_eyes_sold_mastered.wav`
- `The_Beforedays_mastered.mp3`
- `The_Beforedays_mastered.wav`
- `The_One_That_Got_Away_mastered.mp3`
- `The_Winds_Against_Your_Ways_mastered.mp3`
- `Vagalumes_no_Alcatrao_mastered.mp3`
- `Vagalumes_no_Alcatrao_mastered.wav`
- `ooh_ah_Alive_mastered.mp3`
- `ooh_ah_Alive_mastered.wav`

## Strong PNG matrix (from your tests)
| Shot | Path | Measured (from UI) | Notes |
|------|------|--------------------|-------|
| Master Strong | `screenshots/matrix_strong/Master Strong.PNG` | LUFS −9.0 · TP −1.09 | D.Devine Sound · eligible |
| Wind Strong | `screenshots/matrix_strong/Wind_Strong.PNG` | LUFS −10.2 · TP −1.06 | crest −3.7 dB warning |
| Wind Strong Match | `…/Wind_Strong_Match.PNG` | LUFS −10.3 · TP −1.06 | Match Ⓟ · crest −3.6 dB |
| Wind Strong Spotify | `…/Wind_Strong_Spotify.PNG` | (see file) | Spotify path |
| Espera Strong | `…/Espera que_Strong.PNG` | LUFS −8.8 · TP −1.06 | D.Devine · eligible · Drive 0.08 |
| Espera Match Strong | `…/Espera que_Match_Strong.PNG` | (see file) | Match Ⓟ |
| Espera Spotify Strong | `…/Espera que_Spotify_Strong.PNG` | (see file) | Spotify |

### Strong takeaway
- Intensity **Strong** + **D.Devine Sound** aims ~−10.1 but can land **hotter** (−9.0 / −8.8) on catalogue masters.
- **Wind** raw→Strong hits ~−10.2 with **crest reduction warnings** (~3.6–3.7 dB) — dynamics soft gate.
- Hard gates (TP ≤ −1.0 class) generally **pass**; soft gate is the breathing check.

## UI
- Daily driver: `DEVINE_MASTER_Beta (29).html`
- Older: `DEVINE_MASTER.html`

## Update — raw sources added
- `tracks/source/One_way_Love.mp3` (was root `One-way Love.mp3`)
- `tracks/source/ooh_ah_Alive.mp3` (was root `ooh...ha...Alive .mp3`)

Still missing raw (mastered only): Neon_Jesus, Snake_eyes_sold, The_Beforedays, Ill_make_the_world_shake — OK when you find them.
