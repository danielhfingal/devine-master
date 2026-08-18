DEVINE MASTER — Beta state



Living document. Update on every meaningful project response.
Sorts first in the project directory (00_…).

Last updated: 2026-08-18 — D.Devine makeup raised toward STRONG x_star



One-line state

Personal offline browser mastering instrument with a real metering/export spine and catalogue-shaped cold gravity — Strong as the working musical default — early beta with identity, past blank presets, not commercial parity.



Stage







Layer



State





Product stage



Early beta / usable daily driver





Daily UI



DEVINE_MASTER_Beta (29).html





Release brain



ai-mastering/ (Python chain, TP, provenance)





Lab notebook



devine_master_catalogue_*.json (v3, 195 entries)





Identity prior



STRONG-eligible masters → (x_\star) ≈ −9.4 LUFS, crest ≈ 10.1 dB



What works





Load / play / MASTER in Beta 29



Paths: D.Devine Sound · Spotify Upload-Ready · Match Ⓟ



Cold gravity: Baseline · Gentle · Strong



Safety spine: BS.1770-4 style LUFS, TP discipline, export gates, Ⓟ language



Catalogue JSON of successful masters



Cold-gravity metric + hard crest ridge (squash cannot win (V))



3×3 catalogue lab (catalogue_3x3_lab.py) — auto-picks richest JSON



Offline 3×3 renders (run_3x3_offline.py) via chain.py



What is not done





Bit-perfect parity with a commercial chain



Adaptive “magic” mastering



Full-catalogue raw→master proofs (some raws still missing)



Browser ⇄ Python identical DSP



Complete gravity tags on all 195 catalogue rows (65 tagged; 130 legacy)



Cold gravity (current definition)

[ (\mathcal{T}, g, V, \lambda, \tau, \mathcal{A}) ]





(\mathcal{T}): tonal feature space (LUFS, crest, width, band shape, …)



(V): potential from STRONG (x_\star) + hard crest ridge + TP wall



(\lambda): Baseline / Gentle / Strong field strength



(\mathcal{A}): admissible export manifold (TP / gates)

Ears + lab: Strong is the preferred musical default on the D.Devine path; safety soft-warns still deserve a glance.



Automation (run these)

# Aggregate latest catalogue JSON into 3×3 grid report
cd ai-mastering && python3 catalogue_3x3_lab.py

# Offline Python renders (default: Wind + Espera × full 3×3)
python3 run_3x3_offline.py
python3 run_3x3_offline.py --all          # every tracks/source file

Reports: tracks/lab_3x3_report.md · Renders: tracks/lab_3x3_renders/



Open joints





Align Beta Strong DSP with STRONG (x_\star) (not only loudness)



Tag gravity on legacy catalogue entries



Batch-import offline renders back into catalogue schema



Missing raws: Neon-Jesus, Snake eyes, Beforedays, World shake



File map (high signal)







Path



Role





00_BETA_STATE.md



This file — beta state





DEVINE_MASTER_Beta (29).html



Daily UI





ai-mastering/



Offline engine





tracks/source/



Raws





tracks/mastered/strong/



STRONG-eligible WAVs





tracks/cold_gravity_strong_prior.json



(x_\star) + crest floor





devine_master_catalogue_*.json



Lab notebook exports

Latest automation smoke (offline chain)

run_3x3_offline.py --songs Wind --presets devine --gravities baseline,gentle,strong (90 s window):







Cell



LUFS



TP



Crest





devine × baseline



−11.73



−1.04



12.5





devine × gentle



−11.92



−1.04



12.7





devine × strong



−12.19



−1.04



13.0

TP gate held. Loudness still shy of STRONG (x_\star) (−9.4) on this raw — recipe gain staging to tune next. Renders: tracks/lab_3x3_renders/The_Winds_Against_Your_Ways/

Full offline 3×3 batch (complete)





Cells on disk: 81 / 81 (9 songs × 9 recipes)



Window: 45 s per render



Outputs: tracks/lab_3x3_renders/<song>/{preset}_{gravity}.wav

| Preset × Gravity | n | median LUFS | median TP | median crest | |------------------|--)------------:|----------:|-------------:| | devine × baseline | 4 | -13.04 | -1.04 | 14.46 | | devine × gentle | 4 | -13.32 | -1.04 | 14.73 | | devine × strong | 4 | -13.54 | -1.02 | 15.01 | | spotify × baseline | 5 | -14.00 | -2.62 | 14.26 | | spotify × gentle | 5 | -14.00 | -2.61 | 14.28 | | spotify × strong | 5 | -14.00 | -2.57 | 14.33 | | match × baseline | 6 | -11.95 | -1.04 | 13.50 | | match × gentle | 6 | -12.05 | -1.04 | 13.61 | | match × strong | 5 | -12.58 | -1.04 | 14.35 |

Spotify path holds −14 LUFS. D.Devine/Match hold TP ≈ −1. Absolute LUFS on quiet raws still undershoots STRONG x_star (−9.4) — next tuning is recipe makeup.

D.Devine → STRONG (x_\star) makeup (done)

Method: boost + nonlinear Limiter density loop (Stage 2b), crest floor 9.53, target LUFS −9.4, TP −1.0.

| Gravity | n | median LUFS | median TP | median crest | |---------|--)------------:|----------:|-------------:| | baseline | 9 | -9.51 | -1.06 | 10.52 | | gentle | 9 | -9.56 | -1.06 | 10.60 | | strong | 9 | -9.51 | -1.07 | 10.51 |

Most cells land near −9.4 LUFS with crest ~10–11 (above floor). Fireflies still quieter (material/crest headroom). Alive Strong TP −0.89 is a soft edge to tighten next.

Renders refreshed under tracks/lab_3x3_renders/*/devine_*.wav.

Transfer pack (2026-08-18)

For a new Grok account/session, use:





00_README_START_HERE.md



01_PROJECT_IDENTITY.md



02_DECISIONS_AND_RATIONALE.md



03_FILE_MAP.md



04_MEASUREMENTS_AND_PRIORS.md



TRANSFER_PROMPT.txt (paste as first message)

Knowledge base is files, not chat history.
