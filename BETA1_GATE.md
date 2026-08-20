# Beta 1 gate — DEVINE MASTER

**Candidate:** `DEVINE_MASTER_Beta.html` · `APP_BUILD = v20260819n`  
**Repo commit (desk ship):** `083043c` (+ stamp `075f2c7`)  
**Date opened:** 2026-08-20

---

## 1. Code gate

| Item | Result | Notes |
|------|--------|--------|
| Duplicate `id="btnLoadFile"` in HTML body | **PASS** | Single button id in DOM. Earlier report was a false positive from JS selector strings containing `id="btnLoadFile"`. |
| Safety constants present | **PASS** | `STREAM_TP_CEILING_DBTP = -1.0`, 4× overs, force margin 0.05 |
| MASTER / Cat JSON / eligibility wired | **PASS** | Static scan |
| Python `ai-mastering/*.py` syntax | **PASS** | All modules parse |
| Offline deps in this sandbox | **N/A** | Full chain needs pedalboard / soundfile / pyloudnorm on your machine |

---

## 2. Six manual checks (sign off on your machine)

Run on the shipped `DEVINE_MASTER_Beta.html` (local file or static serve). Mark **PASS / FAIL**.

| # | Check | Pass? | Initials / date |
|---|--------|-------|-----------------|
| 1 | Load raw → **MASTER** Strong → TP ≤ **−1.0** dBTP; LUFS near path aim | ☐ | |
| 2 | **A/B** switch mid-play; transport does not stick | ☐ | |
| 3 | **Scrub** full disc; orange tracks playhead | ☐ | |
| 4 | **Cat JSON** export works; **Download** WAV 16-bit works | ☐ | |
| 5 | **Spotify** path ~−14 LUFS; **Devine** denser, still TP-safe | ☐ | |
| 6 | **Reload** page after MASTER; UI not stuck | ☐ | |

**Screenshot reference (layout OK):** vinyl A/B, MASTER between LUFS/TP, Strong default, catalogue status line — confirmed 2026-08-20.

---

## 3. Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Owner | | | ☐ **Beta 1 freeze** · ☐ Hold |

When all six checks are PASS and owner signs:

```text
BETA 1 FROZEN = v20260819n
Daily driver  = DEVINE_MASTER_Beta.html
Branches      = beta1-hotfix (regressions only) | lab (experiments)
```

---

## 4. Branch policy after freeze

```powershell
cd F:\devine-master-fresh\devine-master
git checkout main
git pull origin main

# regressions only
git checkout -b beta1-hotfix

# experiments (never merge casually to main)
git checkout main
git checkout -b lab
```

Do **not** commit experimental desk HTML to `main` without re-running this gate.
