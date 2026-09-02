# Repo sync (2026-09-02)

GitHub last push was 2026-08-28. F: Ops is newer (QUALITY-S2 desk + lab).

**F: is source of truth. Do not `git pull` onto daily HTML.**

To publish the live F: tree (lab + analysis JSON + desk):

```powershell
cd F:\devine-master-fresh
powershell -NoProfile -ExecutionPolicy Bypass -File .\Devine_Master_Ops\SYNC_FROM_F.ps1
```
