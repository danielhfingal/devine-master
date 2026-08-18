# DEVINE MASTER — Project identity

## Plain-language definition (canonical)

DEVINE MASTER is a **local browser mastering desk** for the D.Devine catalogue: load a track, shape it toward a **D.Devine** or **Spotify-ready** target (and **Match Ⓟ**), check it with serious loudness/true-peak metering, and only then export a safe master. It is **not** a full mix suite and **not** a cloud “AI masterer.”

At Beta stage the **measurement and safety spine is real** — versioned metering mindset, TP discipline, export gates, and a growing JSON catalogue of successful MASTER passes. The musical side is catalogue-driven: a **“cold” tonal pull** with **Cold gravity** control (**Baseline / Gentle / Strong**). Lab and ears have treated **Strong** as the better *musical* default on the D.Devine path.

**Not yet:** bit-perfect parity with a commercial chain, adaptive magic, or a fully polished product UI.

**One line:** a personal, honest, offline mastering instrument with identity and a lab notebook — early beta, past “blank preset pack,” steered by catalogue and ears rather than a generic loudness preset.

---

## Product surfaces

| Surface | Role |
|---------|------|
| `DEVINE_MASTER_Beta (29).html` | **Daily driver** UI |
| `ai-mastering/` | Python engine (chain, TP, provenance, 3×3) |
| `devine_master_catalogue_*.json` | Lab notebook |
| `tracks/` | Sources, masters, STRONG set, lyrics, priors |
| GitHub `danielhfingal/devine-master` | Living source of truth |

---

## Paths (presets)

| ID | Label | Intent |
|----|--------|--------|
| `devine` | D.Devine Sound | Catalogue identity; STRONG ~**−9.4 LUFS** |
| `spotify` | Spotify Upload-Ready | Platform-clean ~**−14 LUFS** |
| `match` | Match Ⓟ | Soft catalogue pull |

## Cold gravity

| Control | Meaning |
|---------|---------|
| Baseline | Weak field |
| Gentle | Medium field |
| Strong | Preferred musical default on D.Devine |

## Design principles

1. Local-first, open-source friendly.
2. Safety spine before more magic.
3. Catalogue and ears over generic streaming presets for D.Devine path.
4. Non-destructive workflows; A/B against STRONG masters.
5. Browser vs Python DSP may differ until proven identical.
