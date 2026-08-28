# Devine Diagnostic (Ops)

Audit desk for the Trinity daily driver.

## Location

```text
Devine_Master_Ops/tools/diagnostic/
  DIAGNOSTIC.html
  MUSCLE_MEMORY.md
  contracts/
  README.md
```

## Open

Serve Ops root:

```powershell
cd F:\devine-master-fresh\Devine_Master_Ops
python -m http.server 8080
```

- Diagnostic: http://127.0.0.1:8080/tools/diagnostic/DIAGNOSTIC.html
- Desk DIAG button (path-probed)

## Problem tab (muscle memory)

1. Describe the issue under **Devine Master is giving me this problem**
2. **Search for fix** — matches MUSCLE_MEMORY patterns + snapshot markers
3. **Minor** → Apply minor fixes → download patched HTML
4. **Major** → human checkbox → major-guide JSON (host steps only)

## High-quality path

Run → Report → human checklist → type RELEASE → diagnostic PACKAGE.json only.

Runtime audio/GPU are refused, never passed.
