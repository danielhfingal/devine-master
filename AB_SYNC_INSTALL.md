# A/B SYNC — install

## Behaviour
After MASTER (A source + B master loaded):
- One transport clock
- Monitor tab is audible; other side shadows **muted**
- A↔B flip does not restart — only swaps audible side
- Seek applies to both

## Install
1. Ensure `module-ab-sync.js` is in the repo root (with `00-core.js`).
2. In modular HTML, after core:

```html
<script src="../00-core.js"></script>
<script src="../module-ab-sync.js"></script>
```

For single-file daily desk, paste the script before `</body>`.

3. Open **HTML Desk** (localhost), hard refresh.
4. Load → MASTER → Play → flip A/B — position should hold; status may show `SYNC A↔B`.
