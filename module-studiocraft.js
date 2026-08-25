/* module-studiocraft.js — Module 3: StudioDraft
 * Craft. Sync. Create
 */
/* module-studiocraft.js — StudioCraft: Craft. Sync. Create.
 * Clean load: header + current lyrics only.
 * Below fold: production notes, prompt, V-archive, basement.
 * Match keys: optional aliases only (title variants auto-derived in findLyrics).
 * Expects: findLyricsForFilename, normalizeTitle, fileName, live, audioCtx, decodedBuffer
 * Build: v20260820lab-save-template
 */
(function () {
  "use strict";

  const SD_STORE_PREFIX = "devine_sd_lyrics_v3_";
  const SD_META_PREFIX = "devine_sd_meta_v3_";
  const SD_BELOW_PREFIX = "devine_sd_below_v3_";

  const DEFAULT_TEMPLATE = [
    "════════════════════════════════════════════════════════════",
    "TITLE",
    "D. DeVine / Dan",
    "Status: Draft",
    "Language: EN",
    "Match keys: ",
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
    "CREATIVE PROCESS NOTES",
    "────────────────────────────────────────────────────────────",
    "",
    "",
    "────────────────────────────────────────────────────────────",
    "PRODUCTION NOTES",
    "────────────────────────────────────────────────────────────",
    "Linked audio: ",
    "",
    "────────────────────────────────────────────────────────────",
    "PROMPT",
    "────────────────────────────────────────────────────────────",
    "",
    "",
    "────────────────────────────────────────────────────────────",
    "-- HARD BOTTOM BASEMENT --",
    "────────────────────────────────────────────────────────────",
    ""
  ].join("\n");

  const sdState = {
    liveLyrics: true,
    follow: false,
    editing: false,
    locked: false,
    dirty: false,
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

  function sdMarkDirty(reason) {
    if (sdState.locked) return;
    sdState.dirty = true;
    try {
      const metaEl = sd$("sdMeta");
      if (metaEl && metaEl.textContent.indexOf("Unsaved") < 0) {
        const prev = (metaEl.textContent || "").replace(/\s*·\s*Unsaved.*$/, "");
        metaEl.textContent = (prev ? prev + " · " : "") + "Unsaved changes";
      }
      const label = sd$("sdTemplateLabel");
      if (label && label.textContent.indexOf("*") !== 0 && label.textContent.indexOf(" *") < 0) {
        /* light cue only in meta to avoid thrashing title */
      }
    } catch (e) {}
  }

  function sdClearDirty() {
    sdState.dirty = false;
  }

  function sdStorageErrorMessage(err) {
    var msg = (err && (err.name || err.message)) ? String(err.name || err.message) : "storage error";
    if (/quota|QUOTA|NS_ERROR_DOM_QUOTA/i.test(msg) || (err && err.code === 22)) {
      return "Save failed — browser storage is full. Export clean / copy lyrics, then free space or remove old sheets.";
    }
    return "Save failed — could not write to browser storage (" + msg + "). Your text is still on screen — Export clean or copy it before closing.";
  }

  function sdInstallUnloadGuard() {
    if (window.__sdUnloadGuard) return;
    window.__sdUnloadGuard = true;
    window.addEventListener("beforeunload", function (ev) {
      if (!sdState.dirty) return;
      ev.preventDefault();
      ev.returnValue = "You have unsaved StudioDraft changes.";
      return ev.returnValue;
    });
  }



  function sdTitleCase(s) {
    return String(s || "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim()
      .split(" ")
      .filter(Boolean)
      .map(function (w) {
        if (/^[A-Z0-9]{2,}$/.test(w)) return w; // keep acronyms
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ");
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
    try {
      localStorage.setItem(sdStorageKey(name), text);
      return true;
    } catch (e) {
      console.warn("sd save", e);
      return false;
    }
  }
  function sdLoadBelow(name) {
    try { return localStorage.getItem(sdBelowKey(name)); } catch (e) { return null; }
  }
  function sdSaveBelow(name, text) {
    try {
      localStorage.setItem(sdBelowKey(name), text || "");
      return true;
    } catch (e) {
      console.warn("sd save below", e);
      return false;
    }
  }
  function sdLoadMeta(name) {
    try {
      const raw = localStorage.getItem(sdMetaKey(name));
      return raw ? JSON.parse(raw) : { locked: false };
    } catch (e) { return { locked: false }; }
  }
  function sdSaveMeta(name, meta) {
    try {
      localStorage.setItem(sdMetaKey(name), JSON.stringify(meta || {}));
      return true;
    } catch (e) {
      console.warn("sd save meta", e);
      return false;
    }
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
      // Orphan prompt/genre soup stuck under outro (no header)
      if (/^Ultra heavy\b/i.test(t)) { cut = i; break; }
      if (/^genres:\s*/i.test(t)) { cut = i; break; }
      if (t.length > 180 && /bass|trap|genre|vocal/i.test(t) && i > 8) { cut = i; break; }
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

      function sdIsRuleLine(line) {
    const t = String(line || "").trim();
    if (t.length < 4) return false;
    // pure horizontal rules (box-drawing or ascii)
    if (/^[=\-_=]{4,}$/.test(t)) return true;
    if (/^═{4,}$/.test(t)) return true;
    if (/^─{4,}$/.test(t)) return true;
    // mostly rule chars (tolerate rare noise)
    const ruleChars = (t.match(/[═─=\-_]/g) || []).length;
    return ruleChars / t.length > 0.9 && ruleChars >= 4;
  }

  function sdEscapeHtml(line) {
    return String(line)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function sdRenderText(text, asHtmlSections) {
    const body = sd$("sdLyricsBody");
    if (!body) return;
    const t = text == null ? "" : String(text);
    sdState.sections = sdParseSections(t);
    if (asHtmlSections && sdState.sections.length && !sdState.editing) {
      body.innerHTML = sdState.sections.map(function (s, idx) {
        const inner = s.lines.map(function (line) {
          if (sdIsRuleLine(line)) {
            return '<div class="sd-rule" role="separator"></div>';
          }
          return '<div class="sd-line">' + sdEscapeHtml(line) + "</div>";
        }).join("");
        return '<div class="sd-section" data-sd-idx="' + idx + '">' + inner + "</div>";
      }).join("");
    } else if (!sdState.editing) {
      // plain view still replace pure rule lines with a single glyph row for consistency
      const lines = t.split("\n").map(function (line) {
        if (sdIsRuleLine(line)) return "────────────────────────────────────────";
        return line;
      });
      body.textContent = lines.join("\n");
    } else {
      body.textContent = t;
    }
  }


  
  /** If notes arrived as one blob, re-insert line breaks before known markers. */
  function sdRepairNewlines(text) {
    var t = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!t.trim()) return t;

    // Always normalize known structure (works on single-line blobs and mixed text)
    t = t.replace(/[ \t]*PRODUCTION NOTES[ \t]*/gi, "\nPRODUCTION NOTES\n");
    t = t.replace(/[ \t]*CREATIVE PROCESS NOTES[ \t]*/gi, "\nCREATIVE PROCESS NOTES\n");
    t = t.replace(/[ \t]*SCRATCH PAD[ \t]*/gi, "\nSCRATCH PAD\n");
    t = t.replace(/(^|\n)[ \t]*\bPROMPT\b[ \t]*(?=\n|$)/gi, "$1PROMPT\n");
    t = t.replace(/[ \t]*--\s*HARD BOTTOM BASEMENT\s*--[ \t]*/gi, "\n-- HARD BOTTOM BASEMENT --\n");
    t = t.replace(/[ \t]*HARD BOTTOM BASEMENT[ \t]*/gi, "\n-- HARD BOTTOM BASEMENT --\n");

    // Horizontal rules → own lines
    t = t.replace(/[═]{3,}/g, "\n════════════════════════════════════════\n");
    t = t.replace(/[─]{3,}/g, "\n────────────────────────────────────────\n");
    t = t.replace(/[=\-_]{8,}/g, "\n────────────────────────────────────────\n");

    // Production fields
    t = t.replace(/[ \t]*Linked audio:\s*/gi, "\nLinked audio: ");
    t = t.replace(/[ \t]*\bStatus:\s*/gi, "\nStatus:\n");
    t = t.replace(/\s*\[\s*([xX ])\s*\]\s*/g, "\n  [$1] ");

    // Version banners
    t = t.replace(/\s*-{3,}V(\d+)\s*/gi, "\n\n------------------V$1\n");
    t = t.replace(/\s*V(\d+)\s*(?=\[)/g, "\n\n------------------V$1\n");

    // Section tags in archive
    t = t.replace(/\s*\[(Verse[^\]]*)\]\s*/gi, "\n[$1]\n");
    t = t.replace(/\s*\[(pre-?Chorus[^\]]*)\]\s*/gi, "\n[$1]\n");
    t = t.replace(/\s*\[(Chorus[^\]]*)\]\s*/gi, "\n[$1]\n");
    t = t.replace(/\s*\[(Bridge[^\]]*)\]\s*/gi, "\n[$1]\n");
    t = t.replace(/\s*\[(Outro[^\]]*)\]\s*/gi, "\n[$1]\n");
    t = t.replace(/\s*\[(Final[^\]]*)\]\s*/gi, "\n[$1]\n");
    t = t.replace(/\s*\[(Intro[^\]]*)\]\s*/gi, "\n[$1]\n");

    // Prompt performance notes
    t = t.replace(/\s*(Bar \d\s*&?\s*\d*:)/gi, "\n$1");
    t = t.replace(/\s*(On every final[^.]+\.)/gi, "\n$1");
    t = t.replace(/\s*(genres:\s*)/gi, "\n$1");

    // Parenthetical ad-libs on own line when glued
    t = t.replace(/\s*(\([^)]{3,}\))/g, "\n$1");

    // Squeeze blank runs; trim edge newlines
    t = t.replace(/[ \t]+\n/g, "\n");
    t = t.replace(/\n[ \t]+/g, "\n");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.replace(/^\n+/, "").replace(/\n+$/, "\n");
  }


  function sdRenderBelow(text) {
    const el = sd$("sdBelowBody");
    if (!el) return;
    var raw = sdRepairNewlines(text == null ? "" : String(text));
    // Interactive Status UI owns the checklist — strip text duplicates
    var t = raw.split("\n").filter(function (line) {
      var s = line.trim();
      if (/^\[\s*[xX ]\s*\]\s*Mastered/i.test(s)) return false;
      if (/^\[\s*[xX ]\s*\]\s*Lyrics locked/i.test(s)) return false;
      if (/^\[\s*[xX ]\s*\]\s*Streaming/i.test(s)) return false;
      if (/^\[\s*[xX ]\s*\]\s*Local/i.test(s)) return false;
      if (/^\[\s*[xX ]\s*\]\s*On Spotify/i.test(s)) return false;
      if (/^\[\s*[xX ]\s*\]\s*Other important/i.test(s)) return false;
      if (/^Status:\s*$/i.test(s)) return false;
      return true;
    }).join("\n");
    // Normalize excessive blank lines from repair
    t = t.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "\n");
    sdState.below = t;
    const wrap = sd$("sdBelowWrap");
    if (wrap) wrap.style.display = t.trim() ? "" : "none";
    // Plain text preserves line breaks (white-space: pre-wrap) and stays editable
    el.textContent = t;
    el.contentEditable = sdState.locked ? "false" : "true";
  }


  function sdApplyLockedUI() {
    const body = sd$("sdLyricsBody");
    const belowEl = sd$("sdBelowBody");
    const editBtn = sd$("sdLiveEdit");
    const saveBtn = sd$("sdSave");
    const createBtn = sd$("sdCreate");
    sdSetBtn("sdLocked", sdState.locked);
    const ll = sd$("sdFlagLyricsLock");
    if (ll) {
      ll.checked = !!sdState.locked;
      ll.disabled = true;
    }
    if (sdState.locked) {
      sdState.editing = false;
      sdSetBtn("sdLiveEdit", false);
      if (body) body.contentEditable = "false";
      if (belowEl) belowEl.contentEditable = "false";
      if (editBtn) editBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
      if (createBtn) createBtn.disabled = true;
    } else {
      if (editBtn) editBtn.disabled = false;
      if (saveBtn) saveBtn.disabled = false;
      if (createBtn) createBtn.disabled = false;
      if (belowEl) belowEl.contentEditable = "true";
    }
  }

  
  function sdFlagStoreKey(name) {
    return "devine_sd_flags_v1_" + sdNorm(sdSongName(name || (typeof fileName !== "undefined" ? fileName : "")));
  }

  function sdReadManualFlags(name) {
    try {
      const raw = localStorage.getItem(sdFlagStoreKey(name));
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function sdWriteManualFlags(name, obj) {
    try { localStorage.setItem(sdFlagStoreKey(name), JSON.stringify(obj || {})); } catch (e) {}
  }

  /** Auto status from desk + lock + sheet; manual flags persist. */
  function sdSyncStatusFlags(name) {
    const songRaw = name || (typeof fileName !== "undefined" ? fileName : "") || "";
    const songKey = sdSongName(songRaw) || sdNorm(songRaw);
    const manual = sdReadManualFlags(songRaw);

    // --- Catalogue JSON is source of truth for master status ---
    let last = (typeof window !== "undefined" && window.__dmLastMaster) ? window.__dmLastMaster : null;
    try {
      if (typeof loadCatalogue === "function") {
        const cat = loadCatalogue();
        const entries = (cat && cat.entries) ? cat.entries : [];
        const norm = function (s) {
          return String(s || "").toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[_\s]+/g, " ").trim();
        }
        const want = norm(songRaw) || norm(songKey);
        // Newest matching track first
        for (let i = entries.length - 1; i >= 0; i--) {
          const e = entries[i];
          const keys = [e.song, e.fileName, e.track_id, e.source && e.source.fileName];
          if (keys.some(function (k) { return want && norm(k) === want; }) ||
              keys.some(function (k) { return want && norm(k).indexOf(want) >= 0; })) {
            last = e;
            break;
          }
        }
        // If no name match but we just mastered, keep __dmLastMaster
        if (!last && window.__dmLastMaster) last = window.__dmLastMaster;
      }
    } catch (e) {}

    let wav = false, mp3 = false, flac = false, stream = false, local = false;
    let lyricsLock = !!sdState.locked;

    if (last) {
      local = true;
      const expObj = (last.export && typeof last.export === "object") ? last.export : {};
      const fmt = String(
        expObj.format || last.exportFormat || last.export_format ||
        (last.output && last.output.format) || "WAV"
      ).toUpperCase();
      const depth = String(
        expObj.bitDepth || expObj.bit_depth || last.bitDepth || last.bit_depth || "16-bit"
      );
      if (/WAV/.test(fmt)) wav = true;
      if (/MP3/.test(fmt)) mp3 = true;
      if (/FLAC/.test(fmt)) flac = true;
      // Default D.Devine export is 16-bit WAV
      if (!mp3 && !flac && (wav || /16/.test(depth))) wav = true;
      const vr = last.validation_results || {};
      stream = !!(last.safetyPass || vr.safetyPass || vr.streamingEligible || window.__dmLastMasterOk);
      // soft-only still may be eligible depending on desk — prefer safetyPass
    }

    // Live desk signals as fallback / reinforcement
    try {
      const top = document.getElementById("topDownload");
      const leg = document.getElementById("download");
      const a = (top && top.getAttribute("href")) ? top : leg;
      if (a && a.getAttribute("href") && a.style.opacity !== "0.35") {
        wav = wav || true;
        local = true;
      }
    } catch (e) {}
    try {
      const badge = document.getElementById("streamBadge");
      const t = (badge && (badge.textContent || "")) || "";
      if (/eligible/i.test(t) && !/not eligible|blocked|fail/i.test(t)) stream = true;
      if (/Master failed|blocked/i.test(t)) stream = false;
    } catch (e) {}
    try {
      if (typeof decodedBuffer !== "undefined" && decodedBuffer) local = true;
      if (typeof fileName !== "undefined" && fileName) local = true;
    } catch (e) {}

    // Sheet text: Spotify
    let spotify = !!manual.spotify;
    try {
      const blob = ((sd$("sdLyricsBody") && sd$("sdLyricsBody").innerText) || "") + "\n" + (sdState.below || "");
      if (/on spotify|released on spotify/i.test(blob)) spotify = true;
    } catch (e) {}

    const map = {
      sdFlagWav: wav || !!manual.wav,
      sdFlagMp3: mp3 || !!manual.mp3,
      sdFlagFlac: flac || !!manual.flac,
      sdFlagLyricsLock: lyricsLock,
      sdFlagStream: stream || !!manual.stream,
      sdFlagLocal: local || !!manual.local,
      sdFlagSpotify: spotify,
      sdFlagEdit: manual.edit || ""
    };
    Object.keys(map).forEach(function (id) {
      const el = sd$(id);
      if (!el) return;
      if (id === "sdFlagEdit" || el.type === "text") {
        if (document.activeElement !== el) el.value = map[id] || "";
        return;
      }
      el.checked = !!map[id];
      if (id === "sdFlagLyricsLock") el.disabled = true;
    });

    // Reflect into meta line briefly
    try {
      const meta = sd$("sdMeta");
      if (meta && last && last.metrics) {
        const L = last.metrics.lufs != null ? Number(last.metrics.lufs).toFixed(1) : "";
        const T = last.metrics.tpDbtp != null ? Number(last.metrics.tpDbtp).toFixed(1) : "";
        if (L || T) meta.textContent = "Last master · LUFS " + L + (T ? " · TP " + T + " dBTP" : "");
      }
    } catch (e) {}
  }


  function sdWireStatusFlags() {
    const root = sd$("sdStatusFlags");
    if (!root) return;
    const tog = sd$("sdStatusToggle");
    const body = sd$("sdStatusBody");
    if (tog && body) {
      tog.onclick = function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        const open = body.hasAttribute("hidden");
        if (open) {
          body.removeAttribute("hidden");
          body.style.display = "";
        } else {
          body.setAttribute("hidden", "");
          body.style.display = "none";
        }
        tog.setAttribute("aria-expanded", open ? "true" : "false");
      };
      // Ensure collapsed on boot
      body.setAttribute("hidden", "");
      body.style.display = "none";
      tog.setAttribute("aria-expanded", "false");
    }
    root.querySelectorAll("input[data-flag]").forEach(function (inp) {
      const ev = inp.type === "text" ? "change" : "change";
      inp.addEventListener(ev, function () {
        const song = typeof fileName !== "undefined" ? fileName : "";
        const manual = sdReadManualFlags(song);
        const key = inp.getAttribute("data-flag");
        if (key === "lyricsLock") return;
        if (inp.type === "text" || key === "edit") {
          manual.edit = String(inp.value || "");
        } else {
          manual[key] = !!inp.checked;
        }
        sdWriteManualFlags(song, manual);
      });
      if (inp.type === "text") {
        inp.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
        });
      }
    });
  }


  
  function sdDeskDateStamp() {
    // Visible build proof — must NOT stay on V20260821 if this capture desk is loaded
    var b = (typeof APP_BUILD !== "undefined" ? String(APP_BUILD) : "");
    var m = b.match(/(20\d{6})/);
    var day = m ? ("V" + m[1]) : "V20260822";
    if (/capture/i.test(b)) return day + " · CAPTURE";
    return day;
  }

  function sdTruncateTitle(s, maxLen) {
    maxLen = maxLen || 26;
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (s.length <= maxLen) return s;
    var cut = s.slice(0, maxLen - 1);
    var sp = cut.lastIndexOf(" ");
    if (sp >= 12) cut = cut.slice(0, sp);
    return cut.replace(/[.,;:\-–—\s]+$/, "") + "\u2026";
  }

  function sdUpdateBrandSubtitle(nameOrTitle) {
    const el = document.getElementById("logoSub") || document.querySelector(".logo-sub");
    if (!el) return;
    let label = "";
    if (nameOrTitle && String(nameOrTitle).trim()) {
      label = typeof sdSongName === "function"
        ? sdSongName(nameOrTitle)
        : String(nameOrTitle).replace(/_/g, " ").replace(/\.[^.]+$/, "").trim();
    }
    if (!label && typeof fileName !== "undefined" && fileName) {
      label = typeof sdSongName === "function" ? sdSongName(fileName) : String(fileName);
    }
    var stamp = sdDeskDateStamp();
    if (!label || /^no track loaded$/i.test(label)) {
      el.textContent = stamp;
      el.title = "Build " + (typeof APP_BUILD !== "undefined" ? APP_BUILD : stamp);
      return;
    }
    // Display: V20260821 The Winds Against…  (letter suffix replaced by track name)
    el.textContent = stamp + " " + sdTruncateTitle(label, 26);
    el.title = stamp + " · " + label + " · build " + (typeof APP_BUILD !== "undefined" ? APP_BUILD : "");
  }



function sdApplyMatchedForName(name, opts) {
    const body = sd$("sdLyricsBody");
    const label = sd$("sdTemplateLabel");
    const metaEl = sd$("sdMeta");
    if (!body) return;
    opts = opts || {};
    // Loading audio must always win over a stuck Create/edit session
    if (opts.force) {
      sdState.editing = false;
      try { sdSetBtn("sdLiveEdit", false); } catch (e) {}
      try {
        body.contentEditable = "false";
        body.setAttribute("contenteditable", "false");
        body.classList.remove("is-editing");
      } catch (e) {}
    } else if (sdState.editing) {
      // Never clobber an in-progress edit unless forced (e.g. new file load)
      return;
    }

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
    // Discard collapsed local notes (single-line blob) in favor of DB sheet
    if (belowStored != null && belowStored.split(/\n/).length < 8 && (parts.below || "").split(/\n/).length >= 8) {
      below = parts.below;
    }
    below = sdRepairNewlines(below || "");

    const lockedFromSheet = sdParseLockedFromText(full);
    if (lockedFromSheet != null && override == null) sdState.locked = lockedFromSheet;

    sdState.source = source;
    sdClearDirty();
    sdState.trackKey = sdNormFollowKey(name || song || "");
    body.style.display = sdState.liveLyrics ? "" : "none";

    const song = sdSongName(name);
    try { sdUpdateBrandSubtitle(song || name); } catch (e) {}
    if (label) {
      const nm = song || sdSongName(name) || (typeof fileName !== "undefined" ? sdSongName(fileName) : "");
      if (nm) {
        label.textContent = nm + (sdState.locked ? " \uD83D\uDD12" : "");
      } else {
        label.textContent = "No track loaded";
      }
    }

    sdRenderText(clean, !sdState.editing);
    sdRenderBelow(below);
    body.contentEditable = (sdState.editing && !sdState.locked) ? "true" : "false";
    sdApplyLockedUI();
    try { sdSyncStatusFlags(name || song); } catch (e) {}

    if (metaEl) {
      const bits = [source, "clean"];
      if (below && below.trim()) bits.push("notes below");
      if (sdState.locked) bits.push("locked");
      metaEl.textContent = bits.join(" \u00b7 ");
    }
    const legacy = document.getElementById("lyrics");
    if (legacy) legacy.innerText = clean + (below ? "\n\n" + below : "");
  }

      
  /**
   * Per-track block-follow maps (start as fraction of duration 0..1).
   * Calibrated on Neon-Jesus first — refine times after listening.
   * Optional: window.__sdFollowMap = { blocks: [ { match: /verse\s*1/i, start: 0.15 }, ... ] }
   */
  const SD_FOLLOW_MAPS = {
    // Neon-Jesus — user marks 2026-08-20 (MM:SS)
    // Verse 1 treated as 00:22:29 (not 02:22 — that would be after Bridge)
    // pre 0:46 | chorus 1:08 | verse3 1:44 | bridge 2:20 | outro 3:17
    "neon-jesus": {
      blocks: [
        { match: /verse\s*1/i, startSec: 22.3 },
        { match: /pre/i, startSec: 46.5 },
        { match: /chorus/i, startSec: 68.5 },
        { match: /verse\s*3|verse\s*2/i, startSec: 104.4 },
        { match: /bridge/i, startSec: 140.0 },
        { match: /outro|final/i, startSec: 197.1 }
      ]
    }
  };
  SD_FOLLOW_MAPS["neon jesus"] = SD_FOLLOW_MAPS["neon-jesus"];
  SD_FOLLOW_MAPS["neonjesus"] = SD_FOLLOW_MAPS["neon-jesus"];

  function sdNormFollowKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[_\s]+/g, " ")
      .replace(/\.wav|\.mp3|\.flac|\.m4a/gi, "")
      .replace(/\bmastered\b/gi, "")
      .replace(/[^a-z0-9\s\-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sdResolveFollowMap(name) {
    if (window.__sdFollowMap && window.__sdFollowMap.blocks) return window.__sdFollowMap;
    const raw = sdNormFollowKey(name || (typeof fileName !== "undefined" ? fileName : ""));
    if (!raw) return null;
    if (SD_FOLLOW_MAPS[raw]) return SD_FOLLOW_MAPS[raw];
    // slug form
    const slug = raw.replace(/\s+/g, "-");
    if (SD_FOLLOW_MAPS[slug]) return SD_FOLLOW_MAPS[slug];
    // fuzzy contains
    for (const k of Object.keys(SD_FOLLOW_MAPS)) {
      if (!SD_FOLLOW_MAPS[k] || !SD_FOLLOW_MAPS[k].blocks) continue;
      if (raw.indexOf(k) >= 0 || k.indexOf(raw) >= 0) return SD_FOLLOW_MAPS[k];
    }
    return null;
  }


  function sdIsMusicalSectionTitle(title) {
    return /verse|chorus|bridge|outro|intro|pre-?\s*chorus|pre-?chorus|hook|drop|refrain|tag|solo|final|coda|breakdown|post-?\s*chorus/i.test(String(title || ""));
  }

  function sdSectionWeight(s) {
    const title = String(s.title || "");
    const lines = (s.lines || []).filter(function (ln) {
      const t = String(ln).trim();
      if (!t) return false;
      if (/^[═─=\-_]{4,}$/.test(t)) return false;
      return true;
    }).length;
    const t = title.toLowerCase();
    // Header / non-lyric blocks: no follow time
    if (!sdIsMusicalSectionTitle(title)) return 0;
    let mult = 1.0;
    if (/^verse/.test(t) || /\bverse\b/.test(t)) mult = 2.15;      // verses run longer than line-count
    else if (/pre/.test(t)) mult = 0.7;                             // pre-chorus is short
    else if (/chorus/.test(t) && !/pre/.test(t)) mult = 1.25;
    else if (/bridge/.test(t)) mult = 1.05;
    else if (/outro|final/.test(t)) mult = 1.15;
    else if (/intro/.test(t)) mult = 0.8;
    // floor so tiny blocks still get a moment
    return Math.max(5, lines * mult);
  }

  /** Playhead 0..1 from desk transport */
  function sdPlayheadSec() {
    try {
      if (window.__dm && typeof window.__dm.livePosition === "function") {
        const liveObj = window.__dm.getLive && window.__dm.getLive();
        if (liveObj && (liveObj.playing || (liveObj.offset || 0) > 0)) {
          return Math.max(0, window.__dm.livePosition());
        }
      }
      const tabB = document.getElementById("tabB");
      const preferB = tabB && tabB.classList.contains("on");
      const aB = document.getElementById("audioB");
      const aA = document.getElementById("audioA");
      const audio = preferB && aB && aB.src ? aB : aA;
      if (audio && isFinite(audio.currentTime)) return Math.max(0, audio.currentTime);
      if (typeof live !== "undefined" && live) {
        const now = (typeof audioCtx !== "undefined" && audioCtx && audioCtx.currentTime) || 0;
        if (live.playing) return (live.offset || 0) + Math.max(0, now - (live.startedAt || now));
        return live.offset || 0;
      }
    } catch (e) {}
    return 0;
  }

  function sdPlayhead01() {
    let t = 0;
    try {
      if (window.__dm && typeof window.__dm.livePosition === "function" && window.__dm.getDecoded) {
        const buf = window.__dm.getDecoded();
        const liveObj = window.__dm.getLive && window.__dm.getLive();
        if (buf && buf.duration > 0) {
          const cur = (liveObj && liveObj.playing)
            ? window.__dm.livePosition()
            : ((liveObj && liveObj.offset) || 0);
          t = Math.max(0, Math.min(1, cur / buf.duration));
          if (t > 0 || (liveObj && liveObj.playing)) return t;
        }
      }
      const tabB = document.getElementById("tabB");
      const preferB = tabB && tabB.classList.contains("on");
      const aB = document.getElementById("audioB");
      const aA = document.getElementById("audioA");
      const audio = preferB && aB && aB.src ? aB : aA;
      if (audio && isFinite(audio.duration) && audio.duration > 0) {
        return Math.max(0, Math.min(1, audio.currentTime / audio.duration));
      }
      if (typeof live !== "undefined" && live && typeof decodedBuffer !== "undefined" && decodedBuffer) {
        const now = (typeof audioCtx !== "undefined" && audioCtx && audioCtx.currentTime) || 0;
        const cur = live.playing
          ? ((live.offset || 0) + Math.max(0, now - (live.startedAt || now)))
          : (live.offset || 0);
        return Math.max(0, Math.min(1, cur / (decodedBuffer.duration || 1)));
      }
    } catch (e) {}
    return t;
  }

  /**
   * Block follow timing:
   * - Lead-in (instrumental) before first musical block — Verse 1 must not start at 0:00
   * - Weights favor verses over pre-chorus so pre-chorus does not arrive too early
   * Default lead-in ~14% of track (tunable via window.__sdFollowLeadIn = 0.18)
   */
    function sdFollowTick() {
    if (!sdState.follow || sdState.editing) return;
    const body = sd$("sdLyricsBody");
    if (!body || !sdState.sections.length) return;

    const t = sdPlayhead01();
    const sections = sdState.sections;
    const nodes = body.querySelectorAll(".sd-section");

    function setActive(idx) {
      nodes.forEach(function (el, i) {
        const on = idx >= 0 && i === idx;
        el.classList.toggle("is-active", on);
        if (on) el.setAttribute("aria-current", "true");
        else el.removeAttribute("aria-current");
      });
      if (idx >= 0 && nodes[idx]) {
        try { nodes[idx].scrollIntoView({ block: "nearest", behavior: "smooth" }); }
        catch (e) { try { nodes[idx].scrollIntoView(true); } catch (e2) {} }
      }
    }

    const map = sdResolveFollowMap(typeof fileName !== "undefined" ? fileName : "");
    if (map && map.blocks && map.blocks.length) {
      // Prefer absolute seconds (Neon-Jesus calibration); fall back to fraction of duration
      const sec = sdPlayheadSec();
      const useSec = map.blocks.some(function (b) { return typeof b.startSec === "number"; });
      let pos = useSec ? sec : t;
      let idx = -1;
      let firstStart = Infinity;
      for (let bi = 0; bi < map.blocks.length; bi++) {
        const b = map.blocks[bi];
        const start = useSec
          ? (typeof b.startSec === "number" ? b.startSec : (b.start || 0) * 1e9)
          : (b.start || 0);
        if (start < firstStart) firstStart = start;
      }
      if (pos < firstStart) {
        // Intro / pre-vocal: keep highlight on sheet header (title / artist / status)
        let headerIdx = -1;
        for (let si = 0; si < sections.length; si++) {
          if (!sdIsMusicalSectionTitle(sections[si].title)) { headerIdx = si; break; }
        }
        if (headerIdx < 0) headerIdx = 0;
        setActive(headerIdx);
        return;
      }
      for (let si = 0; si < sections.length; si++) {
        const title = sections[si].title || "";
        for (let bi = 0; bi < map.blocks.length; bi++) {
          const b = map.blocks[bi];
          const re = b.match instanceof RegExp ? b.match : new RegExp(b.match, "i");
          const start = useSec
            ? (typeof b.startSec === "number" ? b.startSec : NaN)
            : (b.start || 0);
          if (re.test(title) && pos >= start) idx = si;
        }
      }
      setActive(idx);
      return;
    }

    // Generic weighted fallback (non-mapped tracks)
    const weights = sections.map(sdSectionWeight);
    const totalW = weights.reduce(function (a, b) { return a + b; }, 0);
    if (!(totalW > 0)) { setActive(-1); return; }

    const leadIn = (typeof window.__sdFollowLeadIn === "number")
      ? Math.max(0, Math.min(0.4, window.__sdFollowLeadIn))
      : 0.14;
    if (t < leadIn) {
      let headerIdx = -1;
      for (let si = 0; si < sections.length; si++) {
        if (!sdIsMusicalSectionTitle(sections[si].title)) { headerIdx = si; break; }
      }
      setActive(headerIdx >= 0 ? headerIdx : 0);
      return;
    }

    const t2 = (t - leadIn) / (1 - leadIn);
    const pos = t2 * totalW;
    let acc = 0;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] <= 0) continue;
      acc += weights[i];
      if (pos <= acc) { idx = i; break; }
      idx = i;
    }
    setActive(idx);
  }

  function sdComposeFull() {
    const bodyEl = sd$("sdLyricsBody");
    const belowEl = sd$("sdBelowBody");
    const clean = bodyEl ? bodyEl.innerText : "";
    const below = belowEl ? belowEl.innerText : (sdState.below || "");
    if (below && below.trim()) return clean.replace(/\s+$/, "") + "\n\n" + below.replace(/^\s+/, "");
    return clean;
  }

  function sdTitleFromSheet(text) {
    const lines = String(text || "").split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (/^[═─=\-_]{4,}$/.test(line)) continue;
      if (/^(status|language|match keys)\s*:/i.test(line)) continue;
      if (/^d\.\s*devine\b/i.test(line)) continue;
      if (/^dan\b/i.test(line) && line.length < 8) continue;
      if (/^TITLE$/i.test(line)) continue;
      if (/^\[/.test(line)) continue; // section header, too late
      return line;
    }
    return "";
  }

    function sdDoSave() {
    if (sdState.locked) {
      const metaEl = sd$("sdMeta");
      if (metaEl) metaEl.textContent = "Locked \u2014 unlock to save";
      return;
    }
    const bodyEl = sd$("sdLyricsBody");
    const belowEl = sd$("sdBelowBody");
    const clean = bodyEl ? (bodyEl.innerText || bodyEl.textContent || "") : "";
    const below = belowEl ? (belowEl.innerText || belowEl.textContent || "") : (sdState.below || "");
    sdState.below = below;

    // Title from sheet drives the template identity
    const sheetTitle = (typeof sdTitleFromSheet === "function" ? sdTitleFromSheet(clean) : "") || "";
    const fileKey = (typeof fileName !== "undefined" && fileName) ? fileName : "";
    const name = fileKey || sheetTitle || "untitled";
    const full = (below && below.trim())
      ? clean.replace(/\s+$/, "") + "\n\n" + below.replace(/^\s+/, "")
      : clean;

    // Persist template + notes — report failure clearly (quota / private mode / blocked storage)
    var ok = true;
    var lastErr = null;
    try {
      if (!sdSaveOverride(name, full)) { ok = false; lastErr = new Error("override write failed"); }
    } catch (e) { ok = false; lastErr = e; console.warn("sd save override", e); }
    try {
      if (belowEl && sdSaveBelow(name, below) === false) { ok = false; lastErr = lastErr || new Error("below write failed"); }
    } catch (e) { ok = false; lastErr = e; }
    try {
      if (sdSaveMeta(name, { locked: sdState.locked, title: sheetTitle || sdSongName(name) }) === false) {
        ok = false; lastErr = lastErr || new Error("meta write failed");
      }
    } catch (e) { ok = false; lastErr = e; }
    // Also key under file name when both exist so Import still finds the edit
    if (fileKey && sheetTitle && fileKey !== name) {
      try { sdSaveOverride(fileKey, full); } catch (e) { ok = false; lastErr = e; }
      try { sdSaveBelow(fileKey, below); } catch (e) { ok = false; lastErr = e; }
    }
    if (!ok) {
      const metaEl = sd$("sdMeta");
      if (metaEl) metaEl.textContent = sdStorageErrorMessage(lastErr);
      try { alert(sdStorageErrorMessage(lastErr)); } catch (e2) {}
      return;
    }
    sdClearDirty();

    // Exit edit mode and re-render structured template from saved text
    sdState.editing = false;
    sdSetBtn("sdLiveEdit", false);
    if (bodyEl) {
      bodyEl.setAttribute("contenteditable", "false");
      bodyEl.contentEditable = "false";
      bodyEl.classList.remove("is-editing");
      if (typeof sdRenderText === "function") {
        sdRenderText(clean, true);
      } else {
        bodyEl.textContent = clean;
      }
    }
    // Keep notes panel in sync (plain text, still editable until Lock Create)
    if (typeof sdRenderBelow === "function") {
      sdRenderBelow(below);
    } else if (belowEl) {
      belowEl.textContent = below;
    }

    // Label / meta = template title from sheet
    const display = (typeof sdTitleCase === "function")
      ? sdTitleCase(sheetTitle || sdSongName(name) || "Untitled")
      : (sheetTitle || sdSongName(name) || "Untitled");
    const label = sd$("sdTemplateLabel");
    if (label) {
      label.textContent = display + (sdState.locked ? " \uD83D\uDD12" : "");
      label.classList.remove("sd-label-create");
      try { sdUpdateBrandSubtitle(display); } catch (e) {}
    }
    const metaEl = sd$("sdMeta");
    if (metaEl) {
      metaEl.textContent = "Saved \u00b7 template updated \u00b7 " + display + " \u00b7 storage OK";
    }
  }

  function sdResetStatusFlags(name) {
    const song = name || (typeof fileName !== "undefined" ? fileName : "") || "";
    try { sdWriteManualFlags(song, {}); } catch (e) {}
    const ids = [
      "sdFlagWav", "sdFlagMp3", "sdFlagFlac", "sdFlagLyricsLock",
      "sdFlagStream", "sdFlagLocal", "sdFlagSpotify"
    ];
    ids.forEach(function (id) {
      const el = sd$(id);
      if (!el) return;
      el.checked = false;
      if (id === "sdFlagLyricsLock") el.disabled = true;
    });
    const edit = sd$("sdFlagEdit");
    if (edit) edit.value = "";
  }

  function sdShowCreateConfirm() {
    const overlay = sd$("sdCreateOverlay");
    const dialog = overlay ? overlay.querySelector(".sd-create-dialog") : null;
    const bodyEl = sd$("sdCreateBody");
    if (bodyEl) {
      var unsaved = sdState.dirty
        ? '<br><br><strong>StudioDraft reports unsaved changes right now.</strong>'
        : '';
      bodyEl.innerHTML =
        'Opens a <strong>blank</strong> lyric sheet and clears this work area. ' +
        'Unsaved lyrics, notes, and status ticks can be lost. ' +
        'Save first if you need to keep this work.' + unsaved;
    }
    if (!overlay) return;

    // True geometric center of the vinyl (.ring-wrap), not the stage box
    // (stage includes A/B chrome and is not the visual disc center).
    var ring = document.querySelector(".ring-wrap");
    var stage = document.querySelector(".stage") || document.querySelector(".right");
    var anchor = ring || stage;
    var r = anchor ? anchor.getBoundingClientRect() : null;

    // Dimmer covers the SourceCast column (stage/right)
    var dim = stage ? stage.getBoundingClientRect() : r;
    if (dim) {
      overlay.style.left = Math.max(0, dim.left) + "px";
      overlay.style.top = Math.max(0, dim.top) + "px";
      overlay.style.width = dim.width + "px";
      overlay.style.height = dim.height + "px";
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
    } else {
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
    }

    if (dialog && r) {
      var side = Math.min(340, Math.floor(Math.min(r.width, r.height) * 0.92));
      side = Math.max(240, side);
      // Pin dialog to exact center of vinyl ring in viewport coords
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      dialog.style.position = "fixed";
      dialog.style.left = cx + "px";
      dialog.style.top = cy + "px";
      dialog.style.transform = "translate(-50%, -50%)";
      dialog.style.margin = "0";
      dialog.style.width = side + "px";
      dialog.style.height = side + "px";
      dialog.style.maxWidth = side + "px";
      dialog.style.maxHeight = side + "px";
      dialog.style.aspectRatio = "1 / 1";
      dialog.style.borderRadius = "50%";
      dialog.style.boxSizing = "border-box";
    }

    overlay.style.display = "block";
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
  }

function sdHideCreateConfirm() {
    const overlay = sd$("sdCreateOverlay");
    if (overlay) {
      overlay.classList.remove("show");
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden", "true");
    }
    // restore focus to CREATE button so desk stays usable
    try {
      var b = sd$("sdCreate");
      if (b) b.focus({ preventScroll: true });
    } catch (e) {}
  }

  function sdCreate() {
    const body = sd$("sdLyricsBody");
    if (!body) return;
    // Desk-styled confirm over SourceCast (not browser alert)
    sdShowCreateConfirm();
  }

  function sdCreateConfirmed() {
    sdHideCreateConfirm();
    const body = sd$("sdLyricsBody");
    if (!body) return;

    // Complete work-area reset — pristine template, no prior match/override residue
    sdState.locked = false;
    sdState.editing = true;
    sdState.follow = false;
    sdState.liveLyrics = true;
    sdState.source = "create";
    sdState.sections = [];
    sdState.below = "";
    sdState.showBelow = true;
    sdState.dirty = false; // intentional wipe after confirm

    sdSetBtn("sdLocked", false);
    sdSetBtn("sdLiveFollow", false);
    sdSetBtn("sdLiveEdit", true);
    sdSetBtn("sdLiveLyrics", true);

    const name = typeof fileName !== "undefined" ? fileName : "";

    // Always clean sheet — never inject loaded song title into a new Create
    const full = DEFAULT_TEMPLATE;
    const parts = typeof sdSplitSheet === "function"
      ? sdSplitSheet(full)
      : { clean: full, below: "" };

    body.style.display = "";
    body.classList.remove("sd-following", "is-active");
    body.querySelectorAll(".sd-section").forEach(function (el) {
      try { el.remove(); } catch (e) {}
    });
    body.innerHTML = "";
    body.textContent = parts.clean || full;
    body.setAttribute("contenteditable", "true");
    body.contentEditable = "true";
    body.setAttribute("spellcheck", "true");
    body.classList.add("is-editing");
    try { body.focus({ preventScroll: false }); } catch (e) { try { body.focus(); } catch (e2) {} }
    try {
      var range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(true);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e3) {}

    // Pristine notes (Creative → Production → Prompt → Basement)
    const cleanBelow = DEFAULT_BELOW;
    if (typeof sdRenderBelow === "function") sdRenderBelow(cleanBelow);
    else {
      const belowEl0 = sd$("sdBelowBody");
      if (belowEl0) belowEl0.textContent = cleanBelow;
    }
    sdState.below = cleanBelow;

    const wrap = sd$("sdBelowWrap");
    if (wrap) wrap.style.display = "";
    const panel = sd$("sdBelowPanel");
    const belowToggle = sd$("sdBelowToggle");
    if (panel) {
      panel.hidden = false;
      panel.removeAttribute("hidden");
      panel.style.display = "";
    }
    if (belowToggle) {
      belowToggle.textContent = "Hide notes / versions";
      belowToggle.setAttribute("aria-expanded", "true");
    }
    const belowEl = sd$("sdBelowBody");
    if (belowEl) {
      belowEl.contentEditable = "true";
      belowEl.classList.remove("is-locked");
    }

    // Drop local lyric/notes/meta overrides so Create is a true clean work area
    try {
      if (name) {
        if (typeof sdStorageKey === "function") localStorage.removeItem(sdStorageKey(name));
        if (typeof sdBelowKey === "function") localStorage.removeItem(sdBelowKey(name));
        if (typeof sdMetaKey === "function") localStorage.removeItem(sdMetaKey(name));
        if (typeof sdFlagStoreKey === "function") localStorage.removeItem(sdFlagStoreKey(name));
      }
    } catch (e) {}

    try { if (typeof sdSaveMeta === "function") sdSaveMeta(name, { locked: false }); } catch (e) {}
    try { if (typeof sdResetStatusFlags === "function") sdResetStatusFlags(name); } catch (e) {}
    try { if (typeof sdApplyLockedUI === "function") sdApplyLockedUI(); } catch (e) {}

    const label = sd$("sdTemplateLabel");
    if (label) {
      label.textContent = "New Sheet · Create";
      label.classList.add("sd-label-create");
      try { sdUpdateBrandSubtitle("New Sheet"); } catch (e) {}
    }
    const metaEl = sd$("sdMeta");
    if (metaEl) {
      metaEl.textContent = "Create · clean template · status cleared · Export for generator when ready";
    }

    // Clear eligibility badge influence on creative reset? leave badge — audio still loaded
    // Ensure lyric sections re-parsed for follow later
    try {
      if (typeof sdRenderText === "function") {
        // stay in plain edit mode with clean text; don't re-structure until edit off
      }
    } catch (e) {}
  }

  function sdExportClean() {
    const bodyEl = sd$("sdLyricsBody");
    if (!bodyEl) return;
    const clean = sdExportCleanText(bodyEl.innerText);
    const song = sdSongName(typeof fileName !== "undefined" ? fileName : "lyrics");
    const fname = (song || "lyrics").replace(/[^\w\s\-]+/g, "").replace(/\s+/g, "_") + "_lyrics_for_generator.txt";
    try {
      const blob = new Blob([clean], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      const metaEl = sd$("sdMeta");
      if (metaEl) metaEl.textContent = "Exported for generator \u00b7 " + fname;
    } catch (e) { console.warn("sd export", e); }
  }


  function sdWire() {
    const liveBtn = sd$("sdLiveLyrics");
    const followBtn = sd$("sdLiveFollow");
    const editBtn = sd$("sdLiveEdit");
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
      if (body) body.classList.toggle("sd-following", !!sdState.follow);
      if (sdState.follow) sdFollowTick();
    };

    if (editBtn) editBtn.onclick = function (ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      const bodyEl = sd$("sdLyricsBody");
      if (sdState.locked) {
        const metaEl = sd$("sdMeta");
        if (metaEl) metaEl.textContent = "Locked \u2014 unlock to edit";
        return;
      }
      sdState.editing = !sdState.editing;
      sdSetBtn("sdLiveEdit", sdState.editing);

      if (sdState.editing) {
        // Pause follow + ensure lyrics visible
        sdState.follow = false;
        sdSetBtn("sdLiveFollow", false);
        sdState.liveLyrics = true;
        sdSetBtn("sdLiveLyrics", true);
        if (bodyEl) {
          bodyEl.style.display = "";
          bodyEl.classList.remove("sd-following");
          // Flatten to plain text so typing is reliable
          var text = bodyEl.innerText || bodyEl.textContent || "";
          bodyEl.innerHTML = "";
          bodyEl.textContent = text;
          bodyEl.setAttribute("contenteditable", "true");
          bodyEl.contentEditable = "true";
          bodyEl.setAttribute("spellcheck", "true");
          bodyEl.classList.add("is-editing");
          try { bodyEl.focus({ preventScroll: false }); } catch (e) { bodyEl.focus(); }
          // Place caret at end
          try {
            var range = document.createRange();
            range.selectNodeContents(bodyEl);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (e2) {}
        }
        const metaEl = sd$("sdMeta");
        if (metaEl) metaEl.textContent = "Editing clean sheet \u2014 Save when done";
      } else if (bodyEl) {
        bodyEl.setAttribute("contenteditable", "false");
        bodyEl.contentEditable = "false";
        bodyEl.classList.remove("is-editing");
        sdRenderText(bodyEl.innerText || bodyEl.textContent || "", true);
        const metaEl = sd$("sdMeta");
        if (metaEl) metaEl.textContent = "Edit off";
      }
    };

    if (lockBtn) lockBtn.onclick = function () {
      sdState.locked = !sdState.locked;
      const name = typeof fileName !== "undefined" ? fileName : "";
      sdSaveMeta(name, { locked: sdState.locked });
      sdApplyLockedUI();
      const label = sd$("sdTemplateLabel");
      if (label && sdSongName(name)) label.textContent = sdSongName(name) + (sdState.locked ? " \uD83D\uDD12" : "");
      const metaEl = sd$("sdMeta");
      if (metaEl) metaEl.textContent = sdState.locked ? "Lock Create \u2014 sheet frozen" : "Unlocked \u2014 Create/edit open";
    };

    const createBtn = sd$("sdCreate");
    if (createBtn) createBtn.onclick = function (ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      sdCreate();
    };
    const createConfirm = sd$("sdCreateConfirm");
    const createCancel = sd$("sdCreateCancel");
    if (createConfirm) createConfirm.onclick = function (ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      sdCreateConfirmed();
    };
    if (createCancel) createCancel.onclick = function (ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      sdHideCreateConfirm();
    };
    const createOverlay = sd$("sdCreateOverlay");
    if (createOverlay) createOverlay.addEventListener("click", function (ev) {
      if (ev.target === createOverlay) sdHideCreateConfirm();
    });
    if (!window.__sdCreateEscBound) {
      window.__sdCreateEscBound = true;
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" || ev.key === "Esc") {
          var ov = sd$("sdCreateOverlay");
          if (ov && ov.classList.contains("show")) {
            ev.preventDefault();
            sdHideCreateConfirm();
          }
        }
      });
    }
    if (exportBtn) exportBtn.onclick = function () { sdExportClean(); };
    if (saveBtn) saveBtn.onclick = function () { sdDoSave(); };

    if (belowToggle) belowToggle.onclick = function () {
      sdState.showBelow = !sdState.showBelow;
      const panel = sd$("sdBelowPanel");
      if (panel) panel.hidden = !sdState.showBelow;
      belowToggle.textContent = sdState.showBelow ? "Hide notes / versions" : "Show notes / versions";
      // Re-format every open so blobs never stay collapsed
      if (sdState.showBelow) sdRenderBelow(sdState.below || "");
    };


    // Dirty tracking + leave-page guard
    try { sdInstallUnloadGuard(); } catch (e) {}
    function sdBindDirty(el) {
      if (!el || el.__sdDirtyBound) return;
      el.__sdDirtyBound = true;
      el.addEventListener("input", function () { sdMarkDirty("input"); });
      el.addEventListener("keyup", function () { sdMarkDirty("keyup"); });
    }
    sdBindDirty(body);
    sdBindDirty(sd$("sdBelowBody"));

    sdSetBtn("sdLiveLyrics", true);
    sdSetBtn("sdLiveFollow", false);
    sdSetBtn("sdLiveEdit", false);
    sdSetBtn("sdLocked", false);
    setInterval(sdFollowTick, 250);

    try { sdWireStatusFlags(); } catch (e) { console.warn("sdWireStatusFlags", e); }
    try { sdSyncStatusFlags(typeof fileName !== "undefined" ? fileName : ""); } catch (e) {}

    if (body && !body.innerText.trim()) {
      sdRenderText(DEFAULT_TEMPLATE, true);
      sdRenderBelow(DEFAULT_BELOW);
      const label = sd$("sdTemplateLabel");
      if (label) {
        const nm = (typeof fileName !== "undefined" && fileName) ? sdSongName(fileName) : "";
        label.textContent = nm || "No track loaded";
      }
    }
  }

  window.sdApplyMatchedForName = sdApplyMatchedForName;
  window.sdSyncStatusFlags = sdSyncStatusFlags;
  window.sdExportCleanText = sdExportCleanText;
  window.sdSplitSheet = sdSplitSheet;
  window.sdDoSave = sdDoSave;
  window.sdCreate = sdCreate;
  window.sdCreateConfirmed = sdCreateConfirmed;
  window.sdHideCreateConfirm = sdHideCreateConfirm;
  window.sdResetStatusFlags = sdResetStatusFlags;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      try { sdWire(); } catch (e) { console.warn("sdWire", e); }
    });
  } else {
    try { sdWire(); } catch (e) { console.warn("sdWire", e); }
  }
})();

