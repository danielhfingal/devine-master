# PRINT PATH (frozen)

Exactly one high-quality path for unmix release candidates.

## Path

`StemSeparator(config="high_quality")` with real neural checkpoints (htdemucs_ft + RoFormer ensemble).

## Rules

- `allow_spectral_fallback: false`
- If models cannot load or path degrades to spectral/HPSS only: **PRINT PATH REFUSED**
- Never treat spectral / studio_preview / batch "done" as a print master

## Verification

1. Config loads `high_quality`
2. Neural ensemble runs or explicit refuse
3. Four stems WAV at original or 44.1 kHz
4. Human listens before any release package
