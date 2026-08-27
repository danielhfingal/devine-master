# Sync note (2026-08-27)

Pushed to main: shelf docs, engine_sourcecast, bridge README/requirements,
Windows desk launchers (`Devine_Master_Ops/launchers/`).

Full desk + Python tools: use local package `F_PUSH_shelf_desk_20260827.zip` from the project workspace if git pull is incomplete for large HTML/modules.

## After install on F:

```powershell
cd F:\devine-master-fresh\devine-master
git pull
# Daily Ops is the sibling folder — copy launchers if they are not already there:
xcopy /E /I /Y .\Devine_Master_Ops\launchers ..\Devine_Master_Ops\launchers
cd ..\Devine_Master_Ops
python .\tools\stem_bridge\catalogue_shelf.py sync
python .\tools\stem_bridge\stem_bridge.py
# Desktop shortcuts (skip copy-onto-self if already in Ops\launchers):
.\launchers\INSTALL_DESKTOP_SHORTCUTS.bat
```

Desk: STEM LAB → **SHELF** (lists INDEX via :8766) → Load stems.

Release still requires human:
`python .\tools\stem_bridge\catalogue_shelf.py package --id TRACK --confirm-release`
