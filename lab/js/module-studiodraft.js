/* module-studiodraft.js — StudioDraft: Craft. Sync. Create.
 * Clean load: header + current lyrics only.
 * Below fold: production notes, status ticks (auto from catalogue/meta), prompt, basement.
 * Match keys: optional aliases only (title variants auto-derived in findLyrics).
 * Expects: findLyricsForFilename, normalizeTitle, fileName, live, audioCtx, decodedBuffer
 * Build: v20260820lab-sd-fix
 */
(function () {
  "use strict";

  const SD_STORE_PREFIX = "devine_sd_lyrics_";
  const SD_META_PREFIX = "devine_sd_meta_";
  const SD_BELOW_PREFIX = "devine_sd_below_";
  const SD_STATUS_PREFIX = "devine_sd_status_";

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

  const DEFAULT_BELOW_NOTES = [
    "────────────────────────────────────────────────────────────",
    "PRODUCTION NOTES",
    "────────────────────────────────────────────────────────────",
    "Linked audio: ",
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

  const STATUS_KEYS = [
    { id: "wav16", label: "Mastered 16-bit WAV" },
    { id: "mp3", label: "Mastered MP3" },
    { id: "flac16", label: "Mastered 16-bit FLAC" },
    { id: "lyricsLocked", label: "Lyrics locked" },
    { id: "streaming", label: "Streaming eligible" },
    { id: "local", label: "Local" },
    { id: "spotify", label: "On Spotify" },
    { id: "edit", label: "Edit" }
  ];

  const sdState = {
    liveLyrics: true,
    follow: false,
    editing: false,
    locked: false,
    sections: [],
    source: "template",
    below: "",
    showBelow: false,
    status: {},
    editNote: ""
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
  function sdStatusKey(name) { return SD_STATUS_PREFIX + sdNorm(name); }

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
  function sdLoadStatus(name) {
    try {
      const raw = localStorage.getItem(sdStatusKey(name));
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function sdSaveStatus(name, status) {
    try { localStorage.setItem(sdStatusKey(name), JSON.stringify(status || {})); } catch (e) {}
  }

  function sdParseLockedFromText(text) {
    if (/Locked:\s*(yes|true|1|✓)/i.test(text)) return true;
    if (/Lyrics locked\s*\[x\]/i.test(text)) return true;
    if (/Locked:\s*(no|false|0)/i.test(text)) return false;
    return null;
  }

  function sdDeriveStatusFromContext(name) {
    const out = {
      wav16: false, mp3: false, flac16: false,
      lyricsLocked: !!sdState.locked,
      streaming: false, local: false, spotify: false, edit: false
    };
    const stored = sdLoadStatus(name);
    Object.keys(stored).forEach(function (k) {
      if (k in out && typeof stored[k] === "boolean") out[k] = stored[k];
    });
    out.lyricsLocked = !!sdState.locked;
    try {
      const cat = (typeof window !== "undefined" && window.DEVINE_CATALOGUE) || null;
      const entries = cat && (cat.entries || cat.tracks) || [];
      const norm = sdNorm(name);
      const song = sdSongName(name).toLowerCase();
      let hit = null;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const fn = String(e.fileName || e.song || e.title || e.name || "").toLowerCase();
        if (sdNorm(fn) === norm || fn.indexOf(song) >= 0 || song.indexOf(fn) >= 0) { hit = e; break; }
      }
      if (hit) {
        out.local = true;
        const exp = hit.export || {};
        const fmt = String(exp.format || exp.fmt || "").toUpperCase();
        const bd = String(exp.bitDepth || exp.bit_depth || "").toLowerCase();
        if (fmt.indexOf("WAV") >= 0 && (bd.indexOf("16") >= 0 || !bd)) out.wav16 = true;
        if (fmt.indexOf("MP3") >= 0) out.mp3 = true;
        if (fmt.indexOf("FLAC") >= 0 && (bd.indexOf("16") >= 0 || !bd)) out.flac16 = true;
        if (hit.safetyPass === true || (hit.hardFailCount === 0 && hit.softWarnCount != null)) out.streaming = true;
        if (hit.onSpotify === true || hit.spotify === true) out.spotify = true;
        const formats = hit.formats || hit.exports || [];
        if (Array.isArray(formats)) {
          formats.forEach(function (f) {
            const s = String(f.format || f || "").toUpperCase();
            if (s.indexOf("WAV") >= 0) out.wav16 = true;
            if (s.indexOf("MP3") >= 0) out.mp3 = true;
            if (s.indexOf("FLAC") >= 0) out.flac16 = true;
          });
        }
      }
    } catch (e) {}
    if (sdLoadOverride(name) != null || sdState.source === "LYRICS_DB" || sdState.source === "local edit") out.local = true;
    return out;
  }

  function sdRenderStatusTicks() {
    const host = sd$("sdStatusTicks");
    if (!host) return;
    const name = typeof fileName !== "undefined" ? fileName : "";
    const st = sdState.status || sdDeriveStatusFromContext(name);
    sdState.status = st;
    host.innerHTML = "";
    STATUS_KEYS.forEach(function (item) {
      const row = document.createElement("label");
      row.className = "sd-status-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "sd-status-cb";
      cb.dataset.key = item.id;
      cb.checked = !!st[item.id];
      if (item.id === "lyricsLocked") {
        cb.checked = !!sdState.locked;
        cb.addEventListener("change", function () {
          sdState.locked = cb.checked;
          sdState.status.lyricsLocked = cb.checked;
          const n = typeof fileName !== "undefined" ? fileName : "";
          sdSaveMeta(n, { locked: sdState.locked });
          sdSaveStatus(n, sdState.status);
          sdApplyLockedUI();
          const label = sd$("sdTemplateLabel");
          if (label && sdSongName(n)) label.textContent = sdSongName(n) + (sdState.locked ? " \uD83D\uDD12" : "");
        });
      } else if (item.id === "edit") {
        cb.checked = !!(st.edit || (sdState.editNote && sdState.editNote.trim()));
        cb.addEventListener("change", function () {
          sdState.status.edit = cb.checked;
          const n = typeof fileName !== "undefined" ? fileName : "";
          sdSaveStatus(n, sdState.status);
          const note = sd$("sdEditNote");
          if (note) note.style.display = cb.checked ? "" : "none";
        });
      } else {
        cb.addEventListener("change", function () {
          sdState.status[item.id] = cb.checked;
          const n = typeof fileName !== "undefined" ? fileName : "";
          sdSaveStatus(n, sdState.status);
        });
      }
      const span = document.createElement("span");
      span.textContent = item.label;
      row.appendChild(cb);
      row.appendChild(span);
      host.appendChild(row);
    });
    let note = sd$("sdEditNote");
    if (!note) {
      note = document.createElement("textarea");
      note.id = "sdEditNote";
      note.className = "sd-edit-note";
      note.placeholder = "Freeform notes / later expansion…";
      note.rows = 3;
      host.parentNode.appendChild(note);
      note.addEventListener("change", function () {
        sdState.editNote = note.value;
        const n = typeof fileName !== "undefined" ? fileName : "";
        try { localStorage.setItem(SD_STATUS_PREFIX + "note_" + sdNorm(n), note.value); } catch (e) {}
      });
    }
    try {
      const n = typeof fileName !== "undefined" ? fileName : "";
      const saved = localStorage.getItem(SD_STATUS_PREFIX + "note_" + sdNorm(n));
      if (saved != null) { note.value = saved; sdState.editNote = saved; }
    } catch (e) {}
    note.style.display = (st.edit || (sdState.editNote && sdState.editNote.trim())) ? "" : "none";
  }

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
      if (/^-{4,}.*\bV\d+\b/i.test(t)) { cut = i; break; }
    }
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
          if (/^\(.*\)\s*$/.test(t)) continue;
          if (t.length > 160 && !/^\s*\[/.test(t)) { cut = i; break; }
          if (/genres?:/i.test(t) || /walking bass/i.test(t) || /Bar \d/i.test(t)) { cut = i; break; }
        }
      }
    }
    let cleanLines, belowLines;
    if (cut >= 0) { cleanLines = lines.slice(0, cut); belowLines = lines.slice(cut); }
    else { cleanLines = lines; belowLines = []; }
    cleanLines = cleanLines.filter(function (line) { return !/^\s*Match keys:/i.test(line); });
    while (cleanLines.length && !cleanLines[cleanLines.length - 1].trim()) cleanLines.pop();
    cleanLines.push("");
    return { clean: cleanLines.join("\n"), below: belowLines.join("\n").replace(/^\s+/, "") };
  }

  function sdExportCleanText(text) {
    const parts = sdSplitSheet(text);
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
        const esc = s.lines.join("\n").replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
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
    const host = sd$("sdStatusTicks");
    if (host) {
      const cb = host.querySelector('input[data-key="lyricsLocked"]');
      if (cb) cb.checked = !!sdState.locked;
    }
  }

  function sdUpdateLabel(name) {
    const label = sd$("sdTemplateLabel");
    if (!label) return;
    const song = sdSongName(name);
    if (song) {
      label.textContent = song + (sdState.locked ? " \uD83D\uDD12" : "");
      label.title = sdState.source === "LYRICS_DB" ? "Matched from LYRICS_DB (clean view)" : sdState.source === "local edit" ? "Local edit" : "Template";
    } else {
      label.textContent = "[ LYRICS TEMPLATE ]";
      label.title = "";
    }
  }

  function sdApplyMatchedForName(name) {
    const body = sd$("sdLyricsBody");
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
      if (matched) { full = matched; source = "LYRICS_DB"; }
      else {
        const song = sdSongName(name);
        full = DEFAULT_TEMPLATE.replace(/^TITLE$/m, song || "TITLE");
        source = "template";
      }
    }
    const parts = sdSplitSheet(full);
    let clean = parts.clean;
    let below = belowStored != null ? belowStored : parts.below;
    if (!below || !below.trim()) below = source === "template" ? DEFAULT_BELOW_NOTES : parts.below;
    below = below.replace(/Status:\s*\n(?:\s*\[\s*[xX ]\s*\][^\n]*\n?)+/gi, "");
    const lockedFromSheet = sdParseLockedFromText(full);
    if (lockedFromSheet != null && override == null) sdState.locked = lockedFromSheet;
    sdState.source = source;
    body.style.display = sdState.liveLyrics ? "" : "none";
    sdUpdateLabel(name);
    sdRenderText(clean, !sdState.editing);
    sdRenderBelow(below);
    body.contentEditable = (sdState.editing && !sdState.locked) ? "true" : "false";
    sdApplyLockedUI();
    sdState.status = sdDeriveStatusFromContext(name);
    sdRenderStatusTicks();
    const wrap = sd$("sdBelowWrap");
    if (wrap) wrap.style.display = "";
    const panel = sd$("sdBelowPanel");
    if (panel && !sdState.showBelow) panel.hidden = true;
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
    sdSaveStatus(name, sdState.status);
    if (sdState.editing) {
      sdState.editing = false;
      sdSetBtn("sdLiveEdit", false);
      const bodyEl = sd$("sdLyricsBody");
      if (bodyEl) { bodyEl.contentEditable = "false"; sdRenderText(bodyEl.innerText, true); }
    }
    const metaEl = sd$("sdMeta");
    if (metaEl) metaEl.textContent = "Saved \u00b7 " + sdSongName(name);
    sdUpdateLabel(name);
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

  function sdToggleBelow(force) {
    if (typeof force === "boolean") sdState.showBelow = force;
    else sdState.showBelow = !sdState.showBelow;
    const panel = sd$("sdBelowPanel");
    const toggle = sd$("sdBelowToggle");
    if (panel) panel.hidden = !sdState.showBelow;
    if (toggle) {
      toggle.textContent = sdState.showBelow ? "Hide status / notes" : "Status / notes";
      toggle.setAttribute("aria-expanded", sdState.showBelow ? "true" : "false");
      toggle.classList.toggle("open", sdState.showBelow);
    }
  }

  function sdWire() {
    const liveBtn = sd$("sdLiveLyrics");
    const followBtn = sd$("sdLiveFollow");
    const editBtn = sd$("sdLiveEdit");
    const infoCb = sd$("sdInfoToggle");
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
        if (body) {
          const text = body.innerText;
          body.contentEditable = "false";
          sdRenderText(text, true);
        }
      }
      sdSetBtn("sdLiveFollow", sdState.follow);
      if (body) body.classList.toggle("sd-following", sdState.follow);
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
          body.textContent = text;
          body.contentEditable = "true";
          body.focus();
          try {
            const range = document.createRange();
            range.selectNodeContents(body);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (e) {}
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
      if (sdState.status) sdState.status.lyricsLocked = sdState.locked;
      sdSaveStatus(name, sdState.status);
      sdApplyLockedUI();
      sdUpdateLabel(name);
      const metaEl = sd$("sdMeta");
      if (metaEl) metaEl.textContent = sdState.locked ? "Locked" : "Unlocked";
    };

    if (exportBtn) exportBtn.onclick = function () { sdExportClean(); };
    if (saveBtn) saveBtn.onclick = function () { sdDoSave(); };

    if (belowToggle) {
      belowToggle.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        sdToggleBelow();
      };
    }

    if (infoCb) {
      infoCb.addEventListener("change", function () {
        const metaEl = sd$("sdMeta");
        if (infoCb.checked) {
          if (metaEl) metaEl.textContent = "Clean lyrics on top \u00b7 Status/notes below \u00b7 Export clean = body only";
        } else {
          if (metaEl) metaEl.textContent = "";
        }
      });
    }

    sdSetBtn("sdLiveLyrics", true);
    sdSetBtn("sdLiveFollow", false);
    sdSetBtn("sdLiveEdit", false);
    sdSetBtn("sdLocked", false);
    setInterval(sdFollowTick, 400);

    sdState.showBelow = false;
    sdToggleBelow(false);
    const wrap = sd$("sdBelowWrap");
    if (wrap) wrap.style.display = "";

    const name = typeof fileName !== "undefined" ? fileName : "";
    if (name) {
      sdApplyMatchedForName(name);
    } else if (body && !body.innerText.trim()) {
      sdRenderText(DEFAULT_TEMPLATE, true);
      sdRenderBelow(DEFAULT_BELOW_NOTES);
      sdUpdateLabel("");
      sdState.status = sdDeriveStatusFromContext("");
      sdRenderStatusTicks();
    }
  }

  window.sdApplyMatchedForName = sdApplyMatchedForName;
  window.sdExportCleanText = sdExportCleanText;
  window.sdSplitSheet = sdSplitSheet;
  window.sdDoSave = sdDoSave;
  window.sdRefreshStatus = function () {
    const name = typeof fileName !== "undefined" ? fileName : "";
    sdState.status = sdDeriveStatusFromContext(name);
    sdRenderStatusTicks();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      try { sdWire(); } catch (e) { console.warn("sdWire", e); }
    });
  } else {
    try { sdWire(); } catch (e) { console.warn("sdWire", e); }
  }
})();
