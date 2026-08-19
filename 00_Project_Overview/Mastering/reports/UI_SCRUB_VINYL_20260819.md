# UI note — scrub + vinyl (2026-08-19)

**Build:** `v20260818r`

## Geometry
- Outer disc: `.ring-wrap` sized `min(90cqi, 90cqb, 68vmin)` → true circle
- Scrub: SVG `<circle r="100">` = same diameter as disc viewBox edge
- Progress: CCW from top (`scale(-1,1)` + dasharray)

## Behaviour
- Orange stroke-dasharray tracks playhead
- Vinyl `.ring.spinning` while A live or B playing

## Sync
Workspace HTML is source of truth for this build; push full `DEVINE_MASTER_Beta.html` from F: if GitHub API rejects large single-file push.
