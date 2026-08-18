# Open joints — closed 2026-08-18

Evidence-based closure of the four joints listed in GitHub `00_BETA_STATE.md` / decisions.

---

## 1. Edge TP slightly over −1 (offline)

**Status: CLOSED (engineering)**

| Change | Where |
|--------|--------|
| `true_peak_limit` strict ≤ target; work margin 0.12 dB; more iterations; last-resort pull | `ai-mastering/analysis.py` |
| Density still ends in TP limit | `ai-mastering/chain.py` |
| Browser `STREAM_TP_FORCE_MARGIN_DB = 0.12`, more force passes | `DEVINE_MASTER_Beta.html` → **v20260818e** |

**Proof:** `reports/parity_tp_suite_*.json` — stressed limits PASS at TP ≤ −1.0.

---

## 2. Legacy catalogue rows lack gravity tags

**Status: CLOSED (data)**

| Tool | Result |
|------|--------|
| `ai-mastering/backfill_gravity_tags.py` | 186 entries |
| kept (already tagged) | 56 |
| legacy → **baseline** + `gravityInferred=true` | 130 |

Rule: unknown pre-control rows default to **baseline** (honest), not Strong.

---

## 3. Fireflies-class quieter under density

**Status: CLOSED (policy + denser try) — not “forced to −9.4”**

| Action | Detail |
|--------|--------|
| Density loop | more steps; stagnation continues while far from aim and above crest floor |
| Crest ridge | remains hard — loudness cannot win by killing crest |
| Measurement | Fireflies full-chain sample quieter than x_star, TP compliant |

**Formal rule:** If crest floor binds before x_star, the master is **admissible at lower LUFS**.

---

## 4. Browser ⇄ Python parity not frozen

**Status: CLOSED (minimal suite frozen) — not bit-identical DSP**

| Shared contract | Value |
|-----------------|--------|
| Published TP ceiling | **−1.0 dBTP** |
| Working margin | **0.12 dB** |
| Oversampling | **4×** |
| Suite | `parity_tp_suite.py` |

**Not claimed:** sample-identical offlineAudioContext vs Pedalboard.
**Claimed:** same safety contract (TP ≤ −1.0) with automated regression.

---

## Commands

```bash
cd ai-mastering  # or DEVINE_MASTER_TRANSFER/ai-mastering
python3 backfill_gravity_tags.py
python3 parity_tp_suite.py --limit 6
python3 parity_tp_suite.py --limit 4 --full-chain
```
