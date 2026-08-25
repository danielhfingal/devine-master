/* module-qualitygate.js — QualityGate Phase 1+2+3
 * Phase 1: LUFS/TP/eligibility + crest/RMS + param snapshot + catalogue.qa
 * Phase 2: A vs B residual spectrum, LRA/crest delta, EQ/HPF direction integrity
 */
(function (global) {
  "use strict";

  var QG_VERSION = "qg-3";
  var _last = null;

  /** UI EQ (6) → feature band indices (9 @ 60..12k) */
  var EQ_TO_BANDS = [
    [0, 1],       // Sub
    [1, 2],       // Low
    [2, 3],       // Low-Mid
    [4, 5],       // Presence ~1–2k / 2–4k
    [5, 6],       // High-Mid
    [7, 8]        // Air
  ];
  var BAND_LABELS = ["60", "120", "250", "500", "1k", "2k", "4k", "8k", "12k"];
  var EQ_LABELS = ["Sub", "Low", "Low-Mid", "Presence", "High-Mid", "Air"];

  function num(v, fallback) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  function round(v, d) {
    if (v == null || !isFinite(v)) return null;
    var p = Math.pow(10, d == null ? 1 : d);
    return Math.round(v * p) / p;
  }


  var QG_STRICT_KEY = "devine_qg_strict_soft_v1";

  function detectClipClusters(buffer, opts) {
    opts = opts || {};
    var empty = { clusters: 0, maxRun: 0, nearClipSamples: 0, peakAbs: 0 };
    if (!buffer || !buffer.length) return empty;
    try {
      var thr = opts.threshold != null ? opts.threshold : 0.988; // ~ -0.1 dBFS
      var minRun = opts.minRun != null ? opts.minRun : 3;
      var chs = buffer.numberOfChannels;
      var len = buffer.length;
      var clusters = 0, maxRun = 0, near = 0, peakAbs = 0;
      for (var c = 0; c < chs; c++) {
        var d = buffer.getChannelData(c);
        var run = 0, inCluster = false;
        for (var i = 0; i < len; i++) {
          var a = Math.abs(d[i]);
          if (a > peakAbs) peakAbs = a;
          if (a >= thr) {
            near++;
            run++;
            if (run === minRun && !inCluster) {
              clusters++;
              inCluster = true;
            }
            if (run > maxRun) maxRun = run;
          } else {
            run = 0;
            inCluster = false;
          }
        }
      }
      return { clusters: clusters, maxRun: maxRun, nearClipSamples: near, peakAbs: peakAbs };
    } catch (e) {
      return empty;
    }
  }

  function isStrictSoft() {
    try {
      var stored = localStorage.getItem(QG_STRICT_KEY);
      if (stored === "1" || stored === "0") return stored === "1";
    } catch (e) {}
    try {
      var el = document.getElementById("qgStrictSoft");
      if (el) return !!el.checked;
    } catch (e2) {}
    return false;
  }

  function setStrictSoft(on) {
    try {
      localStorage.setItem(QG_STRICT_KEY, on ? "1" : "0");
    } catch (e) {}
    try {
      var el = document.getElementById("qgStrictSoft");
      if (el) el.checked = !!on;
    } catch (e2) {}
  }

  function qaVector(report) {
    if (!report) return null;
    var L = report.loudness || {};
    var D = report.dynamics || {};
    var S = report.spectrum || {};
    return {
      qa_version: report.qa_version,
      preset: report.preset,
      score: report.score,
      gate: report.gates && report.gates.overall,
      lufs: L.integrated,
      tp: L.tp,
      crest: D.crest,
      crest_delta: D.crest_delta_vs_a,
      lra: D.approx_lra,
      residual: S.residual_b_minus_a || null,
      clip_clusters: report.artifacts && report.artifacts.clipClusters,
      integrity_eq: report.integrity && report.integrity.eq
    };
  }

  function residualBands(outF, inF) {
    var ob = outF && outF.bandEnergyDb;
    var ib = inF && inF.bandEnergyDb;
    if (!ob || !ib || !ob.length || ob.length !== ib.length) return null;
    var r = [];
    for (var i = 0; i < ob.length; i++) {
      var a = num(ob[i], null);
      var b = num(ib[i], null);
      r.push(a != null && b != null ? a - b : null);
    }
    return r;
  }

  function meanOf(arr, idxs) {
    var s = 0, n = 0;
    for (var i = 0; i < idxs.length; i++) {
      var v = arr[idxs[i]];
      if (v != null && isFinite(v)) { s += v; n++; }
    }
    return n ? s / n : null;
  }

  /**
   * EQ direction integrity: UI gain vs residual in mapped bands.
   * Wide tolerance — flags contradictions, not taste.
   */
  function eqIntegrity(eqDb, residual) {
    var out = { overall: "ok", bands: [] };
    if (!eqDb || !residual) {
      out.overall = "n/a";
      return out;
    }
    var drifts = 0, checks = 0;
    for (let i = 0; i < 6; i++) {
      var g = num(eqDb[i], 0);
      var idxs = EQ_TO_BANDS[i] || [];
      var res = meanOf(residual, idxs);
      var status = "ok";
      if (res == null) {
        status = "n/a";
      } else if (g >= 1.5 && res < -0.75) {
        status = "drift"; // boost claimed, band fell
        drifts++;
        checks++;
      } else if (g <= -1.5 && res > 0.75) {
        status = "drift"; // cut claimed, band rose
        drifts++;
        checks++;
      } else if (Math.abs(g) >= 1.5) {
        checks++;
      }
      out.bands.push({
        name: EQ_LABELS[i],
        eqDb: round(g, 2),
        residualDb: round(res, 2),
        status: status
      });
    }
    if (checks === 0) out.overall = "ok";
    else if (drifts === 0) out.overall = "ok";
    else if (drifts <= 1) out.overall = "soft";
    else out.overall = "drift";
    return out;
  }

  function hpfIntegrity(hpfHz, residual, outBands, inBands) {
    if (hpfHz == null || !isFinite(hpfHz)) return "n/a";
    if (hpfHz < 35) return "ok"; // mild / off-ish
    // Expect lowest band residual ≤ small positive (energy should not rise a lot under HPF)
    if (residual && residual[0] != null) {
      if (residual[0] > 1.5) return "drift";
      if (residual[0] > 0.5) return "soft";
      return "ok";
    }
    if (outBands && inBands && outBands[0] != null && inBands[0] != null) {
      var d = outBands[0] - inBands[0];
      if (d > 1.5) return "drift";
      if (d > 0.5) return "soft";
      return "ok";
    }
    return "n/a";
  }

  function widthIntegrity(width, outCorr, inCorr) {
    if (width == null || !isFinite(width)) return "n/a";
    if (outCorr == null) return "n/a";
    // width < 1 → expect correlation up (more mono); width > 1 → correlation down
    if (inCorr == null) {
      if (width <= 0.85 && outCorr < 0.2) return "soft";
      if (width >= 1.2 && outCorr > 0.95) return "soft";
      return "ok";
    }
    var dCorr = outCorr - inCorr;
    if (width <= 0.85 && dCorr < -0.08) return "drift";
    if (width >= 1.15 && dCorr > 0.08) return "drift";
    return "ok";
  }

  function buildReport(args) {
    args = args || {};
    var loud = args.loud || {};
    var elig = args.elig || { ok: true, hard: [], soft: [], metrics: {} };
    var outF = args.outputFeatures || {};
    var inF = args.inputFeatures || null;
    var params = args.params || {};
    var metrics = elig.metrics || {};

    var lufs = num(loud.lufs != null ? loud.lufs : outF.lufs, null);
    var tp = num(loud.tp != null ? loud.tp : outF.truePeakDbtp, null);
    var targetLufs = num(args.targetLufs != null ? args.targetLufs : metrics.targetLufs, -10.1);
    var targetLabel = args.targetLabel || metrics.targetLabel || "preset";
    var crest = num(outF.crestDb != null ? outF.crestDb : metrics.crestOut, null);
    var crestIn = num(inF && inF.crestDb != null ? inF.crestDb : metrics.crestIn, null);
    var rmsDb = num(outF.rmsDb, null);
    var samplePeak = num(outF.samplePeakDbfs != null ? outF.samplePeakDbfs : metrics.samplePeak, null);
    var dcDb = num(outF.dcOffsetDb != null ? outF.dcOffsetDb : metrics.dcDb, null);
    var lraOut = num(outF.approxLraLu, null);
    var lraIn = num(inF && inF.approxLraLu, null);

    var residual = residualBands(outF, inF);
    var eqDb = params.eqDb || null;
    var eqInt = eqIntegrity(eqDb, residual);
    var hpfInt = hpfIntegrity(params.hpfHz, residual, outF.bandEnergyDb, inF && inF.bandEnergyDb);
    var widthInt = widthIntegrity(
      params.width,
      outF.stereoCorrelation,
      inF && inF.stereoCorrelation
    );

    var hard = (elig.hard || []).slice();
    var soft = (elig.soft || []).slice();

    // Phase 3 — clipping clusters (from rendered buffer or precomputed)
    var clips = args.clipClusters || null;
    if (!clips && args.buffer && typeof detectClipClusters === "function") {
      try { clips = detectClipClusters(args.buffer); } catch (e) { clips = null; }
    }
    clips = clips || { clusters: 0, maxRun: 0, nearClipSamples: 0, peakAbs: 0 };
    if (clips.clusters >= 3 || clips.maxRun >= 32) {
      hard.push(
        "Clipping clusters detected (" + clips.clusters + " runs, max " + clips.maxRun +
        " samples near 0 dBFS). Re-check limiter / makeup."
      );
    } else if (clips.clusters >= 1 || clips.maxRun >= 8) {
      soft.push(
        "Near-clip runs: " + clips.clusters + " cluster(s), longest " + clips.maxRun +
        " samples. Verify true-peak margin before release."
      );
    }

    if (crest != null && crest < 6.0) {
      if (!soft.some(function (s) { return /crest|limiting/i.test(s); })) {
        soft.push("Crest factor ≈ " + crest.toFixed(1) + " dB — dense limiting; A/B dynamics if unsure.");
      }
    }
    if (lufs != null && Math.abs(lufs - targetLufs) > 0.5 && Math.abs(lufs - targetLufs) <= 1.5) {
      soft.push(
        "Loudness " + lufs.toFixed(1) + " LUFS is " +
        Math.abs(lufs - targetLufs).toFixed(1) + " LU from " + targetLabel +
        " aim (" + targetLufs.toFixed(1) + ")."
      );
    }
    // Phase 2 soft: strong dynamics collapse vs A
    if (crest != null && crestIn != null && (crest - crestIn) < -3.5) {
      if (!soft.some(function (s) { return /dynamics reduction|crest factor down/i.test(s); })) {
        soft.push(
          "Crest vs source down " + Math.abs(crest - crestIn).toFixed(1) +
          " dB — master is much denser than A."
        );
      }
    }
    if (lraOut != null && lraIn != null && lraIn > 2 && (lraOut - lraIn) < -4) {
      soft.push(
        "Approx LRA collapsed vs source (" + lraIn.toFixed(1) + " → " + lraOut.toFixed(1) + " LU)."
      );
    }
    if (eqInt.overall === "drift") {
      soft.push("EQ integrity drift — one or more bands move opposite to the fader direction (see report).");
    } else if (eqInt.overall === "soft") {
      soft.push("EQ integrity soft drift on a single band — verify that fader vs residual.");
    }
    if (hpfInt === "drift") {
      soft.push("HPF integrity drift — low-band energy rose despite a raised high-pass.");
    }
    if (widthInt === "drift") {
      soft.push("Width integrity drift — stereo correlation moved opposite to the Width control.");
    }

    var hardPass = hard.length === 0;
    var softPass = soft.length === 0;
    var gate = hardPass ? (softPass ? "pass" : "warn") : "fail";

    var score = 100;
    if (!hardPass) score -= 35 + Math.min(25, hard.length * 10);
    score -= Math.min(25, soft.length * 6);
    if (lufs != null) {
      var err = Math.abs(lufs - targetLufs);
      if (err > 0.3) score -= err <= 0.5 ? 4 : err <= 1.0 ? 10 : err <= 1.5 ? 16 : 22;
    }
    if (tp != null) {
      if (tp > -0.5) score -= 20;
      else if (tp > -1.0) score -= 8;
      else if (tp <= -1.5) score += 2;
    }
    if (crest != null) {
      if (crest < 5) score -= 10;
      else if (crest < 6) score -= 5;
      else if (crest >= 8) score += 2;
    }
    if (eqInt.overall === "drift") score -= 8;
    else if (eqInt.overall === "soft") score -= 3;
    if (hpfInt === "drift") score -= 5;
    if (widthInt === "drift") score -= 4;
    score = Math.max(0, Math.min(100, Math.round(score)));

    var loudInt = (lufs != null && Math.abs(lufs - targetLufs) <= 0.5) ? "ok" :
      (lufs != null && Math.abs(lufs - targetLufs) <= 1.5) ? "drift" : "miss";
    var tpInt = (tp != null && tp <= -1.0) ? "ok" : (tp != null && tp <= -0.5) ? "soft" : "fail";

    var spectrum = null;
    if (residual) {
      spectrum = {
        bandFreqsHz: (outF.bandFreqsHz || inF && inF.bandFreqsHz || null),
        bands_a: inF && inF.bandEnergyDb ? inF.bandEnergyDb.map(function (v) { return round(v, 2); }) : null,
        bands_b: outF.bandEnergyDb ? outF.bandEnergyDb.map(function (v) { return round(v, 2); }) : null,
        residual_b_minus_a: residual.map(function (v) { return round(v, 2); }),
        labels: BAND_LABELS.slice()
      };
    }

    var report = {
      qa_version: QG_VERSION,
      measurement_spec: args.measurementSpec ||
        (typeof MEASUREMENT_SPEC_VERSION !== "undefined" ? MEASUREMENT_SPEC_VERSION : "bs1770-4+tp4x-v1"),
      preset: args.preset || params.preset || null,
      loudness: {
        integrated: round(lufs, 2),
        target: round(targetLufs, 2),
        targetLabel: targetLabel,
        tp: round(tp, 2),
        samplePeakDbfs: round(samplePeak, 2),
        rmsDb: round(rmsDb, 2)
      },
      dynamics: {
        crest: round(crest, 2),
        crest_in: round(crestIn, 2),
        crest_delta_vs_a: (crest != null && crestIn != null) ? round(crest - crestIn, 2) : null,
        approx_lra: round(lraOut, 2),
        approx_lra_in: round(lraIn, 2),
        approx_lra_delta: (lraOut != null && lraIn != null) ? round(lraOut - lraIn, 2) : null
      },
      spectrum: spectrum,
      artifacts: {
        dcDb: round(dcDb, 1),
        clipClusters: clips.clusters,
        clipMaxRun: clips.maxRun,
        nearClipSamples: clips.nearClipSamples,
        hard: hard.slice(),
        soft: soft.slice()
      },
      export_gate: {
        strict_soft: isStrictSoft(),
        allow_download: hardPass && (!isStrictSoft() || softPass)
      },
      vector: null,
      integrity: {
        loudness: loudInt,
        true_peak: tpInt,
        eq: eqInt.overall,
        eq_bands: eqInt.bands,
        hpf: hpfInt,
        width: widthInt,
        params_captured: !!(params && (params.eqDb || params.gainDb != null))
      },
      gates: {
        hard: hardPass ? "pass" : "fail",
        soft: softPass ? "pass" : "warn",
        overall: gate
      },
      score: score,
      params_snapshot: params,
      ts: new Date().toISOString()
    };

    report.vector = qaVector(report);
    _last = report;
    return report;
  }

  function gateClass(gate) {
    if (gate === "pass") return "ok";
    if (gate === "warn") return "warn";
    return "blocked";
  }

  function summaryLine(report) {
    if (!report) return "QA — run MASTER";
    var L = report.loudness || {};
    var g = (report.gates && report.gates.overall) || "fail";
    var tag = g === "pass" ? "PASS" : (g === "warn" ? "WARN" : "FAIL");
    var bits = [tag];
    if (L.integrated != null) bits.push(L.integrated.toFixed(1) + " LUFS");
    if (L.tp != null) bits.push(L.tp.toFixed(1) + " dBTP");
    if (report.integrity && report.integrity.eq && report.integrity.eq !== "ok" && report.integrity.eq !== "n/a") {
      bits.push("EQ " + report.integrity.eq);
    }
    if (report.score != null) bits.push("score " + report.score);
    return bits.join(" · ");
  }

  function updateBadge(report) {
    var el = document.getElementById("qgBadge");
    if (!el) return;
    if (!report) {
      el.textContent = "";
      el.className = "qg-badge";
      el.removeAttribute("data-gate");
      return;
    }
    var gate = (report.gates && report.gates.overall) || "fail";
    el.textContent = summaryLine(report);
    el.className = "qg-badge show " + gateClass(gate);
    el.setAttribute("data-gate", gate);
    el.title = "QualityGate — click for report";
  }

  function reportHtml(report) {
    if (!report) {
      return "<p>No QA report yet. Run <strong>MASTER</strong> to evaluate this render.</p>";
    }
    var L = report.loudness || {};
    var D = report.dynamics || {};
    var G = report.gates || {};
    var I = report.integrity || {};
    var S = report.spectrum || null;
    var hard = (report.artifacts && report.artifacts.hard) || [];
    var soft = (report.artifacts && report.artifacts.soft) || [];
    function row(k, v) {
      return "<div class=\"qg-row\"><span class=\"qg-k\">" + k + "</span><span class=\"qg-v\">" +
        (v == null || v === "" ? "—" : v) + "</span></div>";
    }
    var html = "";
    html += "<div class=\"qg-gate qg-gate-" + (G.overall || "fail") + "\">" +
      String(G.overall || "fail").toUpperCase() +
      " · score " + (report.score != null ? report.score : "—") +
      " · " + (report.qa_version || "") + "</div>";
    html += row("Integrated LUFS", L.integrated != null ? L.integrated.toFixed(2) + " (aim " + (L.target != null ? L.target.toFixed(1) : "—") + " · " + (L.targetLabel || "") + ")" : null);
    html += row("True Peak", L.tp != null ? L.tp.toFixed(2) + " dBTP" : null);
    html += row("Sample peak", L.samplePeakDbfs != null ? L.samplePeakDbfs.toFixed(2) + " dBFS" : null);
    html += row("RMS", L.rmsDb != null ? L.rmsDb.toFixed(1) + " dBFS" : null);
    html += row("Crest", D.crest != null ? D.crest.toFixed(1) + " dB" + (D.crest_delta_vs_a != null ? " (ΔA " + D.crest_delta_vs_a.toFixed(1) + ")" : "") : null);
    html += row("Approx LRA", D.approx_lra != null ? D.approx_lra.toFixed(1) + " LU" + (D.approx_lra_delta != null ? " (ΔA " + D.approx_lra_delta.toFixed(1) + ")" : "") : null);
    html += row("Integrity loudness", I.loudness);
    html += row("Integrity true peak", I.true_peak);
    html += row("Integrity EQ", I.eq);
    html += row("Integrity HPF", I.hpf);
    html += row("Integrity width", I.width);
    html += row("Spec", report.measurement_spec);
    html += row("Clip clusters", (report.artifacts && report.artifacts.clipClusters != null)
      ? (report.artifacts.clipClusters + " (max run " + report.artifacts.clipMaxRun + ")")
      : null);
    if (report.export_gate) {
      html += row("Strict soft gate", report.export_gate.strict_soft
        ? (report.export_gate.allow_download ? "ON · download allowed" : "ON · download held")
        : "OFF");
    }

    if (I.eq_bands && I.eq_bands.length) {
      html += "<div class=\"qg-sec\">EQ vs residual (B−A)</div>";
      I.eq_bands.forEach(function (b) {
        html += row(
          b.name,
          (b.eqDb != null ? (b.eqDb >= 0 ? "+" : "") + b.eqDb.toFixed(1) + " dB" : "—") +
          " → res " + (b.residualDb != null ? (b.residualDb >= 0 ? "+" : "") + b.residualDb.toFixed(1) + " dB" : "—") +
          " · " + b.status
        );
      });
    }

    if (S && S.residual_b_minus_a) {
      html += "<div class=\"qg-sec\">Spectrum residual B−A (dB)</div>";
      var labels = S.labels || BAND_LABELS;
      var line = [];
      for (var i = 0; i < S.residual_b_minus_a.length; i++) {
        var rv = S.residual_b_minus_a[i];
        line.push((labels[i] || i) + ":" + (rv == null ? "—" : (rv >= 0 ? "+" : "") + rv.toFixed(1)));
      }
      html += "<div class=\"qg-spec-line\">" + line.join(" · ") + "</div>";
    }

    if (hard.length) {
      html += "<div class=\"qg-sec\">Hard</div><ul class=\"qg-list\">";
      hard.forEach(function (h) { html += "<li>" + h + "</li>"; });
      html += "</ul>";
    }
    if (soft.length) {
      html += "<div class=\"qg-sec\">Soft</div><ul class=\"qg-list\">";
      soft.forEach(function (s) { html += "<li>" + s + "</li>"; });
      html += "</ul>";
    }
    if (!hard.length && !soft.length) {
      html += "<p class=\"qg-ok\">No hard or soft findings. Export path looks clean for this preset.</p>";
    }
    return html;
  }

  function showPanel(report) {
    var panel = document.getElementById("qgPanel");
    var body = document.getElementById("qgPanelBody");
    var title = document.getElementById("qgPanelTitle");
    if (!panel || !body) return;
    if (title) title.textContent = "QualityGate";
    body.innerHTML = reportHtml(report || _last);
    panel.classList.add("show");
    panel.setAttribute("aria-hidden", "false");
  }

  function hidePanel() {
    var panel = document.getElementById("qgPanel");
    if (!panel) return;
    panel.classList.remove("show");
    panel.setAttribute("aria-hidden", "true");
  }

  function run(args) {
    var report = buildReport(args);
    updateBadge(report);
    try { global.__qgLastReport = report; } catch (e) {}
    return report;
  }

  function bootUi() {
    var strict = document.getElementById("qgStrictSoft");
    if (strict && !strict._qgBound) {
      strict._qgBound = true;
      try {
        strict.checked = localStorage.getItem(QG_STRICT_KEY) === "1";
      } catch (e) {}
      strict.addEventListener("change", function () {
        setStrictSoft(!!strict.checked);
        // Re-evaluate export permission on last report
        if (_last) {
          _last.export_gate = {
            strict_soft: !!strict.checked,
            allow_download: (_last.gates && _last.gates.hard === "pass") &&
              (!strict.checked || (_last.gates && _last.gates.soft === "pass"))
          };
          updateBadge(_last);
        }
      });
    }
    var badge = document.getElementById("qgBadge");
    if (badge && !badge._qgBound) {
      badge._qgBound = true;
      badge.addEventListener("click", function () { showPanel(_last); });
      badge.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          showPanel(_last);
        }
      });
    }
    var close = document.getElementById("qgPanelClose");
    if (close && !close._qgBound) {
      close._qgBound = true;
      close.addEventListener("click", hidePanel);
    }
    var panel = document.getElementById("qgPanel");
    if (panel && !panel._qgBound) {
      panel._qgBound = true;
      panel.addEventListener("click", function (ev) {
        if (ev.target === panel) hidePanel();
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        var p = document.getElementById("qgPanel");
        if (p && p.classList.contains("show")) hidePanel();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootUi);
  } else {
    setTimeout(bootUi, 0);
  }
  setTimeout(bootUi, 300);

  global.__qg = {
    version: QG_VERSION,
    run: run,
    buildReport: buildReport,
    lastReport: function () { return _last; },
    updateBadge: updateBadge,
    showPanel: showPanel,
    hidePanel: hidePanel,
    summaryLine: summaryLine,
    detectClipClusters: detectClipClusters,
    isStrictSoft: isStrictSoft,
    setStrictSoft: setStrictSoft,
    qaVector: qaVector,
    allowsDownload: function (report) {
      var r = report || _last;
      if (!r) return false;
      if (r.export_gate) return !!r.export_gate.allow_download;
      return !!(r.gates && r.gates.hard === "pass");
    }
  };
})(typeof window !== "undefined" ? window : this);
