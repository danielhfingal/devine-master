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
| `DEVINE_MASTER_Beta (29).html` | **Daily driver** UI (Web Audio live + offline-style MASTER in browser) |
| `ai-mastering/` | Python engine for transparent chain, TP limiting, provenance, batch/3×3 |
| `devine_master_catalogue_*.json` | Lab notebook of master records (schema v3) |
| `tracks/` | Sources, masters, STRONG set, lyrics, lab renders, priors |

Older: `DEVINE_MASTER.html` — do not treat as current.

---

## Paths (presets)

| ID | Label | Intent |
|----|--------|--------|
| `devine` | D.Devine Sound | Catalogue identity; STRONG prior ~**−9.4 LUFS** |
| `spotify` | Spotify Upload-Ready | Platform-clean ~**−14 LUFS**, TP safe |
| `match` | Match Ⓟ | Soft pull toward catalogue / profile (~**−10.1** historical profile; Match cells in lab) |

## Cold gravity

| Control | Meaning |
|---------|---------|
| Baseline | Weak field — light pull toward catalogue geometry |
| Gentle | Medium field |
| Strong | Strong field — preferred musical default on D.Devine |

Formal sketch used in design:

- \(\mathcal{T}\): tonal feature space  
- \(g\): geometry / metric on that space  
- \(V\): catalogue potential (from STRONG \(x_\star\) + crest ridge + TP wall)  
- \(\lambda\): gravity (Baseline/Gentle/Strong)  
- \(\tau\): temperature/noise (exploration; often near-cold in production)  
- \(\mathcal{A}\): admissible set (export/TP gates)

**Cold** means the process is increasingly trapped by the geometry of \(V\) (catalogue identity), not “dull sounding.”

---

## Artist / catalogue context

- Artist: **D.Devine**  
- Public releases exist (including Spotify).  
- Many sources are AI-assisted (e.g. Suno) then repaired/mastered.  
- Provenance mark **Ⓟ** is part of the product language.  
- RouteNote-oriented delivery: prefer **16-bit / 44.1 kHz FLAC** for distribution uploads when using the Python path.

---

## Design principles

1. Local-first, open-source friendly.  
2. Safety spine before “more magic.”  
3. Catalogue and ears over generic streaming presets for the D.Devine path.  
4. Non-destructive workflows; A/B against STRONG masters.  
5. Browser desk vs Python release brain may differ slightly — do not assume bit-identical DSP until proven.
