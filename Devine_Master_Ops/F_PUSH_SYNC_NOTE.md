# Repo sync (2026-09-02)

**F: is source of truth. Do not `git pull` onto daily HTML.**

This knowledge-base / GitHub publish (QUALITY-S2) is a **push of F: bytes**, not a pull onto F:.

Canonical daily:

```text
Devine_Master_Ops/daily/DEVINE_MASTER.html
APP_BUILD = v20260901lab-trinity-quality-s2
S1 closed · S2 open
```

To publish again from F: (Windows):

```powershell
cd F:\devine-master-fresh
powershell -NoProfile -ExecutionPolicy Bypass -File .\Devine_Master_Ops\SYNC_FROM_F.ps1
```

Skip Audio / wav / zip. Scripts + `lab/runs/*.json` + daily HTML only.
