DeVine Master — Ops-critical pack
Target: F:\devine-master-fresh\Devine_Master_Ops

Open desk:
  cd F:\devine-master-fresh\Devine_Master_Ops\daily
  python -m http.server 8080
  http://127.0.0.1:8080/DEVINE_MASTER.html

Banner should include: QUALITY-S2  (v20260901lab-trinity-quality-s2)
Do not git pull onto daily HTML. F: is source of truth.

Folders:
  daily/              — current Trinity desk HTML (QUALITY-S2)
  01_ACTIVE/          — drop-contract copy of daily
  tracks/analysis/    — stem / chord / structure passes
  tracks/project_json — project JSON
  catalogue/          — catalogue export
  lab/scripts/        — offline quality + S5 analysis
  lab/runs/           — batch JSON
  docs/               — 00_BETA_STATE + notes
