/* 00-core.js — TEMPORARY LOADER
 * Restores desk after accidental placeholder overwrite.
 * Loads last known-good core from commit 7b1f6ab8.
 * Local patched copy (A/B shared playhead): see artifacts/00-core.js or RESTORE_00_CORE.md
 */
(function () {
  if (window.__dmCoreLoaded) return;
  var s = document.createElement("script");
  s.src =
    "https://cdn.jsdelivr.net/gh/danielhfingal/devine-master@7b1f6ab8d90e30c57e1f967081a1d74308cc6e7d/00-core.js";
  s.onload = function () {
    window.__dmCoreLoaded = true;
    console.log("[DEVINE] 00-core restored from 7b1f6ab8 via CDN");
  };
  s.onerror = function () {
    console.error(
      "[DEVINE] CDN restore failed. On F: run:\n" +
        "  git checkout 7b1f6ab8d90e30c57e1f967081a1d74308cc6e7d -- 00-core.js"
    );
  };
  document.head.appendChild(s);
})();
