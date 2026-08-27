# DEVINE MASTER — Windows desk launchers

Place this folder at:

```text
F:\devine-master-fresh\Devine_Master_Ops\launchers\
```

Python 3 must be on PATH.

## One-click install

Double-click **`INSTALL_DESKTOP_SHORTCUTS.bat`**.

Creates on the Desktop:

| Shortcut | What it does |
|---|---|
| **DEVINE MASTER — HTML Desk** | Preferred. Local HTTP on 8080 (or next free), opens the daily desk in the browser, starts capture bridge. |
| **DEVINE MASTER — Local Desk** | Opens `daily\DEVINE_MASTER.html` with `file://`, starts capture bridge, opens STEM LAB if present. |
| **DEVINE MASTER — Kill Servers** | Stops the HTTP server(s) and capture bridge started by this pack. |

## Manual use (no shortcuts)

- `DEVINE_MASTER_HTML_Desk.bat`
- `DEVINE_MASTER_Local_Desk.bat`
- `DEVINE_MASTER_Kill_Servers.bat`

## Path override

If auto-detect is wrong, edit `_config.bat`:

```bat
set "DEVINE_OPS_ROOT=F:\devine-master-fresh\Devine_Master_Ops"
```

## HTML Desk URLs

Served from the Ops root:

- Daily desk: `http://127.0.0.1:8080/daily/DEVINE_MASTER.html`
- Capture desk (if present): `http://127.0.0.1:8766/DEVINE_MASTER_CAPTURE_v2c.html`
- Capture bridge: `127.0.0.1:8765`

If 8080 is already taken by something else, the launcher uses 8081–8099.

## Notes

- Consoles start **minimized**. The HTTP window stays running so modules keep working.
- If the HTML server is already up, HTML Desk only re-opens the browser.
- Capture meters need **HTML Desk** (`http://`), not `file://`.
- Nothing overwrites masters, captures, or project JSON.
