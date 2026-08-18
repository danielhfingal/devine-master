# DEVINE MASTER — Decisions and rationale

Document locked or high-confidence choices so a new session does not re-litigate them without evidence.

---

## Product decisions

| Decision | Rationale |
|----------|-----------|
| **Beta 29 HTML is daily driver** | User-confirmed play works; richer than older root HTML. |
| **Python `ai-mastering/` is release/lab brain** | LUFS/TP, batch, provenance, reproducible offline 3×3. |
| **Three paths: D.Devine / Spotify / Match Ⓟ** | Catalogue identity vs platform cleanliness vs soft match. |
| **Cold gravity: Baseline / Gentle / Strong** | Field strength toward catalogue potential, not three random EQ macros. |
| **Strong as musical default (D.Devine)** | Ears + lab on multiple tracks; muddy/off material improved. Soft-warns still deserve a glance. |
| **Ⓟ provenance language** | Identity and chain-of-custody; soft watermark policy on offline path (−48 dB class). |

---

## Loudness and dynamics

| Decision | Rationale |
|----------|-----------|
| **STRONG \(x_\star\) ≈ −9.4 LUFS** | Median of user-marked STRONG masters (not the older −10.1-only advisory). |
| **Crest median ≈ 10.14 dB; floor ≈ 9.53 dB** | STRONG pack statistics; hard ridge so loudness cannot be “won” by over-squashing. |
| **TP target −1.0 dBTP** | Streaming safety / inter-sample awareness. |
| **Spotify path stays ~−14 LUFS** | Platform normalization cleanliness when that path is chosen. |
| **Linear makeup alone cannot reach −9.4 under TP gate** | If crest stays high, TP ceiling binds integrated loudness. |
| **D.Devine density = boost + nonlinear Limiter + TP safety** | Crest falls so LUFS can approach \(x_\star\) without linear ceiling stalemate. |

---

## Engineering decisions

| Decision | Rationale |
|----------|-----------|
| **Catalogue JSON is lab notebook** | Immutable-ish master records; 3×3 aggregation reads `preset` × `coldGravity`. |
| **`catalogue_3x3_lab.py` auto-picks richest JSON** | Avoid manual “which export is latest.” |
| **`run_3x3_offline.py` resume-safe** | Skip existing WAVs unless `--force`; incremental manifest. |
| **45 s analysis window for offline lab renders** | Speed/cost; not a substitute for full-length final masters. |
| **File naming: ASCII underscores under `tracks/`** | Stable automation; no X promo suffixes in canonical paths. |

---

## Explicit non-goals (for now)

- Commercial-chain bit-perfect clone  
- Fully automatic genre IQ / adaptive magic  
- Assuming browser MASTER ≡ Python chain sample-for-sample  
- Overwriting user STRONG masters in place  

---

## Open joints (do not “close” without new evidence)

1. Fireflies (and similar) may remain quieter under density — material/crest headroom.  
2. Occasional TP slightly above −1 on edge cases (e.g. Alive Strong offline) — tighten safety.  
3. Legacy catalogue rows missing gravity tags (majority of early entries).  
4. Missing raws for some catalogue titles (Neon-Jesus, Snake eyes, Beforedays, World shake).  
5. Browser ⇄ Python parity test suite not frozen.

---

## Change control

- Update `00_BETA_STATE.md` when stage or automation results change.  
- Append major decisions here with date and evidence (measurement or ear + lab).  
- Prefer new versioned outputs over editing historical STRONG WAVs.
