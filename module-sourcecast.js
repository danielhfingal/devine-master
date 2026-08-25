/* module-sourcecast.js — Module 2: SourceCast
 * Vinyl scrubber + capture bridge (loopback → SourceCast A).
 * Requires 00-core.js. Defines window.updateScrubUI / setVinylSpin.
 */
/* —— Semicircle seek scrubber —— */



(function wireSemicircleSeek() {
  const thumb = document.getElementById("scrubThumb");
  const fill = document.getElementById("scrubFill");
  const hit = document.getElementById("scrubHit");
  const seek = document.getElementById("seek");
  const track = document.getElementById("scrubTrack");
  if (!thumb || !hit || !seek) return;

  const CX = 100, CY = 100, R = 100;
  // Full circle = outer ring size. Progress counter-clockwise from top.
  const CIRC = 2 * Math.PI * R;

  function pt(t) {
    t = Math.max(0, Math.min(1, t));
    // t=0 at top, counter-clockwise
    const a = -Math.PI / 2 - t * Math.PI * 2;
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  }

  function setThumb(t) {
    t = Math.max(0, Math.min(1, t));
    const p = pt(t);
    if (thumb) {
      thumb.setAttribute("cx", p.x.toFixed(2));
      thumb.setAttribute("cy", p.y.toFixed(2));
    }
    if (fill) {
      const drawn = Math.max(0, t * CIRC);
      const rest = Math.max(CIRC - drawn, 0.01);
      fill.setAttribute("stroke-dasharray", drawn.toFixed(3) + " " + rest.toFixed(3));
      fill.setAttribute("stroke-dashoffset", "0");
      fill.setAttribute("stroke", "#f07820");
      fill.style.stroke = "#f07820";
      fill.style.opacity = "1";
    }
  }

  setThumb(0);

  
window.setVinylSpin = function setVinylSpin(on) {
  const ring = document.getElementById("vinylRing");
  if (!ring) return;
  if (on) ring.classList.add("spinning");
  else ring.classList.remove("spinning");
}

  window.updateScrubUI = function(cur, dur) {
    if (seek.dataset.dragging === "1") return;
    const t = (dur > 0 && isFinite(cur)) ? Math.max(0, Math.min(1, cur / dur)) : 0;
    seek.value = String(Math.round(t * 1000));
    setThumb(t);
  };

  function duration() {
    try {
      const dm = window.__dm;
      if (dm && dm.getDecoded) {
        const buf = dm.getDecoded();
        if (buf && buf.duration > 0) return buf.duration;
      }
      const b = document.getElementById("audioB");
      if (b && isFinite(b.duration) && b.duration > 0) return b.duration;
      const a = document.getElementById("audioA");
      if (a && isFinite(a.duration) && a.duration > 0) return a.duration;
    } catch (e) {}
    return 0;
  }

  function modeIsB() {
    try {
      const b = document.getElementById("tabB");
      return b && b.classList.contains("on");
    } catch (e) { return false; }
  }

  /** Commit seek once — never called on every mousemove */
  function commitSeek(t) {
    t = Math.max(0, Math.min(1, t));
    const dur = duration();
    if (!(dur > 0)) return;
    const sec = Math.max(0, Math.min(t * dur, dur - 0.05));
    setThumb(t);
    seek.value = String(Math.round(t * 1000));
    try {
      const dm = window.__dm;
      if (modeIsB()) {
        const audioB = document.getElementById("audioB");
        if (audioB && isFinite(audioB.duration)) {
          const wasPlaying = !audioB.paused;
          audioB.currentTime = sec;
          // do not auto-play; leave play state as-is
          if (wasPlaying) {
            audioB.play().catch(function(){});
          }
        }
        return;
      }
      // Mode A — live graph
      if (dm && dm.getDecoded && dm.getDecoded()) {
        const live = dm.getLive ? dm.getLive() : null;
        const was = !!(live && live.playing);
        if (dm.stopLive) dm.stopLive();
        if (live) live.offset = sec;
        if (was && dm.startLive) dm.startLive(sec);
      }
    } catch (e) { console.warn("seek commit", e); }
  }

  function tFromClient(clientX, clientY) {
    const svg = document.getElementById("scrubSvg");
    const rect = svg.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return 0;
    const x = ((clientX - rect.left) / rect.width) * 200;
    const y = ((clientY - rect.top) / rect.height) * 200;
    let ang = Math.atan2(y - CY, x - CX); // -PI..PI, 0 = right
    // From top, counter-clockwise to match pt()
    let fromTop = Math.PI / 2 - ang; // invert vs clockwise mapping
    if (fromTop < 0) fromTop += Math.PI * 2;
    if (fromTop >= Math.PI * 2) fromTop -= Math.PI * 2;
    return Math.max(0, Math.min(1, fromTop / (Math.PI * 2)));
  }

  /** Accept interaction on the full scrub ring band (not the center play cluster) */
  function isOnLowerArc(clientX, clientY) {
    const svg = document.getElementById("scrubSvg");
    const rect = svg.getBoundingClientRect();
    if (rect.width < 1) return false;
    const x = ((clientX - rect.left) / rect.width) * 200;
    const y = ((clientY - rect.top) / rect.height) * 200;
    const dx = x - CX, dy = y - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Full LP surface (grab anywhere on the record); leave play button core free
    return dist >= 28 && dist <= R + 10;
  }

  let dragging = false;
  let pendingT = 0;
  let lastAng = null;

  /** Angle in radians, 0 at top, increasing counter-clockwise (matches progress). */
  function angFromClient(clientX, clientY) {
    const svg = document.getElementById("scrubSvg");
    const rect = svg.getBoundingClientRect();
    if (rect.width < 1) return 0;
    const x = ((clientX - rect.left) / rect.width) * 200;
    const y = ((clientY - rect.top) / rect.height) * 200;
    // atan2: 0 = +x (right). Convert so 0 = top, increases CCW.
    let ang = Math.atan2(y - CY, x - CX); // -PI..PI
    let fromTop = Math.PI / 2 - ang; // CCW from top
    // normalize 0..2PI
    while (fromTop < 0) fromTop += Math.PI * 2;
    while (fromTop >= Math.PI * 2) fromTop -= Math.PI * 2;
    return fromTop;
  }

  function onDown(ev) {
    const e = ev.touches ? ev.touches[0] : ev;
    if (!isOnLowerArc(e.clientX, e.clientY)) return;
    dragging = true;
    seek.dataset.dragging = "1";
    // Do NOT jump thumb/seek on click — only track angle for later movement
    lastAng = angFromClient(e.clientX, e.clientY);
    // start from current playhead
    try {
      const cur = (typeof duration === "function" && duration() > 0)
        ? (function () {
            try {
              if (modeIsB()) {
                const b = document.getElementById("audioB");
                return (b && b.duration) ? (b.currentTime / b.duration) : 0;
              }
              const dm = window.__dm;
              if (dm && dm.getLive && dm.getLive() && dm.getLive().playing && typeof livePosition === "function") {
                return livePosition() / duration();
              }
            } catch (err) {}
            return parseFloat(seek.value || "0") / 1000;
          })()
        : parseFloat(seek.value || "0") / 1000;
      pendingT = Math.max(0, Math.min(1, cur));
    } catch (err) {
      pendingT = parseFloat(seek.value || "0") / 1000;
    }
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onMove(ev) {
    if (!dragging || lastAng == null) return;
    const e = ev.touches ? ev.touches[0] : ev;
    const ang = angFromClient(e.clientX, e.clientY);
    // Smallest signed delta; positive = CCW = forward in track
    let d = ang - lastAng;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    lastAng = ang;
    if (Math.abs(d) < 0.0005) return; // ignore pure click noise
    pendingT = Math.max(0, Math.min(1, pendingT + d / (Math.PI * 2)));
    setThumb(pendingT);
    // live scrub while dragging
    try { commitSeek(pendingT); } catch (err) {}
    ev.preventDefault();
  }

  function onUp(ev) {
    if (!dragging) return;
    dragging = false;
    seek.dataset.dragging = "0";
    lastAng = null;
    try { commitSeek(pendingT); } catch (err) {}
  }

  hit.addEventListener("mousedown", onDown);
  thumb.addEventListener("mousedown", onDown);
  hit.addEventListener("touchstart", onDown, { passive: false });
  thumb.addEventListener("touchstart", onDown, { passive: false });
  // full disc also receives events via SVG background
  const svgEl = document.getElementById("scrubSvg");
  if (svgEl) {
    svgEl.style.cursor = "grab";
    svgEl.addEventListener("mousedown", onDown);
    svgEl.addEventListener("touchstart", onDown, { passive: false });
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);

  setThumb(0);
})();
/* ——— Capture bridge v1.0 (local loopback → SourceCast A) ——— */
const CAPTURE_BRIDGE = "http://127.0.0.1:8765";

// Prove capture build on screen (do not leave V20260821)
try {
  if (typeof sdUpdateBrandSubtitle === "function") sdUpdateBrandSubtitle(null);
  else {
    var el = document.getElementById("logoSub");
    if (el) {
      el.textContent = "V20260822 · TRINITY";
      el.title = "Build " + (typeof APP_BUILD !== "undefined" ? APP_BUILD : "v1z");
    }
  }
} catch (e) {}

const CAPTURE_SILENT_PEAK = 0.001;
window.captureRecording = false;
window.captureBusy = false;
window.captureRecStartedAt = 0;
window.captureRecTimer = null;
// aliases for older closures
var captureRecording = false;
var captureBusy = false;
var captureRecStartedAt = 0;
var captureRecTimer = null;
var captureLevelTimer = null;


/* Capture visual self-heal — do not rely on CSS class cascade alone */
var _capSpinAnim = null;

function captureVinylEls() {
  var ring = document.getElementById("vinylRing") || document.querySelector(".ring");
  var wrap = document.querySelector(".ring-wrap");
  var rim = document.querySelector(".play-rim");
  return { ring: ring, wrap: wrap, rim: rim };
}

function captureApplyVinylVisual(on) {
  var els = captureVinylEls();
  var ring = els.ring;
  var wrap = els.wrap;
  var rim = els.rim;

  if (on) {
    if (wrap) {
      wrap.style.zIndex = "12";
      wrap.style.opacity = "1";
      wrap.style.visibility = "visible";
      wrap.style.pointerEvents = "none";
    }
    if (ring) {
      ring.classList.add("spinning", "capturing");
      // Inline plate — survives missing/overridden CSS
      ring.style.opacity = "1";
      ring.style.visibility = "visible";
      ring.style.display = "block";
      ring.style.width = "100%";
      ring.style.height = "100%";
      ring.style.borderRadius = "50%";
      ring.style.border = "2px solid rgba(200,160,90,0.55)";
      ring.style.transformOrigin = "50% 50%";
      ring.style.background =
        "radial-gradient(circle at 50% 50%, " +
          "rgba(32,28,24,0.98) 0 8%, " +
          "rgba(120,95,55,0.55) 8% 9%, " +
          "rgba(40,36,32,0.95) 9% 10.5%, " +
          "rgba(55,50,45,0.4) 10.5% 11.5%, " +
          "rgba(36,32,28,0.98) 11.5% 100%)," +
        "repeating-radial-gradient(circle at 50% 50%, " +
          "rgba(110,100,88,0.85) 0 1.5px, " +
          "rgba(28,24,20,0.98) 1.5px 4px)," +
        "#1c1814";
      ring.style.boxShadow =
        "inset 0 0 36px rgba(0,0,0,0.45), 0 0 0 2px rgba(210,170,90,0.55), 0 0 40px rgba(200,70,40,0.35)";
      ring.style.filter = "contrast(1.15) brightness(1.12)";
      // Force spin via Web Animations API (self-heal if CSS animation blocked)
      try {
        if (_capSpinAnim) {
          try { _capSpinAnim.cancel(); } catch (e) {}
          _capSpinAnim = null;
        }
        if (ring.animate) {
          _capSpinAnim = ring.animate(
            [{ transform: "rotate(0deg)" }, { transform: "rotate(-360deg)" }],
            { duration: 3200, iterations: Infinity, easing: "linear" }
          );
        } else {
          ring.style.animation = "vinyl-spin-rec 3.2s linear infinite";
        }
      } catch (e) {
        ring.style.animation = "vinyl-spin-rec 3.2s linear infinite";
      }
    }
    if (rim) {
      rim.classList.add("capturing");
      rim.style.boxShadow =
        "0 0 0 3px rgba(200,50,40,0.55), 0 0 22px rgba(220,60,40,0.45), 0 12px 28px rgba(0,0,0,0.55)";
    }
    if (typeof setVinylSpin === "function") {
      try { setVinylSpin(true); } catch (e) {}
    }
    // Self-heal retry: layout may not be ready on first frame
    setTimeout(function () {
      var r2 = captureVinylEls().ring;
      if (!r2) return;
      if (getComputedStyle(r2).opacity === "0" || r2.offsetWidth < 8) {
        r2.style.opacity = "1";
        r2.style.width = "100%";
        r2.style.height = "100%";
      }
    }, 50);
  } else {
    if (ring) {
      ring.classList.remove("spinning", "capturing");
      ring.style.opacity = "";
      ring.style.visibility = "";
      ring.style.display = "";
      ring.style.border = "";
      ring.style.background = "";
      ring.style.boxShadow = "";
      ring.style.filter = "";
      ring.style.animation = "";
      ring.style.transform = "";
      try {
        if (_capSpinAnim) {
          _capSpinAnim.cancel();
          _capSpinAnim = null;
        }
      } catch (e) {}
    }
    if (wrap) {
      wrap.style.zIndex = "";
      wrap.style.opacity = "";
      wrap.style.visibility = "";
    }
    if (rim) {
      rim.classList.remove("capturing");
      rim.style.boxShadow = "";
    }
    var keep = false;
    try {
      if ($("audioB") && !$("audioB").paused) keep = true;
      else if (typeof live !== "undefined" && live && live.playing) keep = true;
    } catch (e) {}
    if (typeof setVinylSpin === "function") {
      try { setVinylSpin(keep); } catch (e) {}
    }
  }
}



var captureLevelTimer = null;
function captureLevelShow(on) {
  // Center INPUT bar permanently off — EQ rails only
  var bar = document.getElementById("capLevel") || document.getElementById("capLevelWrap");
  if (bar) {
    bar.classList.remove("show");
    bar.style.display = "none";
    bar.setAttribute("aria-hidden", "true");
  }
  if (typeof captureLevelTimer !== "undefined" && captureLevelTimer) {
    try { clearInterval(captureLevelTimer); } catch (e) {}
    captureLevelTimer = null;
  }
  window.__capLevelEnv = 0;
  document.body.classList.toggle("capture-armed", !!on);
  if (!on) {
    document.querySelectorAll("#mL, #mR, .eq-meters-pair .rail-fill").forEach(function (el) {
      el.style.setProperty("height", "4%", "important");
    });
    var fill = document.getElementById("capInlineMeterFill");
    if (fill) fill.style.width = "4%";
    var lbl = document.getElementById("lblCaptureRec");
    if (lbl) {
      lbl.classList.remove("cap-live");
      lbl.textContent = "Record";
    }
    return;
  }

  function paintRails(pct, peak) {
    var h = Math.min(98, Math.max(4, Number(pct) || 0));
    var hs = h.toFixed(1) + "%";
    // EQ rails
    document.querySelectorAll("#mL, #mR, .eq-meters-pair .rail-fill").forEach(function (el) {
      el.style.setProperty("height", hs, "important");
      el.style.setProperty("opacity", "1", "important");
      el.style.setProperty("visibility", "visible", "important");
    });
    // Corner overlay removed — EQ rails + REC% under Record only
    // Inline under Record — always in the FILE column
    var fill = document.getElementById("capInlineMeterFill");
    if (fill) fill.style.width = hs;
    var lbl = document.getElementById("lblCaptureRec");
    if (lbl && window.captureRecording) {
      lbl.classList.add("cap-live");
      var p = (typeof peak === "number" && isFinite(peak)) ? peak : 0;
      lbl.textContent = "REC " + Math.round(h) + "%";
    }
    return h;
  }

  captureLevelTimer = setInterval(async function () {
    if (!window.captureRecording) return;
    try {
      var r = await fetch(CAPTURE_BRIDGE + "/status", { mode: "cors", cache: "no-store" });
      if (!r.ok) {
        if (typeof $ === "function" && $("status")) $("status").textContent = "Capture: HTTP " + r.status;
        return;
      }
      var j = await r.json();
      if (!j) return;
      if (j.recording === false) return;

      var peak = 0;
      if (typeof j.live_peak === "number" && isFinite(j.live_peak)) peak = Math.max(0, j.live_peak);
      else if (typeof j.last_peak === "number" && isFinite(j.last_peak)) peak = Math.max(0, j.last_peak);

      var pct;
      if (typeof j.meter_pct === "number" && isFinite(j.meter_pct)) {
        pct = Math.max(0, Math.min(100, j.meter_pct));
      } else {
        // Client fallback map (same idea as bridge peak_to_meter_pct)
        pct = peak <= 1e-9 ? 0 : Math.min(100, Math.pow(peak, 0.45) * 115);
        if (peak > 0.0005 && pct < 12) pct = 12;
      }

      // Smooth
      var env = window.__capLevelEnv || 0;
      if (pct > env) env = env + (pct - env) * 0.7;
      else env = env + (pct - env) * 0.35;
      window.__capLevelEnv = env;

      var h = paintRails(env, peak);
      var st = (typeof $ === "function") ? $("status") : document.getElementById("status");
      if (st) {
        st.textContent = "REC  peak " + peak.toFixed(4) + "  meter " + Math.round(h) + "%" +
          (j.live_peak == null && j.meter_pct == null ? "  [bridge missing live_peak — update capture_bridge.py]" : "");
      }
    } catch (e) {
      var st2 = (typeof $ === "function") ? $("status") : document.getElementById("status");
      if (st2) st2.textContent = "Capture meter error: " + (e && e.message ? e.message : e);
      console.warn("captureLevel poll", e);
    }
  }, 50);
}

/** UI-only proof: animate EQ rails without bridge (URL ?meterDemo=1 or console call). */
function captureMeterDemo(seconds) {
  seconds = seconds || 8;
  window.captureRecording = true;
  document.body.classList.add("capture-armed");
  var t0 = performance.now();
  var id = setInterval(function () {
    var t = (performance.now() - t0) / 1000;
    if (t > seconds) {
      clearInterval(id);
      window.captureRecording = false;
      document.body.classList.remove("capture-armed");
      document.querySelectorAll("#mL, #mR, .eq-meters-pair .rail-fill").forEach(function (el) {
        el.style.setProperty("height", "4%", "important");
      });
      if (typeof $ === "function" && $("status")) $("status").textContent = "meter demo done";
      return;
    }
    // Bounce 10% → 95%
    var pct = 10 + 85 * Math.abs(Math.sin(t * 2.2));
    document.querySelectorAll("#mL, #mR, .eq-meters-pair .rail-fill").forEach(function (el) {
      el.style.setProperty("height", pct.toFixed(1) + "%", "important");
    });
    if (typeof $ === "function" && $("status")) $("status").textContent = "DEMO meter " + Math.round(pct) + "%";
  }, 40);
  return "meter demo running " + seconds + "s";
}
window.captureMeterDemo = captureMeterDemo;
if (/[?&]meterDemo=1/.test(location.search || "")) {
  setTimeout(function () { captureMeterDemo(10); }, 800);
}


function captureSetArmed(on) {
  captureRecording = !!on;
  window.captureRecording = !!on;
  const btn = $("btnCaptureRec");
  const lbl = $("lblCaptureRec");
  if (btn) {
    btn.classList.toggle("rec-armed", !!on);
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.removeAttribute("title");
  }
  // Label: captureLevelShow overwrites to "REC NN%" while live; only set Stop as interim
  if (lbl && !on) {
    lbl.classList.remove("cap-live");
    lbl.textContent = "Record";
  } else if (lbl && on) {
    lbl.textContent = "Stop";
  }

  try {
    captureApplyVinylVisual(!!on);
  } catch (e) {
    console.warn("captureApplyVinylVisual", e);
  }

  // SINGLE meter owner: captureLevelShow (live_peak → EQ rails + inline + overlay)
  // Do NOT start a second interval here — a legacy last_peak poll used to clear this
  // and kill the meters every time Record was armed.
  try {
    captureLevelShow(!!on);
  } catch (e) {
    console.warn("captureLevelShow", e);
  }

  // Recording clock only (does not touch meters)
  if (on) {
    captureRecStartedAt = performance.now();
    window.captureRecStartedAt = captureRecStartedAt;
    if (captureRecTimer) {
      try { clearInterval(captureRecTimer); } catch (e) {}
    }
    function paintRecClock() {
      if (!window.captureRecording) return;
      var el = document.getElementById("time");
      if (!el) return;
      var sec = (performance.now() - (window.captureRecStartedAt || captureRecStartedAt)) / 1000;
      if (sec < 0) sec = 0;
      var m = String(Math.floor(sec / 60)).padStart(2, "0");
      var s = String(Math.floor(sec % 60)).padStart(2, "0");
      var cs = String(Math.floor((sec % 1) * 100)).padStart(2, "0");
      el.innerHTML = m + ":" + s + ":<span class=\"time-cs\">" + cs + "</span> / <span style=\"opacity:.55\">REC</span>";
      el.title = "Recording duration";
    }
    paintRecClock();
    captureRecTimer = setInterval(paintRecClock, 100);
    window.captureRecTimer = captureRecTimer;
  } else {
    if (captureRecTimer) {
      try { clearInterval(captureRecTimer); } catch (e) {}
      captureRecTimer = null;
      window.captureRecTimer = null;
    }
    // captureLevelShow(false) already cleared captureLevelTimer
    captureRecStartedAt = 0;
    window.captureRecStartedAt = 0;
  }
}

async function captureBridgeHealth() {
  try {
    const r = await fetch(CAPTURE_BRIDGE + "/health", {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    if (!r.ok) return false;
    const j = await r.json();
    window.__capBridgeHealth = j;
    if (j && j.ok === true) {
      if (!(j.build === "v1x-meter" || j.has_live_peak === true)) {
        console.warn("capture bridge is OLD (no live_peak build). Replace tools/capture_bridge.py");
        window.__capBridgeOld = true;
      } else {
        window.__capBridgeOld = false;
      }
      return true;
    }
    return false;
  } catch (e) {
    console.warn("captureBridgeHealth", e);
    return false;
  }
}

async function capturePickDevice(force) {
  let preferred = "";
  try { preferred = localStorage.getItem("devine_capture_device") || ""; } catch (e) {}
  try {
    const r = await fetch(CAPTURE_BRIDGE + "/devices", { mode: "cors", cache: "no-store" });
    const j = await r.json();
    if (!r.ok || !j.ok || !j.devices || !j.devices.length) return preferred || "";
    const devices = j.devices;
    if (j.preferred_device) preferred = preferred || j.preferred_device;
    if (!force && preferred && devices.some(function (d) { return d.id === preferred || d.name === preferred; })) {
      return preferred;
    }
    var lines = devices.map(function (d, idx) {
      var marks = [];
      if (d.matches_default_speaker) marks.push("default");
      if (d.likely_loopback) marks.push("loop");
      return idx + ": " + d.name + (marks.length ? " [" + marks.join(",") + "]" : "");
    });
    var hint = preferred ? "\nCurrent: " + preferred : "\nTip: 0 = Speakers (usual Suno path)";
    var ans = window.prompt(
      "Loopback device (Suno output).\nEnter number or full name.\nCancel = keep current / auto.\n\n" + lines.join("\n") + hint,
      preferred ? preferred : "0"
    );
    if (ans === null) return preferred || "";
    ans = String(ans).trim();
    if (/^\d+$/.test(ans)) {
      var n = parseInt(ans, 10);
      if (devices[n]) ans = devices[n].id;
    }
    if (ans) {
      try { localStorage.setItem("devine_capture_device", ans); } catch (e) {}
      try {
        await fetch(CAPTURE_BRIDGE + "/device", {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: ans }),
        });
      } catch (e) {}
    }
    return ans || preferred || "";
  } catch (e) {
    console.warn("capturePickDevice", e);
    return preferred || "";
  }
}

async function captureLoadUrl(url, fname) {
  const br = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!br.ok) throw new Error("Could not download capture WAV (" + br.status + ")");
  const blob = await br.blob();
  const file = new File([blob], fname || "capture.wav", { type: "audio/wav" });
  if (typeof loadFile !== "function") throw new Error("loadFile missing");
  await loadFile(file);
}

async function captureLoadLastFallback() {
  const r = await fetch(CAPTURE_BRIDGE + "/last.json", { mode: "cors", cache: "no-store" });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error((j && j.error) || "No last capture on bridge");
  const url = j.url || (CAPTURE_BRIDGE + "/last.wav");
  await captureLoadUrl(url, j.filename || "capture.wav");
  return j;
}


function captureAskName(defaultName) {
  return new Promise(function (resolve) {
    const overlay = $("capNameOverlay");
    const input = $("capNameInput");
    const ok = $("capNameOk");
    const cancel = $("capNameCancel");
    if (!overlay || !input || !ok || !cancel) {
      // Fallback if DOM missing
      const t = window.prompt("Name your creation", defaultName || "");
      resolve(t === null ? null : String(t));
      return;
    }
    function placeOverVinyl() {
      try {
        const vinyl =
          document.querySelector(".ring-wrap") ||
          document.getElementById("vinylRing") ||
          document.querySelector(".scrub-wrap") ||
          document.querySelector(".stage");
        const disc = overlay.querySelector(".cap-name-disc");
        if (!disc) return;
        if (vinyl) {
          const r = vinyl.getBoundingClientRect();
          // Dead center of the vinyl circle (same geometry as INFO)
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          // Match vinyl size — slightly under full ring so the gold edge reads
          const size = Math.round(Math.min(r.width, r.height) * 0.96);
          disc.style.setProperty("--cap-size", size + "px");
          disc.style.left = cx + "px";
          disc.style.top = cy + "px";
          disc.style.transform = "translate(-50%, -50%)";
        } else {
          disc.style.left = "50%";
          disc.style.top = "50%";
          disc.style.setProperty("--cap-size", "min(380px, 70vmin)");
          disc.style.transform = "translate(-50%, -50%)";
        }
      } catch (e) {}
    }
    function onCapResize() { placeOverVinyl(); }
    function close(val) {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.display = "none";
      window.removeEventListener("resize", onCapResize);
      ok.onclick = null;
      cancel.onclick = null;
      input.onkeydown = null;
      resolve(val);
    }
    placeOverVinyl();
    window.addEventListener("resize", onCapResize);
    requestAnimationFrame(placeOverVinyl);
    function onCapResize() { placeOverVinyl(); }
    window.addEventListener("resize", onCapResize);
    const _prevClose = null;
    input.value = defaultName || "";
    overlay.style.display = "block";
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");
    setTimeout(function () {
      input.focus();
      input.select();
    }, 40);
    ok.onclick = function () {
      close(String(input.value || "").trim() || "source");
    };
    cancel.onclick = function () {
      close(null);
    };
    input.onkeydown = function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        close(String(input.value || "").trim() || "source");
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        close(null);
      }
    };
  });
}

async function captureStart() {
  if (window.captureBusy || window.captureRecording) return;
  // file:// cannot reliably talk to the capture bridge (unique opaque origins)
  if (location.protocol === "file:") {
    alert(
      "Open this desk via localhost — not file://\n\n" +
      "In PowerShell:\n" +
      "  cd path\to\tools\n" +
      "  python -m http.server 8766\n\n" +
      "Then open:\n" +
      "  http://127.0.0.1:8766/DEVINE_MASTER_Lab_StudioDraft%20(46)%20(18).html\n\n" +
      "Keep capture bridge on :8765 running in another window."
    );
    return;
  }
  captureBusy = true;
  window.captureBusy = true;
  try {
    const ok = await captureBridgeHealth();
    if (!ok) {
      alert(
        "Capture bridge is not running.\n\n" +
        "Fix (keep the window open):\n" +
        "  1. Double-click tools\\start_capture_bridge.bat\n" +
        "     OR in PowerShell:\n" +
        "  cd F:\\devine-master-fresh\\devine-master\n" +
        "  python tools\\capture_bridge.py\n\n" +
        "  2. Wait for: self-test OK\n" +
        "  3. Press Record again.\n\n" +
        "Only one bridge window — never start a second."
      );
      return;
    }

    const defName =
      (typeof fileName !== "undefined" && fileName) ? fileName : "";
    const name = await captureAskName(defName);
    if (name === null) return; // Not now
    const title = String(name || "source").trim() || "source";

    const deviceId = await capturePickDevice(false);

    const r = await fetch(CAPTURE_BRIDGE + "/record/start", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: title, max_seconds: 600, device_id: deviceId || undefined }),
    });
    const j = await r.json().catch(function () { return {}; });
    if (r.status === 409) {
      alert("Already recording on the bridge.\nPress Record again to Stop.");
      captureSetArmed(true);
      return;
    }
    if (!r.ok || !j.ok) throw new Error((j && j.error) || ("HTTP " + r.status));

    captureSetArmed(true);
    if (window.__capBridgeOld) {
      alert(
        "Bridge is running but it is the OLD script (no live_peak).\n\n" +
        "EQ meters cannot move until you replace:\n" +
        "  tools\\capture_bridge.py\n" +
        "with the new file, then Ctrl+C and restart the bridge.\n\n" +
        "Check: open http://127.0.0.1:8765/health — must show \"build\": \"v1x-meter\"."
      );
    }
    if ($("status")) {
      $("status").textContent =
        "RECORDING — play audio on Speakers · Stop when done · " + (j.filename || "");
    }
  } catch (e) {
    console.warn(e);
    captureSetArmed(false);
    if ($("status")) $("status").textContent = "Record start failed: " + (e.message || e);
    alert("Record start failed: " + (e.message || e));
  } finally {
    captureBusy = false;
    window.captureBusy = false;
  }
}

async function captureStopAndLoad() {
  if (window.captureBusy) return;
  captureBusy = true;
  window.captureBusy = true;
  try {
    if ($("status")) $("status").textContent = "Stopping capture…";
    const r = await fetch(CAPTURE_BRIDGE + "/record/stop", {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok || !j.ok) throw new Error((j && j.error) || ("HTTP " + r.status));

    captureSetArmed(false);

    const peak = (typeof j.peak === "number") ? j.peak : null;
    const silent = j.silent === true || (peak !== null && peak < CAPTURE_SILENT_PEAK);
    const fname = j.filename || "capture.wav";
    const url = j.url || (CAPTURE_BRIDGE + "/last.wav");

    if (silent) {
      if ($("status")) {
        $("status").textContent =
          "Capture silent (peak " + (peak != null ? peak.toFixed(4) : "?") + ") · not loaded · play Suno on Speakers and retry";
      }
      const retry = confirm(
        "Capture looks silent (peak " + (peak != null ? peak.toFixed(4) : "n/a") + ").\n\n" +
        "Usually: Suno was muted, wrong output device, or not playing during Record.\n\n" +
        "OK = try load anyway\nCancel = discard (file stays in captures\\)"
      );
      if (!retry) return;
    }

    if ($("status")) $("status").textContent = "Loading capture into SourceCast A… " + fname;
    try {
      await captureLoadUrl(url, fname);
    } catch (loadErr) {
      console.warn(loadErr);
      if ($("status")) $("status").textContent = "Auto-load failed — trying last capture…";
      try {
        await captureLoadLastFallback();
      } catch (e2) {
        const openLast = confirm(
          "Could not auto-load capture into A.\n\n" +
          (loadErr.message || loadErr) + "\n\n" +
          "OK = retry last capture from bridge\nCancel = load manually from captures\\"
        );
        if (openLast) {
          await captureLoadLastFallback();
        } else {
          throw loadErr;
        }
      }
    }

    if ($("status")) {
      $("status").textContent =
        "Capture loaded · SourceCast A · " + fname +
        (peak != null ? (" · peak " + peak.toFixed(3)) : "") +
        " — press ▶ then MASTER";
    }
  } catch (e) {
    console.warn(e);
    captureSetArmed(false);
    if ($("status")) $("status").textContent = "Capture stop/load failed: " + (e.message || e);
    alert("Capture stop/load failed: " + (e.message || e));
  } finally {
    captureBusy = false;
    window.captureBusy = false;
  }
}

function wireCaptureRec() {
  const btn = $("btnCaptureRec");
  if (!btn || btn.__captureWired) return;
  btn.__captureWired = true;
  btn.removeAttribute("title");
  btn.setAttribute("aria-label", "Record loopback capture");
  btn.setAttribute("data-k", "captureRec");
  btn.addEventListener("click", async function (ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (window.captureBusy) return;
    if (ev && ev.shiftKey && !window.captureRecording) {
      try { localStorage.removeItem("devine_capture_device"); } catch (e) {}
      if ($("status")) $("status").textContent = "Capture device cleared — pick 0 (Speakers) again";
      try { await capturePickDevice(true); } catch (e) {}
      return;
    }
    if (window.captureRecording) {
      captureStopAndLoad();
    } else {
      captureStart();
    }
  });
}
try { wireCaptureRec(); } catch (e) { console.warn("wireCaptureRec", e); }
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    try { wireCaptureRec(); } catch (e) {}
  });
} else {
  try { wireCaptureRec(); } catch (e) {}
}


