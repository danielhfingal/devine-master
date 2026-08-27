/* module-ab-sync.js — Synced A/B shadow after MASTER
 * Policy: one transport clock. Audible side = monitor (A or B).
 * The other side shadows muted at the same time for live compare.
 * Load AFTER 00-core.js (and after audioA / audioB exist in DOM).
 */
(function abSyncModule() {
  "use strict";

  if (window.__abSyncWired) return;
  window.__abSyncWired = true;

  var SHADOW_VOL = 0;
  var SNAP_MS = 80;
  var _lastSnap = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function hasA() {
    try {
      if (typeof decodedBuffer !== "undefined" && decodedBuffer) return true;
      var a = $("audioA");
      return !!(a && a.src);
    } catch (e) {
      return false;
    }
  }

  function hasB() {
    var b = $("audioB");
    return !!(b && b.src);
  }

  function pairReady() {
    return hasA() && hasB();
  }

  function modeIsB() {
    try {
      if (typeof mode !== "undefined") return mode === "B";
    } catch (e) {}
    var t = $("tabB");
    return !!(t && t.classList.contains("on"));
  }

  function getClockSec() {
    try {
      if (modeIsB()) {
        var b = $("audioB");
        if (b && isFinite(b.currentTime)) return b.currentTime;
      }
      if (typeof live !== "undefined" && live && live.playing && typeof livePosition === "function") {
        return livePosition();
      }
      if (typeof live !== "undefined" && live && isFinite(live.offset)) return live.offset;
      var a = $("audioA");
      if (a && isFinite(a.currentTime)) return a.currentTime;
    } catch (e) {}
    return 0;
  }

  function clampToMedia(el, sec) {
    if (!el) return 0;
    var d = el.duration;
    if (!(d > 0) || !isFinite(d)) return Math.max(0, sec);
    return Math.max(0, Math.min(sec, Math.max(0, d - 0.05)));
  }

  function seekPair(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var a = $("audioA");
    var b = $("audioB");
    try {
      if (b && b.src) {
        var tb = clampToMedia(b, sec);
        if (Math.abs((b.currentTime || 0) - tb) > 0.03) b.currentTime = tb;
      }
    } catch (e) {}
    try {
      if (a && a.src) {
        var ta = clampToMedia(a, sec);
        if (Math.abs((a.currentTime || 0) - ta) > 0.03) a.currentTime = ta;
      }
    } catch (e) {}
    try {
      if (typeof live !== "undefined" && live) live.offset = sec;
    } catch (e) {}
  }

  function setShadowGains() {
    var a = $("audioA");
    var b = $("audioB");
    var listenB = modeIsB();
    try {
      if (b) b.volume = listenB ? 1 : SHADOW_VOL;
      if (a) a.volume = listenB ? SHADOW_VOL : 1;
    } catch (e) {}
  }

  function ensureShadowPlaying(wantPlay) {
    if (!pairReady() || !wantPlay) return;
    var a = $("audioA");
    var b = $("audioB");
    seekPair(getClockSec());
    setShadowGains();
    try {
      if (modeIsB()) {
        if (a && a.src && a.paused) a.play().catch(function () {});
      } else {
        if (b && b.src && b.paused) b.play().catch(function () {});
      }
    } catch (e) {
      console.warn("abSync shadow play", e);
    }
  }

  function pauseShadow() {
    var a = $("audioA");
    var b = $("audioB");
    try {
      if (modeIsB()) {
        if (a && !a.paused) a.pause();
      } else {
        if (b && !b.paused) b.pause();
      }
    } catch (e) {}
  }

  var _switchMonitor = typeof switchMonitor === "function" ? switchMonitor : null;
  if (_switchMonitor) {
    window.switchMonitor = function abSyncSwitchMonitor(toMode) {
      var sec = getClockSec();
      var keep = !!window.__wantPlay;
      _switchMonitor(toMode);
      if (!pairReady()) return;
      seekPair(sec);
      setShadowGains();
      if (keep) {
        ensureShadowPlaying(true);
        try {
          if (modeIsB()) {
            var b = $("audioB");
            if (b && b.src) b.play().catch(function () {});
          }
        } catch (e) {}
      } else {
        pauseShadow();
      }
      try {
        var st = $("status");
        if (st && pairReady()) {
          var base = st.textContent || "";
          if (base.indexOf("SYNC") < 0) st.textContent = base + " · SYNC A↔B";
        }
      } catch (e) {}
    };
    try {
      switchMonitor = window.switchMonitor;
    } catch (e) {}
  }

  function wirePlay() {
    var btn = $("btnPlay");
    if (!btn || btn.__abSyncPlay) return;
    btn.__abSyncPlay = true;
    var prev = btn.onclick;
    btn.onclick = async function (ev) {
      if (typeof prev === "function") {
        try {
          await prev.call(btn, ev);
        } catch (e) {
          console.warn(e);
        }
      }
      try {
        if (window.__wantPlay && pairReady()) ensureShadowPlaying(true);
        else if (!window.__wantPlay) pauseShadow();
      } catch (e) {
        console.warn("abSync after play", e);
      }
    };
  }

  function snapTick() {
    if (!pairReady() || !window.__wantPlay) return;
    var now = performance.now();
    if (now - _lastSnap < SNAP_MS) return;
    _lastSnap = now;
    var a = $("audioA");
    var b = $("audioB");
    var sec = getClockSec();
    try {
      if (modeIsB()) {
        if (a && a.src && !a.paused) {
          var ta = clampToMedia(a, sec);
          if (Math.abs((a.currentTime || 0) - ta) > 0.08) a.currentTime = ta;
        }
      } else if (b && b.src && !b.paused) {
        var tb = clampToMedia(b, sec);
        if (Math.abs((b.currentTime || 0) - tb) > 0.08) b.currentTime = tb;
      }
      setShadowGains();
    } catch (e) {}
  }

  setInterval(snapTick, SNAP_MS);

  function boot() {
    wirePlay();
    document.addEventListener(
      "mouseup",
      function () {
        if (!pairReady()) return;
        setTimeout(function () {
          seekPair(getClockSec());
        }, 0);
      },
      true
    );
    ["tabA", "tabB"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener(
        "click",
        function () {
          if (pairReady() && window.__wantPlay) {
            setTimeout(function () {
              ensureShadowPlaying(true);
            }, 30);
          }
        },
        true
      );
    });
    console.log("[DEVINE ab-sync] wired — A/B shadow after master when both loaded");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    setTimeout(boot, 0);
  }

  window.abSyncSeekPair = seekPair;
  window.abSyncEnsureShadow = ensureShadowPlaying;
  window.abSyncPairReady = pairReady;
})();
