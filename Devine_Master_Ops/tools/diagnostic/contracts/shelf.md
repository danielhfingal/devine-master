# Shelf release gate

- `catalogue_shelf.py package` requires `--confirm-release`
- `release.ready` is **never auto-set**
- Human types RELEASE (or equivalent confirm phrase)
- PACKAGE.json is the only completion signal for a music release candidate
- Diagnostic PACKAGE.json is a separate audit artefact — does not replace shelf PACKAGE.json
