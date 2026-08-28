# Devine Master — Muscle Memory

Living log of real failures and the fix that stuck.  
Diagnostic **Problem** tab searches this pattern set. Add a row when a new class of bug is closed.

| ID | Symptom (human words) | Root cause | Severity | Fix / host steps | Era |
|----|----------------------|------------|----------|------------------|-----|
| sourcecast-import | `No module named 'sourcecast'` | Wrong cwd / PYTHONPATH; package not on path | major | `cd` Ops; set PYTHONPATH to Ops root; install requirements | Stem Lab v1 |
| ps-cd-slash-d | `cd /d F:\...` fails in PowerShell | `/d` is cmd.exe only | major | `cd F:\devine-master-fresh\Devine_Master_Ops` | Ops bootstrap |
| path-case-ops | `devine-master-ops` not found | Windows path case / hyphen mismatch | major | Exact: `F:\devine-master-fresh\Devine_Master_Ops` | Ops bootstrap |
| expand-archive-cwd | Expand-Archive path does not exist | Zip not in current directory (often `system32`) | major | `cd` Ops first; full path to zip | Desk loop drops |
| ps-execution-policy | `.ps1` cannot be loaded | ExecutionPolicy Restricted | major | Bypass ExecutionPolicy or call python tools directly | Batch stemlab |
| ps51-optional-chain | `Unexpected token '?.Source'` | Optional chaining is not PS 5.1 | major | Rewrite launchers without `?.` | desk_loop_fix_ps51 |
| object-object-list | Song list shows `[object Object]` | `r.engine` object coerced to string | minor | engLabel / typeof string guard | song list fix |
| bridge-8766-down | Failed to fetch on :8766 | stem_bridge not running | major | START_DEVINE_DESK; curl :8766/health | bridge service |
| drone-cuts-song | Drone stops mix after ~1s | Second AudioContext + no keep-alive | major | Shared audioCtx; keep-alive; dmBPlay | drone fix |
| b-play-interrupted | play() interrupted by pause() | Infinite resume / race | major | Serialize dmBPlay; finite resume | drone fix3-4 |
| blob-404-flood | blob ERR_FILE_NOT_FOUND | Revoke while still playing | major | dmEnsureMasterBSrc from buffer | drone fix4 |
| diag-404-daily | Diagnostic 404 under /daily/ | Relative path from daily desk | major | Ops-root /tools/diagnostic/ | diag path fix |
| print-spectral-lie | Spectral shipped as print | Fallback as release | major | allow_spectral_fallback false + REFUSED | print path freeze |
| shelf-auto-release | Package without human | Silent completion | major | --confirm-release only | shelf v1 |

## Rules

1. One row per class of failure.
2. minor = deterministic HTML patch; major = host/human gate.
3. Never mark host-only audio/GPU as fixed in the diagnostic shell — refuse.
4. Note zip/build tag when a fix ships on F:.
