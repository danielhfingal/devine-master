/* module-studiodraft.js — StudioDraft: Craft. Sync. Create.
 * Clean load: header + current lyrics only.
 * Below fold: production notes, prompt, V-archive, basement.
 * Match keys: optional aliases only (title variants auto-derived in findLyrics).
 * Expects: findLyricsForFilename, normalizeTitle, fileName, live, audioCtx, decodedBuffer
 * Build: v20260820lab-clean
 */
(function () {
  "use strict";

  const SD_STORE_PREFIX = "devine_sd_lyrics_";
  const SD_META_PREFIX = "devine_sd_meta_";
  const SD_BELOW_PREFIX = "devine_sd_below_";

  const DEFAULT_TEMPLATE = [
    "════════════════════════════════════════════════════════════",
    "TITLE",
    "D. DeVine / dan",
    "Status: Draft",
    "Language: EN",
    "════════════════════════════════════════════════════════════",
    "",
    "[Intro]",
    "",
    "",
    "[Verse 1]",
    "",
    "",
    "[Pre-Chorus]",
    "",
    "",
    "[Chorus]",
    "",
    "",
    "[Verse 2]",
    "",
    "",
    "[Bridge]",
    "",
    "",
    "[Outro]",
    "",
    ""
  ].join("\n");

  const DEFAULT_BELOW = [
    "────────────────────────────────────────────────────────────",
    "PRODUCTION NOTES",
    "────────────────────────────────────────────────────────────",
    "Linked audio: ",
    "Status:",
    "  [ ] Mastered 16-bit WAV",
    "  [ ] Mastered MP3",
    "  [ ] Mastered 16-bit FLAC",
    "  [ ] Lyrics locked",
    "  [ ] Streaming eligible",
    "  [ ] Local",
    "  [ ] On Spotify",
    "  [ ] Other important info",
    "",
    "────────────────────────────────────────────────────────────",
    "PROMPT",
    "════════════════════════════════════════════════════════════",
    "",
    "",
    "────────────────────────────────────────────────────────────",
    "CREATIVE PROCESS NOTES",
    "────────────────────────────────────────────────────────────",
    "",
    "────────────────────────────────────────────────────────────",
    "      -- HARD BOTTOM BASEMENT --",
    "────────────────────────────────────────────────────────────",
    ""
  ].join("\n");

  const sdState = {
    liveLyrics: true,
    follow: false,
    editing: false,
    locked: false,
    sections: [],
    source: "template",
    below: "",
    showBelow: false
  };

  function sd$(id) { return document.getElementById(id); }

  function sdSetBtn(id, on) {
    const el = sd$(id);
    if (!el) return;
    el.classList.toggle("on", !!on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function sdSongName(name) {
    return String(name || (typeof fileName !== "undefined" ? fileName : "") || "")
      .replace(/_/g, " ")
      .replace(/\.[^.]+$/, "")
      .trim();
  }

  function sdNorm(name) {
    if (typeof normalizeTitle === "function") {
      return normalizeTitle(name || (typeof fileName !== "undefined" ? fileName : "") || "untitled") || "untitled";
    }
    return String(name || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || "untitled";
  }

  function sdStorageKey(name) { return SD_STORE_PREFIX + sdNorm(name); }
  function sdMetaKey(name) { return SD_META_PREFIX + sdNorm(name); }
  function sdBelowKey(name) { return SD_BELOW_PREFIX + sdNorm(name); }

  function sdLoadOverride(name) {
    try { return localStorage.getItem(sdStorageKey(name)); } catch (e) { return null; }
  }
  function sdSaveOverride(name, text) {
    try { localStorage.setItem(sdStorageKey(name), text); } catch (e) { console.warn("sd save", e); }
  }
  function sdLoadBelow(name) {
    try { return localStorage.getItem(sdBelowKey(name)); } catch (e) { return null; }
  }
  function sdSaveBelow(name, text) {
    try { localStorage.setItem(sdBelowKey(name), text || ""); } catch (e) {}
  }
  function sdLoadMeta(name) {
    try {
      const raw = localStorage.getItem(sdMetaKey(name));
      return raw ? JSON.parse(raw) : { locked: false };
    } catch (e) { return { locked: false }; }
  }
  function sdSaveMeta(name, meta) {
    try { localStorage.setItem(sdMetaKey(name), JSON.stringify(meta || {})); } catch (e) {}
  }

  function sdParseLockedFromText(text) {
    if (/Locked:\s*(yes|true|1|✓)/i.test(text)) return true;
    if (/Lyrics locked\s*\[x\]/i.test(text)) return true;
    if (/Locked:\s*(no|false|0)/i.test(text)) return false;
    return null;
  }

  /** Split full sheet into clean (header+body) and below-fold archive */
  function sdSplitSheet(text) {
    const lines = String(text || "").split(/\n/);
    let cut = -1;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^PRODUCTION NOTES/i.test(t)) { cut = i; break; }
      if (/^SCRATCH PAD/i.test(t)) { cut = i; break; }
      if (/^PROMPT\s*$/i.test(t)) { cut = i; break; }
      if (/^CREATIVE PROCESS/i.test(t)) { cut = i; break; }
      if (/HARD BOTTOM BASEMENT/i.test(t)) { cut = i; break; }
      if (/^-{3,}\s*V\d+/i.test(t)) { cut = i; break; }
      if (/^V\d+\s*$/i.test(t) && i > 5) { cut = i; break; }
      if (/^-{5,}V\d+/i.test(t)) { cut = i; break; }
      // version banners like ------------------V6
      if (/^-{4,}.*\bV\d+\b/i.test(t)) { cut = i; break; }
    }

    // If no formal footer, cut at first "long prose" block after last [Section]
    // (genre soup / prompt paragraph stuck under outro)
    if (cut < 0) {
      let lastSection = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*\[[^\]]+\]\s*$/.test(lines[i])) lastSection = i;
      }
      if (lastSection >= 0) {
        for (let i = lastSection + 1; i < lines.length; i++) {
          const t = lines[i].trim();
          if (!t) continue;
          if (/^\s*\[[^\]]+\]\s*$/.test(t)) continue;
          if (/^\(.*\)\s*$/.test(t)) continue; // parenthetical ad-libs stay in body
          // long single line without section look = process dump
          if (t.length > 160 && !/^\s*\[/.test(t)) {
            cut = i;
            break;
          }
          // multiple consecutive non-lyric process lines
          if (/genres?:/i.test(t) || /walking bass/i.test(t) || /Bar \d/i.test(t)) {
            cut = i;
            break;
          }
        }
      }
    }

    let cleanLines, belowLines;
    if (cut >= 0) {
      cleanLines = lines.slice(0, cut);
      belowLines = lines.slice(cut);
    } else {
      cleanLines = lines;
      belowLines = [];
    }

    // Strip Match keys from clean display (aliases optional; title match is automatic)
    cleanLines = cleanLines.filter(function (line) {
      return !/^\s*Match keys:/i.test(line);
    });

    // Trim trailing blank lines in clean
    while (cleanLines.length && !cleanLines[cleanLines.length - 1].trim()) cleanLines.pop();
    cleanLines.push("");

    return {
      clean: cleanLines.join("\n"),
      below: belowLines.join("\n").replace(/^\s+/, "")
    };
  }

  function sdExportCleanText(text) {
    const parts = sdSplitSheet(text);
    // Export: title block light + body sections only
    const lines = parts.clean.split(/\n/);
    const out = [];
    let pastHeader = false;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^═+$/.test(t)) {
        if (!pastHeader) { out.push(lines[i]); continue; }
        out.push(lines[i]);
        pastHeader = true;
        continue;
      }
      if (!pastHeader) {
        if (/^(Status:|Language:|Key:|Form:|Match keys:)/i.test(t)) continue;
        out.push(lines[i]);
        // after second ═ we set pastHeader on next rule line
        continue;
      }
      out.push(lines[i]);
    }
    // simpler: use parts.clean but drop status/language if user wants pure lyrics — keep title+artist
    return parts.clean.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function sdParseSections(text) {
    const lines = String(text || "").split(/\n/);
    const sections = [];
    let cur = { title: "Body", start: 0, lines: [] };
    lines.forEach(function (line, i) {
      const m = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (m) {
        if (cur.lines.length || sections.length === 0) sections.push(cur);
        cur = { title: m[1], start: i, lines: [line] };
      } else cur.lines.push(line);
    });
    if (cur.lines.length) sections.push(cur);
    if (!sections.length) sections.push({ title: "Body", start: 0, lines: lines });
    return sections;
  }

  function sdRenderText(text, asHtmlSections) {
    const body = sd$("sdLyricsBody");
    if (!body) return;
    const t = text == null ? "" : String(text);
    sdState.sections = sdParseSections(t);
    if (asHtmlSections && sdState.sections.length && !sdState.editing) {
      body.innerHTML = sdState.sections.map(function (s, idx) {
        const esc = s.lines.join("\n").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return '<div class="sd-section" data-sd-idx="' + idx + '">' + esc + "</div>";
      }).join("\n");
    } else {
      body.innerText = t;
    }
  }

  function sdRenderBelow(text) {
    const el = sd$("sdBelowBody");
    if (!el) return;
    el.innerText = text || "";
    sdState.below = text || "";
    const wrap = sd$("sdBelowWrap");
    if (wrap) {
      wrap.style.display = (text && text.trim()) ? "" : "none";
    }
  }

  function sdApplyLockedUI() {
    const body = sd$("sdLyricsBody");
    const editBtn = sd$("sdLiveEdit");
    const saveBtn = sd$("sdSave");
    sdSetBtn("sdLocked", sdState.locked);
    if (sdState.locked) {
      sdState.editing = false;
      sdSetBtn("sdLiveEdit", false);
      if (body) body.contentEditable = "false";
      if (editBtn) editBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
    } else {
      if (editBtn) editBtn.disabled = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function sdApplyMatchedForName(name) {
    const body = sd$("sdLyricsBody");
    const label = sd$("sdTemplateLabel");
    const metaEl = sd$("sdMeta");
    if (!body) return;

    const metaStored = sdLoadMeta(name);
    sdState.locked = !!metaStored.locked;

    const override = sdLoadOverride(name);
    const belowStored = sdLoadBelow(name);
    let full = override;
    let source = "local edit";
    if (full == null) {
      const matched = typeof findLyricsForFilename === "function" ? findLyricsForFilename(name || "") : null;
      if (matched) {
        full = matched;
        source = "LYRICS_DB";
      } else {
        const song = sdSongName(name);
        full = DEFAULT_TEMPLATE.replace(/^TITLE$/m, song || "TITLE");
        source = "template";
      }
    }

    const parts = sdSplitSheet(full);
    let clean = parts.clean;
    let below = belowStored != null ? belowStored : parts.below;
    if (!below || !below.trim()) below = source === "template" ? DEFAULT_BELOW : parts.below;

    const lockedFromSheet = sdParseLockedFromText(full);
    if (lockedFromSheet != null && override == null) sdState.locked = lockedFromSheet;

    sdState.source = source;
    body.style.display = sdState.liveLyrics ? "" : "none";

    const song = sdSongName(name);
    if (label) {
      if (song) {
        label.textContent = song + (sdState.locked ? " \uD83D\uDD12" : "");
        label.title = source === "LYRICS_DB" ? "Matched from LYRICS_DB (clean view)" : source === "local edit" ? "Local edit" : "Template";
      } else {
        label.textContent = "[ LYRICS TEMPLATE ]";
      }
    }

    sdRenderText(clean, !sdState.editing);
    sdRenderBelow(below);
    body.contentEditable = (sdState.editing && !sdState.locked) ? "true" : "false";
    sdApplyLockedUI();

    if (metaEl) {
      const bits = [source, "clean"];
      if (below && below.trim()) bits.push("notes below");
      if (sdState.locked) bits.push("locked");
      metaEl.textContent = bits.join(" \u00b7 ");
    }
    const legacy = document.getElementById("lyrics");
    if (legacy) legacy.innerText = clean + (below ? "\n\n" + below : "");
  }

  function sdFollowTick() {
    if (!sdState.follow || sdState.editing) return;
    const body = sd$("sdLyricsBody");
    if (!body || !sdState.sections.length) return;
    let t = 0;
    try {
      const a = document.getElementById("audioB");
      const preferB = document.getElementById("tabB") && document.getElementById("tabB").classList.contains("on");
      const audio = preferB && a && a.src ? a : document.getElementById("audioA");
      if (audio && isFinite(audio.duration) && audio.duration > 0) t = audio.currentTime / audio.duration;
      else if (typeof live !== "undefined" && live && live.playing && typeof decodedBuffer !== "undefined" && decodedBuffer) {
        const now = (typeof audioCtx !== "undefined" && audioCtx && audioCtx.currentTime) || 0;
        const cur = (live.offset || 0) + Math.max(0, now - (live.startedAt || now));
        t = Math.max(0, Math.min(1, cur / (decodedBuffer.duration || 1)));
      }
    } catch (e) {}
    const n = sdState.sections.length;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
    body.querySelectorAll(".sd-section").forEach(function (el, i) {
      el.classList.toggle("is-active", i === idx);
    });
    const active = body.querySelector(".sd-section.is-active");
    if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function sdComposeFull() {
    const bodyEl = sd$("sdLyricsBody");
    const belowEl = sd$("sdBelowBody");
    const clean = bodyEl ? bodyEl.innerText : "";
    const below = belowEl ? belowEl.innerText : (sdState.below || "");
    if (below && below.trim()) return clean.replace(/\s+$/, "") + "\n\n" + below.replace(/^\s+/, "");
    return clean;
  }

  function sdDoSave() {
    if (sdState.locked) {
      const metaEl = sd$("sdMeta");
      if (metaEl) metaEl.textContent = "Locked \u2014 unlock to save";
      return;
    }
    const name = typeof fileName !== "undefined" ? fileName : "";
    const full = sdComposeFull();
    sdSaveOverride(name, full);
    const belowEl = sd$("sdBelowBody");
    if (belowEl) sdSaveBelow(name, belowEl.innerText);
    sdSaveMeta(name, { locked: sdState.locked });
    if (sdState.editing) {
      sdState.editing = false;
      sdSetBtn("sdLiveEdit", false);
      const bodyEl = sd$("sdLyricsBody");
      if (bodyEl) bodyEl.contentEditable = "false";
      sdRenderText(bodyEl ? bodyEl.innerText : "", true);
    }
    const metaEl = sd$("sdMeta");
    if (metaEl) metaEl.textContent = "Saved \u00b7 " + sdSongName(name);
    const label = sd$("sdTemplateLabel");
    if (label && sdSongName(name)) {
      label.textContent = sdSongName(name) + (sdState.locked ? " \uD83D\uDD12" : "");
    }
  }

  function sdExportClean() {
    const bodyEl = sd$("sdLyricsBody");
    if (!bodyEl) return;
    const clean = sdExportCleanText(bodyEl.innerText);
    const song = sdSongName(typeof fileName !== "undefined" ? fileName : "lyrics");
    const fname = (song || "lyrics").replace(/[^\w\s\-]+/g, "").replace(/\s+/g, "_") + "_lyrics.txt";
    try {
      const blob = new Blob([clean], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      const metaEl = sd$("sdMeta");
      if (metaEl) metaEl.textContent = "Exported clean \u00b7 " + fname;
    } catch (e) { console.warn("sd export", e); }
  }

  function sdWire() {
    const liveBtn = sd$("sdLiveLyrics");
    const followBtn = sd$("sdLiveFollow");
    const editBtn = sd$("sdLiveEdit");
    const infoBtn = sd$("sdInfo");
    const lockBtn = sd$("sdLocked");
    const exportBtn = sd$("sdExportClean");
    const saveBtn = sd$("sdSave");
    const belowToggle = sd$("sdBelowToggle");
    const body = sd$("sdLyricsBody");

    if (liveBtn) liveBtn.onclick = function () {
      sdState.liveLyrics = !sdState.liveLyrics;
      sdSetBtn("sdLiveLyrics", sdState.liveLyrics);
      if (body) body.style.display = sdState.liveLyrics ? "" : "none";
    };

    if (followBtn) followBtn.onclick = function () {
      sdState.follow = !sdState.follow;
      if (sdState.follow && sdState.editing) {
        sdState.editing = false;
        sdSetBtn("sdLiveEdit", false);
        if (body) { sdRenderText(body.innerText, true); body.contentEditable = "false"; }
      }
      sdSetBtn("sdLiveFollow", sdState.follow);
    };

    if (editBtn) editBtn.onclick = function () {
      if (sdState.locked) {
        const metaEl = sd$("sdMeta");
        if (metaEl) metaEl.textContent = "Locked \u2014 unlock to edit";
        return;
      }
      sdState.editing = !sdState.editing;
      if (sdState.editing) {
        sdState.follow = false;
        sdSetBtn("sdLiveFollow", false);
        if (body) {
          const text = body.innerText;
          body.innerHTML = "";
          body.innerText = text;
          body.contentEditable = "true";
          body.focus();
        }
        const metaEl = sd$("sdMeta");
        if (metaEl) metaEl.textContent = "Editing clean sheet \u2014 Save when done";
      } else if (body) {
        body.contentEditable = "false";
        sdRenderText(body.innerText, true);
      }
      sdSetBtn("sdLiveEdit", sdState.editing);
    };

    if (lockBtn) lockBtn.onclick = function () {
      sdState.locked = !sdState.locked;
      const name = typeof fileName !== "undefined" ? fileName : "";
      sdSaveMeta(name, { locked: sdState.locked });
      sdApplyLockedUI();
      const label = sd$("sdTemplateLabel");
      if (label && sdSongName(name)) label.textContent = sdSongName(name) + (sdState.locked ? " \uD83D\uDD12" : "");
      const metaEl = sd$("sdMeta");
      if (metaEl) metaEl.textContent = sdState.locked ? "Locked" : "Unlocked";
    };

    if (exportBtn) exportBtn.onclick = function () { sdExportClean(); };
    if (saveBtn) saveBtn.onclick = function () { sdDoSave(); };

    if (belowToggle) belowToggle.onclick = function () {
      sdState.showBelow = !sdState.showBelow;
      const panel = sd$("sdBelowPanel");
      if (panel) panel.hidden = !sdState.showBelow;
      belowToggle.textContent = sdState.showBelow ? "Hide notes / versions" : "Show notes / versions";
    };

    if (infoBtn) infoBtn.onclick = function () {
      const metaEl = sd$("sdMeta");
      if (metaEl) metaEl.textContent = "Clean lyrics on top \u00b7 Notes/V-archive below \u00b7 Export clean = body only";
    };

    sdSetBtn("sdLiveLyrics", true);
    sdSetBtn("sdLiveFollow", false);
    sdSetBtn("sdLiveEdit", false);
    sdSetBtn("sdLocked", false);
    setInterval(sdFollowTick, 400);

    if (body && !body.innerText.trim()) {
      sdRenderText(DEFAULT_TEMPLATE, true);
      sdRenderBelow(DEFAULT_BELOW);
      const label = sd$("sdTemplateLabel");
      if (label) label.textContent = "[ LYRICS TEMPLATE ]";
    }
  }

  window.sdApplyMatchedForName = sdApplyMatchedForName;
  window.sdExportCleanText = sdExportCleanText;
  window.sdSplitSheet = sdSplitSheet;
  window.sdDoSave = sdDoSave;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      try { sdWire(); } catch (e) { console.warn("sdWire", e); }
    });
  } else {
    try { sdWire(); } catch (e) { console.warn("sdWire", e); }
  }
})();
