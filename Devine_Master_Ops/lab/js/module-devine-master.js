/* module-devine-master.js — Module 1: DEVINE MASTER
 * Cold gravity, presets, sliders, MASTER DSP, catalogue, eligibility, WAV.
 * Requires 00-core.js ($ , ensureCtx, decodedBuffer, fileName, live).
 */
function getColdGravityParams() {
  return COLD_GRAVITY[coldGravity] || COLD_GRAVITY.baseline;
}

function setColdGravity(id) {
  if (!COLD_GRAVITY[id]) return;
  coldGravity = id;
  document.querySelectorAll(".cold-gravity .cg-btn").forEach(btn => {
    btn.classList.toggle("on", btn.getAttribute("data-g") === id);
  });
  const g = getColdGravityParams();
  if ($("status")) {
    $("status").textContent = "Cold gravity: " + g.label +
      " (scale " + g.scale.devine + " / clamp ±" + g.clampDb + " dB)";
  }
}

function coldTonalEqOffsets(inputFeatures, presetName) {
  const zeros = [0, 0, 0, 0, 0, 0];
  if (!inputFeatures || !inputFeatures.bandEnergyDb || inputFeatures.bandEnergyDb.length < 9) {
    return { offsetsDb: zeros, detail: { active: false, reason: "no_band_profile" } };
  }
  const ib = inputFeatures.bandEnergyDb;
  const mean = ib.reduce((a, b) => a + b, 0) / ib.length;
  const rel = ib.map(b => b - mean);
  const key = presetName === "spotify" ? "spotifyRelBandDb" :
              presetName === "match" ? "matchRelBandDb" : "devineRelBandDb";
  const tgt = CATALOGUE_TONAL_PRIOR[key];
  const grav = getColdGravityParams();
  const scale = (grav.scale[presetName] != null) ? grav.scale[presetName] : 0.35;
  const clampDb = grav.clampDb;
  const d = [];
  for (let i = 0; i < 9; i++) d.push(tgt[i] - rel[i]);
  const raw6 = [
    (d[0] + d[1]) / 2,
    (d[1] + d[2]) / 2,
    (d[2] + d[3]) / 2,
    (d[4] + d[5]) / 2,
    d[6],
    (d[7] + d[8]) / 2
  ];
  const offsetsDb = raw6.map(x => {
    let v = x * scale;
    if (v > clampDb) v = clampDb;
    if (v < -clampDb) v = -clampDb;
    return Math.round(v * 100) / 100;
  });
  return {
    offsetsDb: offsetsDb,
    detail: {
      active: true,
      preset: presetName,
      scale: scale,
      clampDb: clampDb,
      offsetsDb: offsetsDb,
      gravity: grav.id,
      gravityLabel: grav.label
    }
  };
}

function coldDynamicsAdjust(inputFeatures, baseRatio) {
  if (!inputFeatures || inputFeatures.crestDb == null) {
    return { ratio: baseRatio, eased: false };
  }
  const c = inputFeatures.crestDb;
  if (c < 8) return { ratio: Math.max(1.4, baseRatio * 0.75), eased: true, crestDb: c };
  if (c < 10) return { ratio: Math.max(1.6, baseRatio * 0.88), eased: true, crestDb: c };
  return { ratio: baseRatio, eased: false, crestDb: c };
}



let preset = "devine";
let arrayBuffer = null;
// decodedBuffer shared from 00-core
let fileName = "track";
let audioCtx = null;
// mode: shared global from 00-core.js (A = dry/live, B = offline master)
let solos = [false,false,false,false,false,false];
const toggles = {
  trans:false, mono:true, lim:true, decl:true,
  eq:true, comp:true, presetOut:true, dither:true, provenance:true
};
const EQ_FREQS = [40, 120, 400, 3500, 6000, 12000];
const SR_VALUES = [32000, 44100, 48000];

/* —— Live graph (hear changes before MASTER) —— */
live = window.live = {
  playing: false,
  source: null,
  analyser: null,
  dataL: null,
  dataR: null,
  drive: null,
  width: 1,
  ms: null,
  hpf: null,
  bands: [],
  lpf: null,
  comp: null,
  gain: null,
  startedAt: 0,
  offset: 0
};

/* —— Presets (full UI recall) —— */
const PRESETS = {
  devine: {
    gain: 0, sr: 1, hpf: 30, lpf: 18, vol: 0, width: 1.0, drive: 0.08,
    toggles: {
      trans:false, mono:true, lim:true, decl:true,
      eq:true, comp:true, presetOut:true, dither:true, provenance:true
    },
    // Mild catalogue tilt — avoid mud stacking
    eq: [0.8, 0.5, -0.5, 1.0, 0.3, 0.6]
  },
  spotify: {
    gain: 0, sr: 1, hpf: 25, lpf: 18, vol: 0, width: 1.0, drive: 0.03,
    toggles: {
      trans:false, mono:true, lim:true, decl:true,
      eq:true, comp:true, presetOut:true, dither:true, provenance:true
    },
    eq: [0.3, 0.0, -0.3, 0.4, 0.0, 0.3]
  },
  match: {
    gain: 0, sr: 1, hpf: 28, lpf: 17.5, vol: 0, width: 0.95, drive: 0.10,
    toggles: {
      trans:false, mono:true, lim:true, decl:true,
      eq:true, comp:true, presetOut:true, dither:true, provenance:true
    },
    // Profile-inspired but restrained
    eq: [1.2, 0.8, -0.8, 0.8, 0.2, 0.4]
  }
};

function setToggle(key, on) {
  try {
    toggles[key] = !!on;
    document.querySelectorAll('.tog[data-k="'+key+'"]').forEach(el => {
      el.classList.toggle("on", !!on);
    });
  } catch (e) { console.warn("setToggle", e); }
}

function syncSr() {
  const v = +$("sr").value;
  [0,1,2].forEach(i => {
    const el = $("sr"+i);
    if (el) el.classList.toggle("on", i === v);
  });
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  preset = name;
  $("pDevine").classList.toggle("on", name === "devine");
  $("pSpotify").classList.toggle("on", name === "spotify");
  if ($("pMatch")) $("pMatch").classList.toggle("on", name === "match");

  $("gain").value = p.gain;
  $("gainV").textContent = (+p.gain).toFixed(1) + " dB";
  $("sr").value = p.sr; syncSr();
  $("hpf").value = p.hpf; $("hpfV").textContent = p.hpf;
  $("lpf").value = p.lpf; $("lpfV").textContent = p.lpf;
  if ($("vol")) $("vol").value = p.vol;
  if ($("width") && p.width != null) {
    $("width").value = p.width;
    $("widthV").textContent = (+p.width).toFixed(2);
  }
  if ($("drive") && p.drive != null) {
    $("drive").value = p.drive;
    $("driveV").textContent = (+p.drive).toFixed(2);
  }

  Object.keys(p.toggles).forEach(k => setToggle(k, p.toggles[k]));

  for (let i = 0; i < 6; i++) {
    const el = $("eq"+i);
    if (el) el.value = p.eq[i];
  }
  solos = [false,false,false,false,false,false];
  document.querySelectorAll(".solo").forEach(b => b.classList.remove("on"));

  applyLiveParams();
  const labels = { devine: "D.Devine", spotify: "Spotify", match: "Match Ⓟ catalogue" };
  $("status").textContent = (labels[name] || name) + " loaded — controls set to optimal";
}

$("pDevine").onclick = () => applyPreset("devine");
$("pSpotify").onclick = () => applyPreset("spotify");
if ($("pMatch")) $("pMatch").onclick = () => applyPreset("match");
try { applyPreset("devine"); } catch (e) { console.warn(e); }
if ($("status")) {
  $("status").textContent = "DEVINE MASTER " + (typeof APP_BUILD !== "undefined" ? APP_BUILD : "v20260819n") + " — drop or click to load audio";
}

/* —— Slider live binding —— */
$("gain").oninput = () => {
  $("gainV").textContent = (+$("gain").value).toFixed(1) + " dB";
  applyLiveParams();
};
$("hpf").oninput = () => { $("hpfV").textContent = $("hpf").value; applyLiveParams(); };
$("lpf").oninput = () => { $("lpfV").textContent = $("lpf").value; applyLiveParams(); };
$("sr").oninput = syncSr;
if ($("vol")) {
  $("vol").oninput = () => {
    applyLiveParams();
    if ($("status") && live.playing) $("status").textContent = "Vol " + (+$("vol").value).toFixed(1) + " dB (live A)";
    if ($("status") && mode === "B") $("status").textContent = "Vol " + (+$("vol").value).toFixed(1) + " dB (master B)";
  };
}
if ($("width")) $("width").oninput = () => {
  $("widthV").textContent = (+$("width").value).toFixed(2);
  applyLiveParams();
};
if ($("drive")) $("drive").oninput = () => {
  $("driveV").textContent = (+$("drive").value).toFixed(2);
  applyLiveParams();
};

for (let i = 0; i < 6; i++) {
  const el = $("eq"+i);
  if (el) {
    el.oninput = () => {
      if (!live.hpf && decodedBuffer) buildLiveGraph();
      applyLiveParams();
    };
  }
}

document.querySelectorAll(".tog").forEach(el => {
  el.onclick = () => {
    const k = el.dataset.k;
    if (!k) return;
    toggles[k] = !toggles[k];
    el.classList.toggle("on", toggles[k]);
    applyLiveParams();
  };
});

document.querySelectorAll(".solo").forEach(btn => {
  btn.onclick = () => {
    const i = +btn.dataset.i;
    solos[i] = !solos[i];
    btn.classList.toggle("on", solos[i]);
    applyLiveParams();
  };
});

if ($("eqReset")) {
  $("eqReset").onclick = () => {
    for (let i = 0; i < 6; i++) {
      const el = $("eq"+i);
      if (el) el.value = 0;
    }
    solos = [false,false,false,false,false,false];
    document.querySelectorAll(".solo").forEach(b => b.classList.remove("on"));
    applyLiveParams();
    $("status").textContent = "EQ reset to flat";
  };
}

/* ============================================================================
 * FROZEN METERING — keep in sync with:
 *   00_Project_Overview/Mastering/certification/measure_bs1770.js
 * Re-run after any change:  npm run certify
 * Last automated suite: PASS · NOT formal ITU laboratory certification
 * --------------------------------------------------------------------------
 * measureBS1770(buffer) -> { integratedLUFS, truePeakdBTP, lufs, tp }
 *   BS.1770-4-style K-weighting + gating · True Peak 4× cubic oversampling
 * applyLookaheadLimiter(buffer, ceilingDb=-1.0, lookaheadMs=5)
 *   Look-ahead brickwall, TP-aware detection, instant attack / smooth release
 * ============================================================================ */

function _bqProcess(x, s, b0, b1, b2, a1, a2) {
  const y = b0 * x + b1 * s.x1 + b2 * s.x2 - a1 * s.y1 - a2 * s.y2;
  s.x2 = s.x1; s.x1 = x;
  s.y2 = s.y1; s.y1 = y;
  return y;
}

function _kWeightCoeffs(sr) {
  // BS.1770 K-weighting stage 1: high-shelf pre-filter
  const pre = (function () {
    const f0 = 1681.9744509555319;
    const G = 3.99984385397;
    const Q = 0.7071752369554193;
    const K = Math.tan(Math.PI * f0 / sr);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.49948172738771283);
    const a0 = 1 + K / Q + K * K;
    return {
      b0: (Vh + Vb * K / Q + K * K) / a0,
      b1: 2 * (K * K - Vh) / a0,
      b2: (Vh - Vb * K / Q + K * K) / a0,
      a1: 2 * (K * K - 1) / a0,
      a2: (1 - K / Q + K * K) / a0
    };
  })();
  // Stage 2: highpass (RLB)
  const rlb = (function () {
    const f0 = 38.11012748694563;
    const Q = 0.5003270373253953;
    const K = Math.tan(Math.PI * f0 / sr);
    const a0 = 1 + K / Q + K * K;
    return {
      b0: 1 / a0,
      b1: -2 / a0,
      b2: 1 / a0,
      a1: 2 * (K * K - 1) / a0,
      a2: (1 - K / Q + K * K) / a0
    };
  })();
  return { pre, rlb };
}

/** Catmull-Rom / cubic interp between samples for ISP estimation */
function _cubicInterp(y0, y1, y2, y3, t) {
  const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const a2 = -0.5 * y0 + 0.5 * y2;
  const a3 = y1;
  return ((a0 * t + a1) * t + a2) * t + a3;
}

/**
 * True Peak (dBTP) with 4× cubic oversampling between sample points.
 * Better ISP capture than linear; still not a full ITU filter bank.
 */
function measureTruePeakDBTP(buffer, overs) {
  overs = overs || 4;
  const chs = buffer.numberOfChannels;
  const len = buffer.length;
  let peak = 0;
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
    // Cubic ISP between successive samples
    for (let i = 0; i < len - 1; i++) {
      const y0 = i > 0 ? d[i - 1] : d[i];
      const y1 = d[i];
      const y2 = d[i + 1];
      const y3 = i + 2 < len ? d[i + 2] : d[i + 1];
      // Only densify near hot samples (speed)
      if (Math.abs(y1) < peak * 0.25 && Math.abs(y2) < peak * 0.25) continue;
      for (let k = 1; k < overs; k++) {
        const v = Math.abs(_cubicInterp(y0, y1, y2, y3, k / overs));
        if (v > peak) peak = v;
      }
    }
  }
  if (peak < 1e-12) return -120;
  return 20 * Math.log10(peak);
}

function measureBS1770(buffer) {
  const sr = buffer.sampleRate || 44100;
  const chs = buffer.numberOfChannels;
  let len = buffer.length;
  const data = [];
  for (let c = 0; c < chs; c++) data.push(buffer.getChannelData(c));

  // UI-safe: analyse max ~60s from centre on long files (gating still valid on window)
  let off0 = 0;
  const maxN = Math.round(sr * 60);
  if (len > maxN) {
    off0 = Math.floor((len - maxN) / 2);
    len = maxN;
  }

  const { pre, rlb } = _kWeightCoeffs(sr);
  const filtered = [];
  for (let c = 0; c < chs; c++) {
    const sp = { x1: 0, x2: 0, y1: 0, y2: 0 };
    const srS = { x1: 0, x2: 0, y1: 0, y2: 0 };
    const out = new Float32Array(len);
    const d = data[c];
    for (let i = 0; i < len; i++) {
      let x = d[off0 + i];
      x = _bqProcess(x, sp, pre.b0, pre.b1, pre.b2, pre.a1, pre.a2);
      x = _bqProcess(x, srS, rlb.b0, rlb.b1, rlb.b2, rlb.a1, rlb.a2);
      out[i] = x;
    }
    filtered.push(out);
  }

  const blockSize = Math.max(1, Math.round(sr * 0.4));
  const hop = Math.max(1, Math.round(blockSize * 0.25));
  const blocks = [];

  for (let start = 0; start + blockSize <= len; start += hop) {
    let msSum = 0;
    for (let c = 0; c < chs; c++) {
      let acc = 0;
      const d = filtered[c];
      for (let i = 0; i < blockSize; i++) {
        const x = d[start + i];
        acc += x * x;
      }
      // BS.1770-4: left/right weight 1.0 (no LFE / surrounds here)
      msSum += acc / blockSize;
    }
    const lufsBlock = -0.691 + 10 * Math.log10(msSum + 1e-12);
    blocks.push({ ms: msSum, lufs: lufsBlock });
  }

  let integrated;
  if (!blocks.length) {
    let msSum = 0;
    for (let c = 0; c < chs; c++) {
      let acc = 0;
      const d = filtered[c];
      for (let i = 0; i < len; i++) acc += d[i] * d[i];
      msSum += acc / Math.max(1, len);
    }
    integrated = -0.691 + 10 * Math.log10(msSum + 1e-12);
  } else {
    let absBlocks = blocks.filter(b => b.lufs > -70);
    if (!absBlocks.length) absBlocks = blocks.slice();
    let meanMs = absBlocks.reduce((s, b) => s + b.ms, 0) / absBlocks.length;
    const absLufs = -0.691 + 10 * Math.log10(meanMs + 1e-12);
    const relThresh = absLufs - 10;
    let relBlocks = absBlocks.filter(b => b.lufs > relThresh);
    if (!relBlocks.length) relBlocks = absBlocks;
    meanMs = relBlocks.reduce((s, b) => s + b.ms, 0) / relBlocks.length;
    integrated = -0.691 + 10 * Math.log10(meanMs + 1e-12);
  }

  const tp = measureTruePeakDBTP(buffer, (typeof AUTHORITATIVE_TP_OVERS!=="undefined"?AUTHORITATIVE_TP_OVERS:4));
  return {
    integratedLUFS: integrated,
    truePeakdBTP: tp,
    lufs: integrated,
    tp: tp,
    method: "BS.1770-4-style+cubicTP4x"
  };
}

// Back-compat alias used across the app
function measureLoudness(buffer) {
  return measureBS1770(buffer);
}

/**
 * Max abs peak in [i .. i+lookaheadSamples] across channels, including
 * cubic inter-sample peaks between consecutive samples in that window.
 */
function _windowTruePeakLin(channels, i, la, overs) {
  const nCh = channels.length;
  const len = channels[0].length;
  let peak = 0;
  const end = Math.min(len - 1, i + la);
  for (let c = 0; c < nCh; c++) {
    const d = channels[c];
    for (let j = i; j <= end; j++) {
      const v = Math.abs(d[j]);
      if (v > peak) peak = v;
      if (j < len - 1) {
        const y0 = j > 0 ? d[j - 1] : d[j];
        const y1 = d[j];
        const y2 = d[j + 1];
        const y3 = j + 2 < len ? d[j + 2] : d[j + 1];
        for (let k = 1; k < overs; k++) {
          const t = k / overs;
          const y = Math.abs(_cubicInterp(y0, y1, y2, y3, t));
          if (y > peak) peak = y;
        }
      }
    }
  }
  return peak;
}

/**
 * Look-ahead brickwall limiter (offline, in-place).
 * @param {AudioBuffer} buffer
 * @param {number} ceilingDb  default -1.0 dBTP
 * @param {number} lookaheadMs default 5 ms
 * @param {number} releaseMs   default 80 ms (smooth recovery)
 */
/**
 * Look-ahead brickwall limiter (offline, in-place) — refined
 * --------------------------------------------------------------------------
 * Signature (backward compatible):
 *   applyLookaheadLimiter(buffer, ceilingDb=-1.0, lookaheadMs=5, releaseMs=120, opts?)
 *   opts = { kneeDb: 2.5, oversample: 1|2, detectOvers: 4 }
 *
 * Improvements vs v1:
 *   1) Soft-knee: gradual GR as peak approaches ceiling (less "grabby")
 *   2) dB-domain release with dual time-constant (fast then slow) → less pumping
 *   3) Optional 2× audio-path oversampling (limit at 2× SR, downsample)
 * Detection still uses 4× cubic ISP inside the look-ahead window.
 */

/**
 * Look-ahead brickwall limiter (offline) — corrected gain/window alignment.
 * 1) Per-sample cubic ISP estimate
 * 2) Look-ahead max (rolling) on ISP
 * 3) Instant attack / dual-TC release on gain reduction
 * 4) Apply GR to the SAME sample index the window was computed for (offline)
 * 5) Mandatory final TP make-up: scale + sample clamp to ceiling
 */
function applyLookaheadLimiter(buffer, ceilingDb, lookaheadMs, releaseMs, opts) {
  if (ceilingDb == null) ceilingDb = -1.0;
  if (lookaheadMs == null) lookaheadMs = 5;
  if (releaseMs == null) releaseMs = 80;
  opts = opts || {};
  const kneeDb = opts.kneeDb != null ? opts.kneeDb : 1.0; // tight knee for ceiling hold
  const detectOvers = opts.detectOvers != null ? opts.detectOvers : 4;

  _limitCoreCorrect(buffer, ceilingDb, lookaheadMs, releaseMs, kneeDb, detectOvers);
  // Absolute safety: never ship over ceiling after envelope smoothing / ISP residual
  applyTruePeakCeiling(buffer, ceilingDb);
  return buffer;
}

function _softKneeNeed(peak, ceiling, kneeDb) {
  if (peak < 1e-12) return 1;
  if (kneeDb <= 0) return peak > ceiling ? ceiling / peak : 1;
  const ceilDb = 20 * Math.log10(ceiling);
  const peakDb = 20 * Math.log10(peak);
  const kneeStartDb = ceilDb - kneeDb;
  if (peakDb <= kneeStartDb) return 1;
  if (peakDb >= ceilDb) return ceiling / peak;
  const t = (peakDb - kneeStartDb) / Math.max(1e-9, kneeDb);
  const eased = t * t * (3 - 2 * t); // smoothstep — reaches full GR at ceiling
  const fullNeed = ceiling / peak;
  return 1 + (fullNeed - 1) * eased;
}

function _limitCoreCorrect(buffer, ceilingDb, lookaheadMs, releaseMs, kneeDb, detectOvers) {
  const sr = buffer.sampleRate || 44100;
  const nCh = buffer.numberOfChannels;
  const len = buffer.length;
  const ceiling = Math.pow(10, ceilingDb / 20);
  const la = Math.max(1, Math.round(sr * (lookaheadMs / 1000)));
  const overs = Math.max(2, detectOvers || 4);

  const input = [];
  for (let c = 0; c < nCh; c++) input.push(new Float32Array(buffer.getChannelData(c)));
  const outCh = [];
  for (let c = 0; c < nCh; c++) outCh.push(buffer.getChannelData(c));

  // ISP peak per sample index (max abs of sample + cubic inter-sample points to next)
  const isp = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let p = 0;
    for (let c = 0; c < nCh; c++) {
      const d = input[c];
      const y1 = d[i];
      const a1 = Math.abs(y1);
      if (a1 > p) p = a1;
      if (i < len - 1) {
        const y0 = i > 0 ? d[i - 1] : y1;
        const y2 = d[i + 1];
        const y3 = i + 2 < len ? d[i + 2] : y2;
        for (let k = 1; k < overs; k++) {
          const y = Math.abs(_cubicInterp(y0, y1, y2, y3, k / overs));
          if (y > p) p = y;
        }
      }
    }
    isp[i] = p;
  }

  // peaks[i] = max(isp[i .. i+la]) — GR for sample i looks ahead la samples
  const peaks = new Float32Array(len);
  const w = la + 1;
  const dq = [];
  for (let i = 0; i < len + la; i++) {
    const v = i < len ? isp[i] : 0;
    while (dq.length && dq[dq.length - 1].v <= v) dq.pop();
    dq.push({ i: i, v: v });
    while (dq.length && dq[0].i <= i - w) dq.shift();
    if (i >= la) peaks[i - la] = dq[0].v;
  }

  const relFast = Math.exp(-1 / (sr * (releaseMs * 0.25 / 1000)));
  const relSlow = Math.exp(-1 / (sr * (releaseMs / 1000)));
  let grDb = 0;

  // Apply GR to sample i using peaks[i] (aligned — offline, no delay-line mismatch)
  for (let i = 0; i < len; i++) {
    const needLin = _softKneeNeed(peaks[i], ceiling, kneeDb);
    const needGrDb = needLin < 1 ? -20 * Math.log10(needLin + 1e-12) : 0;
    if (needGrDb > grDb) {
      grDb = needGrDb; // instant attack
    } else {
      const diff = grDb - needGrDb;
      const mix = Math.min(1, diff / 6);
      const coeff = relFast * (1 - mix) + relSlow * mix;
      grDb = needGrDb + (grDb - needGrDb) * coeff;
    }
    if (grDb < 0) grDb = 0;
    // Never allow envelope above the instantaneous need (hold ceiling)
    if (needGrDb > 0 && grDb < needGrDb) grDb = needGrDb;
    const env = Math.pow(10, -grDb / 20);
    for (let c = 0; c < nCh; c++) {
      let s = input[c][i] * env;
      if (s > ceiling) s = ceiling;
      if (s < -ceiling) s = -ceiling;
      outCh[c][i] = s;
    }
  }
  return buffer;
}


/** Force true-peak under ceiling — last resort used after every MASTER */

/**
 * Shift integrated loudness toward target by uniform gain (loudnorm-style).
 * For hot masters → -14 LUFS this is almost always attenuation — safe under TP ceiling.
 * Does NOT "push into the limiter"; it moves average level. Call TP force after.
 */
function applyIntegratedLoudnessAim(buffer, targetLufs, maxBoostDb) {
  if (targetLufs == null || !isFinite(targetLufs)) return null;
  if (maxBoostDb == null) maxBoostDb = 1.5; // never dig holes upward into ceiling
  const m = measureBS1770(buffer);
  const cur = m.lufs;
  if (!isFinite(cur) || cur < -70) return { from: cur, to: cur, gainDb: 0 };
  let gainDb = targetLufs - cur;
  // Spotify path: allow full attenuation; limit boost so we don't crash TP
  if (gainDb > maxBoostDb) gainDb = maxBoostDb;
  if (Math.abs(gainDb) < 0.05) return { from: cur, to: cur, gainDb: 0, skipped: true };
  const g = Math.pow(10, gainDb / 20);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  return { from: cur, to: targetLufs, gainDb: gainDb };
}

function forceTruePeakCeiling(buffer, ceilingDb) {
  const ceilDb = ceilingDb != null ? ceilingDb : STREAM_TP_CEILING_DBTP;
  const margin = typeof STREAM_TP_FORCE_MARGIN_DB !== "undefined" ? STREAM_TP_FORCE_MARGIN_DB : 0.05;
  const targetDb = ceilDb - margin; // e.g. -1.05 so display -1.0 and gate never fight
  const targetLin = Math.pow(10, targetDb / 20);
  const overs = typeof AUTHORITATIVE_TP_OVERS !== "undefined" ? AUTHORITATIVE_TP_OVERS : 4;
  // Sample clamp to target
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      if (d[i] > targetLin) d[i] = targetLin;
      if (d[i] < -targetLin) d[i] = -targetLin;
    }
  }
  for (let pass = 0; pass < 6; pass++) {
    const tp = measureTruePeakDBTP(buffer, overs);
    const peakLin = Math.pow(10, tp / 20);
    if (peakLin <= targetLin * 1.00001 || peakLin < 1e-12) break;
    const g = (targetLin * 0.999) / peakLin;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      if (d[i] > targetLin) d[i] = targetLin;
      if (d[i] < -targetLin) d[i] = -targetLin;
    }
  }
  return measureTruePeakDBTP(buffer, overs);
}

function applyTruePeakCeiling(buffer, targetDbtp) {
  const targetLin = Math.pow(10, targetDbtp / 20);
  // Multiple measure→scale passes: uniform gain can recreate ISP overs
  for (let pass = 0; pass < 4; pass++) {
    const tp = measureTruePeakDBTP(buffer, 4);
    const peakLin = Math.pow(10, tp / 20);
    if (!(peakLin > targetLin * 1.0005) || peakLin < 1e-12) break;
    const g = (targetLin * 0.99) / peakLin;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
  const ceil = targetLin;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      if (d[i] > ceil) d[i] = ceil;
      if (d[i] < -ceil) d[i] = -ceil;
    }
  }
  return measureTruePeakDBTP(buffer, 4);
}




/* —— Offline MASTER (export) —— */
$("btnMaster").onclick = async () => {
  if (!decodedBuffer && !arrayBuffer) {
    $("status").textContent = "Load a file on A first";
    $("file").click();
    return;
  }
  // Watermark always on for Devine Master exports
  setToggle("provenance", true);

  // --- Solo Safety ---
  solos = [false, false, false, false, false, false];
  document.querySelectorAll(".solo").forEach(btn => btn.classList.remove("on"));
  if (typeof applyLiveParams === "function") applyLiveParams();

  $("btnMaster").disabled = true;
  $("status").textContent = "Processing master…";
  stopLive();
  if ($("audioB")) $("audioB").pause();

  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  try {
    await yieldUI();
    ensureCtx();
    // Guarantee decoded buffer (load may have left only arrayBuffer)
    if (!decodedBuffer && arrayBuffer) {
      $("status").textContent = "Decoding audio…";
      await yieldUI();
      try {
      decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch (decErr) {
      // Retry full buffer copy
      decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    }
    }
    if (!decodedBuffer) {
      throw new Error("No decoded audio — reload the file");
    }
    const srcBuf = decodedBuffer;
    if (!srcBuf.length) throw new Error("Empty audio buffer");
    $("status").textContent = "Processing master… " + srcBuf.duration.toFixed(1) + "s";
    await yieldUI();

    // --- Cold path FIRST (must exist before offline EQ/comp graph) ---
    $("status").textContent = "Measuring input features…";
    await yieldUI();
    let inputFeatures = null;
    try { inputFeatures = extractAudioFeatures(decodedBuffer); } catch (e) { console.warn(e); }
    let coldTonal = { offsetsDb: [0, 0, 0, 0, 0, 0], detail: { active: false } };
    let coldDyn = { ratio: null, eased: false };
    try {
      coldTonal = coldTonalEqOffsets(inputFeatures, preset);
      if ($("status") && coldTonal.detail && coldTonal.detail.active) {
        const gLab = (typeof getColdGravityParams === "function")
          ? getColdGravityParams().label : "Baseline";
        $("status").textContent = "Cold " + gLab + " Δ [" + coldTonal.offsetsDb.join(", ") + "] dB…";
        await yieldUI();
      }
    } catch (e) { console.warn("coldTonal", e); }

    const targetSr = (typeof SR_VALUES !== "undefined" && $("sr"))
      ? (SR_VALUES[+$("sr").value] || 44100)
      : 44100;
    const offline = new OfflineAudioContext(
      2,
      Math.ceil(srcBuf.duration * targetSr),
      targetSr
    );
    const src = offline.createBufferSource();
    src.buffer = srcBuf;

    const hpf = offline.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = +$("hpf").value;

    const bands = [];
    for (let i = 0; i < 6; i++) {
      const f = offline.createBiquadFilter();
      if (i === 0) { f.type = "lowshelf"; f.frequency.value = 60; }
      else if (i === 5) { f.type = "highshelf"; f.frequency.value = 10000; }
      else { f.type = "peaking"; f.frequency.value = EQ_FREQS[i]; f.Q.value = 0.9; }
      let g = toggles.eq ? +$("eq"+i).value : 0;
      if (solos.some(Boolean) && !solos[i]) g = -24;
      // Cold tonal path: catalogue residual EQ (respects Cold gravity control)
      if (coldTonal && coldTonal.offsetsDb && coldTonal.offsetsDb[i]) {
        g += coldTonal.offsetsDb[i];
      }
      f.gain.value = g;
      bands.push(f);
    }

    const lpf = offline.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = +$("lpf").value * 1000;

    const comp = offline.createDynamicsCompressor();
    if (toggles.comp) {
      comp.threshold.value = preset === "spotify" ? -18 : -15;
      comp.knee.value = 6;
      let baseRatio = preset === "spotify" ? 2.2 : (toggles.trans ? 3.2 : 2.8);
      try {
        coldDyn = coldDynamicsAdjust(inputFeatures, baseRatio);
        comp.ratio.value = coldDyn.ratio;
      } catch (e) { comp.ratio.value = baseRatio; }
      comp.attack.value = toggles.trans ? 0.005 : 0.012;
      comp.release.value = 0.12;
    } else {
      comp.threshold.value = 0; comp.ratio.value = 1;
    }

    const gain = offline.createGain();
    const volDb = $("vol") ? +$("vol").value : 0;
    const feel = preset === "spotify" ? 0.92 : (preset === "match" ? 1.06 : 1.08);
    gain.gain.value = feel * dbLin(+$("gain").value) * dbLin(volDb);

    let n = src;
    [hpf, ...bands, lpf, comp, gain].forEach(node => { n.connect(node); n = node; });
    n.connect(offline.destination);
    src.start(0);

    $("status").textContent = "Rendering offline chain…";
    await yieldUI();
    let rendered = await offline.startRendering();
    $("status").textContent = "Width / drive…";
    await yieldUI();
    rendered = applyWidthDriveBuffer(
      rendered,
      $("width") ? +$("width").value : 1,
      $("drive") ? +$("drive").value : 0,
      toggles.mono
    );

    // Look-ahead TP-aware brickwall (default −1.0 dBTP, 5 ms look-ahead)
    $("status").textContent = "Limiting…";
    await yieldUI();
    if (toggles.lim) {
      applyLookaheadLimiter(rendered, -1.0, 5, 80, { kneeDb: 1.0, detectOvers: 4 });
    } else {
      applyTruePeakCeiling(rendered, -1.0);
    }
    // Primary TP projection under ceiling
    forceTruePeakCeiling(rendered, -1.0);

    // Spotify Upload-Ready: explicit integrated aim −14 LUFS via uniform gain (usually down)
    // D.Devine / Match: catalogue aim −10.1 (mild — only pull down if hotter than aim+1.5)
    $("status").textContent = "Loudness aim…";
    await yieldUI();
    let loudAimInfo = null;
    if (preset === "spotify") {
      loudAimInfo = applyIntegratedLoudnessAim(rendered, -14.0, 0.5);
      forceTruePeakCeiling(rendered, -1.0);
    } else if (preset === "devine" || preset === "match") {
      // Only attenuate if excessively above catalogue aim; do not boost into ceiling
      const probe = measureBS1770(rendered);
      if (probe.lufs > -10.1 + 1.5) {
        loudAimInfo = applyIntegratedLoudnessAim(rendered, -10.1, 0);
        forceTruePeakCeiling(rendered, -1.0);
      }
    }

    $("status").textContent = "Measuring loudness…";
    await yieldUI();
    const loud = measureLoudness(rendered);
    if ($("lufsVal")) $("lufsVal").textContent = loud.lufs.toFixed(1);
    if ($("tpVal")) $("tpVal").textContent = loud.tp.toFixed(1);

    const wav = bufferToWav(rendered, toggles.dither !== false);
    const blob = new Blob([wav], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    $("audioB").src = url;
    try {
      ensureCtx();
      // One MediaElementSource per element (Web Audio rule). Insert monitor gain for volume.
      if (!window._bSource) {
        window._bSource = audioCtx.createMediaElementSource($("audioB"));
        window._bGain = audioCtx.createGain();
        window._bAnalyser = audioCtx.createAnalyser();
        window._bAnalyser.fftSize = 1024;
        window._bAnalyser.smoothingTimeConstant = 0.7;
        window._bData = new Uint8Array(window._bAnalyser.frequencyBinCount);
        // EQ + HPF/LPF on B so SUB→AIR / solo work while monitoring master
        window._bHpf = audioCtx.createBiquadFilter();
        window._bHpf.type = "highpass";
        window._bHpf.frequency.value = 30;
        window._bLpf = audioCtx.createBiquadFilter();
        window._bLpf.type = "lowpass";
        window._bLpf.frequency.value = 18000;
        window._bEqBands = [];
        var freqs = (typeof EQ_FREQS !== "undefined" && EQ_FREQS) ? EQ_FREQS : [80, 250, 800, 2500, 6000, 12000];
        for (var bi = 0; bi < 6; bi++) {
          var f = audioCtx.createBiquadFilter();
          if (bi === 0) { f.type = "lowshelf"; f.frequency.value = 60; }
          else if (bi === 5) { f.type = "highshelf"; f.frequency.value = 10000; }
          else { f.type = "peaking"; f.frequency.value = freqs[bi] || 1000; f.Q.value = 0.9; }
          f.gain.value = 0;
          window._bEqBands.push(f);
        }
        window._bSource.connect(window._bHpf);
        window._bHpf.connect(window._bEqBands[0]);
        for (var bj = 0; bj < 5; bj++) window._bEqBands[bj].connect(window._bEqBands[bj + 1]);
        window._bEqBands[5].connect(window._bLpf);
        window._bLpf.connect(window._bGain);
        window._bGain.connect(window._bAnalyser);
        window._bAnalyser.connect(audioCtx.destination);
      } else if (window._bGain && window._bAnalyser) {
        // graph already built
      }
      applyLiveParams(); // pick up current volume onto B
    } catch (err) {
      console.warn("B monitor graph", err);
    }
    mode = "B";
    $("tabB").classList.add("on");
    $("tabA").classList.remove("on");
    $("download").download = fileName + "_DEVINE.wav";
    const top = $("topDownload");
    if (top) top.download = fileName + "_DEVINE.wav";

    // Streaming export eligibility (hard gates block download)
    $("status").textContent = "Checking streaming eligibility…";
    await yieldUI();
    const elig = evaluateStreamingEligibility(rendered, decodedBuffer, {
      width: $("width") ? +$("width").value : 1,
      loud: loud
    });
    showEligibilityPanel(elig, url);
    if (elig.ok && elig.soft.length === 0) {
      setDownloadEnabled(url, true);
    }
    // Catalogue every MASTER (all presets) — history of editions for alignment / finetune
    try {
      const tgt = streamingTargetLufs();
      let outputFeatures = null;
      try { outputFeatures = extractAudioFeatures(rendered); } catch (e) { console.warn(e); }
      const params = snapshotProcessingParams();
      let qaReport = null;
      try {
        if (window.__qg && typeof window.__qg.run === "function") {
          qaReport = window.__qg.run({
            loud: loud,
            elig: elig,
            outputFeatures: outputFeatures,
            inputFeatures: typeof inputFeatures !== "undefined" ? inputFeatures : null,
            params: params,
            preset: preset,
            targetLufs: tgt.lufs,
            targetLabel: tgt.label || (preset === "spotify" ? "Spotify Upload-Ready" : "D.Devine Sound"),
            measurementSpec: typeof MEASUREMENT_SPEC_VERSION !== "undefined" ? MEASUREMENT_SPEC_VERSION : "bs1770-4+tp4x-v1",
            buffer: rendered
          });
          // Phase 3: optional soft-hold on export
          try {
            if (qaReport && window.__qg.isStrictSoft && window.__qg.isStrictSoft()) {
              if (!window.__qg.allowsDownload(qaReport)) {
                if (typeof setDownloadEnabled === "function") setDownloadEnabled(null, false);
                if ($("status")) {
                  $("status").textContent = (($("status").textContent || "") +
                    "  ·  QA soft hold (strict)").replace(/^\s·\s/, "");
                }
              }
            }
          } catch (eHold) {}
        }
      } catch (qerr) { console.warn("QualityGate", qerr); }
      catalogueRecordMaster({
        fileName: fileName || "",
        song: fileName || "",
        preset: preset,
        presetLabel: preset === "spotify" ? "Spotify Upload-Ready" : (preset === "match" ? "Match Ⓟ" : "D.Devine Sound"),
        inputFormat: (typeof lastInputFormat !== "undefined" && lastInputFormat) ? lastInputFormat : "",
        input: inputFeatures || null,
        output: outputFeatures || {
          lufs: loud.lufs,
          truePeakDbtp: loud.tp,
          samplePeakDbfs: elig && elig.metrics ? elig.metrics.samplePeak : null
        },
        processing_parameters: params,
        mapping_results: {
          type: "cold_tonal_v1_plus_loudness_aim",
          loudnessAimDb: (typeof loudAimInfo !== "undefined" && loudAimInfo && loudAimInfo.gainDb != null) ? loudAimInfo.gainDb : null,
          fromLufs: (typeof loudAimInfo !== "undefined" && loudAimInfo) ? loudAimInfo.from : null,
          coldTonal: coldTonal ? coldTonal.detail : null,
          coldDynamics: coldDyn || null,
          notes: "Catalogue-relative residual EQ (clamped) + LUFS aim + TP force",
          coldGravity: (typeof coldGravity !== "undefined" ? coldGravity : "baseline")
        },
        safetyPass: !!(elig && elig.ok),
        hardFailCount: elig && elig.hard ? elig.hard.length : 0,
        softWarnCount: elig && elig.soft ? elig.soft.length : 0,
        hardFails: elig && elig.hard ? elig.hard.slice() : [],
        softWarns: elig && elig.soft ? elig.soft.slice() : [],
        lufs: loud.lufs,
        tpDbtp: loud.tp,
        samplePeakDbfs: elig && elig.metrics ? elig.metrics.samplePeak : null,
        targetLufs: tgt.lufs,
        exportFormat: "WAV",
        bitDepth: "16-bit",
        sampleRate: (typeof SR_VALUES !== "undefined" && $("sr")) ? (SR_VALUES[+$("sr").value] || 44100) : 44100,
        dither: toggles.dither !== false,
        provenance: toggles.provenance !== false,
        qa: qaReport
      });
    } catch (cerr) { console.warn(cerr); }
    // if hard fail or soft pending ack — setDownloadEnabled handled inside panel

    // Format identity from original filename
    // Export identity (what you download) — not the source MP3 label
    const exportSr = (typeof SR_VALUES !== "undefined" && $("sr"))
      ? (SR_VALUES[+$("sr").value] || 44100)
      : 44100;
    // Browser build exports 16-bit PCM WAV (FLAC is Python/RouteNote path)
    const exportFmt = "WAV";
    const bitDepth = "16-bit";
    const song = fileName || "Untitled";
    const presetName = preset === "spotify" ? "Spotify Upload-Ready" : (preset === "match" ? "Match Ⓟ" : "D.Devine Sound");
    const mark = toggles.provenance ? " Ⓟ" : "";
    const srLabel = (exportSr / 1000).toFixed(exportSr % 1000 ? 1 : 0);
    // Source note if input differed
    const srcName = $("fileLabel") ? $("fileLabel").textContent : "";
    const srcExt = (srcName.match(/\.([a-z0-9]+)$/i) || [,""])[1].toUpperCase();
    let msg =
      song + mark +
      "  ·  LUFS " + loud.lufs.toFixed(1) +
      "  ·  TP " + loud.tp.toFixed(1) + " dBTP" +
      "  ·  " + presetName +
      "  ·  " + exportFmt + " " + bitDepth + " / " + srLabel + " kHz";
    if (toggles.dither !== false) msg += "  ·  TPDF dither";
    if (srcExt && srcExt !== "WAV") msg += "  ·  src " + srcExt;
    if (typeof elig !== "undefined") {
      if (!elig.ok) msg += "  ·  EXPORT BLOCKED";
      else if (elig.soft.length) msg += "  ·  warnings — confirm to download";
      else msg += "  ·  streaming eligible";
    }
    if (loudAimInfo && loudAimInfo.gainDb) {
      msg += "  ·  aim " + (loudAimInfo.gainDb >= 0 ? "+" : "") + loudAimInfo.gainDb.toFixed(1) + " dB";
    }
    if (typeof MEASUREMENT_SPEC_VERSION !== "undefined") msg += "  ·  " + MEASUREMENT_SPEC_VERSION;
    $("status").textContent = msg;
    $("btnPlay").textContent = "▶";
  } catch (e) {
    console.error("MASTER failed", e);
    $("status").textContent = "Error: " + (e && e.message ? e.message : e);
    try {
      if ($("streamBadge")) {
        $("streamBadge").className = "stream-badge show blocked";
        $("streamBadge").textContent = "Master failed";
      }
    } catch (_) {}
  } finally {
    $("btnMaster").disabled = false;
  }
};


function applyWidthDriveBuffer(buffer, width, drive, monoBass) {
  const nCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  // Prefer in-place-like copy via getChannelData of a context buffer when possible
  let out;
  try {
    out = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
  } catch (err) {
    // Fallback: mutate a copy of input channels into buffer if already stereo
    out = buffer;
  }
  const L = buffer.getChannelData(0);
  const R = nCh > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0);
  const oL = out.getChannelData(0);
  const oR = out.numberOfChannels > 1 ? out.getChannelData(1) : out.getChannelData(0);

  let w = width;
  if (monoBass && w > 1.0) w = 1.0 + (w - 1.0) * 0.25;

  // Drive: soft parallel saturation (never full wet)
  const k = Math.max(0, drive) * 6;
  const wet = Math.min(0.5, Math.max(0, drive) * 0.5);
  const sat = (x) => {
    if (wet < 0.001) return x;
    const y = ((1 + k) * x) / (1 + k * Math.abs(x));
    return x * (1 - wet) + y * wet;
  };

  // One-pole for mono-bass side low-cut tendency
  const a = Math.exp(-2 * Math.PI * 140 / sr);
  let sideState = 0;

  for (let i = 0; i < len; i++) {
    let l = sat(L[i]);
    let r = sat(R[i]);
    const mid = 0.5 * (l + r);
    let side = 0.5 * (l - r);
    if (monoBass) {
      sideState = a * sideState + (1 - a) * side;
      const sideLo = sideState;
      const sideHi = side - sideLo;
      side = sideLo * 0.1 + sideHi * w;
    } else {
      side *= w;
    }
    let ol = mid + side;
    let or_ = mid - side;
    // soft clip safety before brickwall stage
    ol = Math.max(-1.2, Math.min(1.2, ol));
    or_ = Math.max(-1.2, Math.min(1.2, or_));
    oL[i] = ol;
    oR[i] = or_;
  }
  return out;
}


/**
 * Write 16-bit PCM WAV. Optional TPDF dither (triangular, ~2 LSB) before quantize.
 * applyDither defaults true — respects toggles.dither when called from MASTER.
 */

/* —— Streaming Export Eligibility (hard / soft gates) —— */
/* One definition of true-peak for limit, meter, and export gate */
/** Gate tolerance (dB): pass if tp <= ceiling + tol. Absorbs float/ISP estimator noise only. */
/** Force target margin under ceiling so gate and meter cannot disagree after rounding. */

const STREAM_TARGETS = {
  spotify: { lufs: -14.0, label: "Spotify Upload-Ready" },
  devine:  { lufs: -10.1, label: "D.Devine Sound" },
  match:   { lufs: -10.1, label: "Match Ⓟ" }
};

/* app constants declared near $ */

/* —— Local master catalogue (all presets, every MASTER) —— */
function loadCatalogue() {
  try {
    const raw = localStorage.getItem(CATALOGUE_STORAGE_KEY);
    if (!raw) return { version: 1, entries: [] };
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.entries)) return { version: 1, entries: [] };
    return o;
  } catch (e) {
    return { version: 1, entries: [] };
  }
}

function saveCatalogue(cat) {
  try {
    localStorage.setItem(CATALOGUE_STORAGE_KEY, JSON.stringify(cat));
  } catch (e) {
    console.warn("Catalogue save failed", e);
  }
}

/**
 * Append one master edition row. Non-blocking; never throws into MASTER.
 * editions: same song can appear once per preset/time — full history retained.
 */

/**
 * Broad feature extract for catalogue / cold-path later.
 * Prefer too many fields over too few — archive later if needed.
 * Windowed for long files (centre ~45s) so MASTER stays responsive.
 */
function extractAudioFeatures(buffer, opts) {
  opts = opts || {};
  const empty = {
    lufs: null, truePeakDbtp: null, samplePeakDbfs: null, rmsDb: null, crestDb: null,
    dcOffsetDb: null, stereoCorrelation: null, spectralCentroidHz: null, spectralSlope: null,
    bandEnergyDb: null, bandFreqsHz: null, transientDensity: null, approxLraLu: null,
    peakToAvgDb: null, durationSec: null, sampleRate: null, channels: null,
    windowNote: null
  };
  if (!buffer || !buffer.length) return empty;
  try {
    const sr = buffer.sampleRate || 44100;
    const chs = buffer.numberOfChannels;
    const dur = buffer.length / sr;
    const maxWin = Math.min(buffer.length, Math.floor((opts.maxSec || 45) * sr));
    let start = 0;
    if (buffer.length > maxWin) start = Math.floor((buffer.length - maxWin) / 2);
    const len = Math.min(maxWin, buffer.length - start);

    const chData = [];
    for (let c = 0; c < chs; c++) chData.push(buffer.getChannelData(c).subarray(start, start + len));

    // Sample peak + RMS + DC
    let peak = 0, sumSq = 0, sum = 0, n = 0;
    for (let c = 0; c < chs; c++) {
      const d = chData[c];
      for (let i = 0; i < d.length; i++) {
        const x = d[i];
        const a = Math.abs(x);
        if (a > peak) peak = a;
        sumSq += x * x;
        sum += x;
        n++;
      }
    }
    const rms = n ? Math.sqrt(sumSq / n) : 0;
    const dc = n ? sum / n : 0;
    const samplePeakDbfs = peak > 0 ? 20 * Math.log10(peak) : -120;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -120;
    const crestDb = samplePeakDbfs - rmsDb;
    const dcOffsetDb = Math.abs(dc) > 1e-12 ? 20 * Math.log10(Math.abs(dc)) : -120;

    // Stereo correlation (L vs R)
    let stereoCorrelation = null;
    if (chs >= 2) {
      const L = chData[0], R = chData[1];
      let sL = 0, sR = 0, sLL = 0, sRR = 0, sLR = 0, m = Math.min(L.length, R.length);
      for (let i = 0; i < m; i++) {
        const a = L[i], b = R[i];
        sL += a; sR += b; sLL += a * a; sRR += b * b; sLR += a * b;
      }
      const n2 = m || 1;
      const cL = sL / n2, cR = sR / n2;
      const vL = sLL / n2 - cL * cL, vR = sRR / n2 - cR * cR, cov = sLR / n2 - cL * cR;
      const den = Math.sqrt(Math.max(0, vL) * Math.max(0, vR));
      stereoCorrelation = den > 1e-12 ? cov / den : 1;
    }

    // LUFS + TP from certified path when available
    let lufs = null, truePeakDbtp = null;
    try {
      const m1770 = measureBS1770(buffer);
      lufs = m1770.lufs;
      truePeakDbtp = m1770.tp;
    } catch (e) {
      truePeakDbtp = samplePeakDbfs;
    }

    // FFT bands on mono mix (power of 2 window)
    const bandFreqsHz = [60, 120, 250, 500, 1000, 2000, 4000, 8000, 12000];
    let bandEnergyDb = null, spectralCentroidHz = null, spectralSlope = null;
    try {
      const N = 2048;
      const hop = 1024;
      const mono = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        let s = 0;
        for (let c = 0; c < chs; c++) s += chData[c][i];
        mono[i] = s / chs;
      }
      const re = new Float32Array(N);
      const im = new Float32Array(N);
      const magAcc = new Float32Array(N / 2);
      let frames = 0;
      for (let off = 0; off + N < len; off += hop) {
        for (let i = 0; i < N; i++) {
          const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
          re[i] = mono[off + i] * w;
          im[i] = 0;
        }
        // radix-2 FFT (in-place iterative)
        for (let i = 1, j = 0; i < N; i++) {
          let bit = N >> 1;
          for (; j & bit; bit >>= 1) j ^= bit;
          j ^= bit;
          if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
        }
        for (let size = 2; size <= N; size <<= 1) {
          const half = size >> 1;
          const tableStep = Math.PI * 2 / size;
          for (let i = 0; i < N; i += size) {
            for (let j = 0; j < half; j++) {
              const k = i + j;
              const l = k + half;
              const ang = tableStep * j;
              const wr = Math.cos(ang), wi = -Math.sin(ang);
              const tr = wr * re[l] - wi * im[l];
              const ti = wr * im[l] + wi * re[l];
              re[l] = re[k] - tr; im[l] = im[k] - ti;
              re[k] += tr; im[k] += ti;
            }
          }
        }
        for (let k = 0; k < N / 2; k++) {
          magAcc[k] += re[k] * re[k] + im[k] * im[k];
        }
        frames++;
        if (frames >= 48) break; // enough for profile
      }
      if (frames > 0) {
        const bandE = bandFreqsHz.map(() => 0);
        let centNum = 0, centDen = 0;
        const logPairs = [];
        for (let k = 1; k < N / 2; k++) {
          const f = k * sr / N;
          const p = magAcc[k] / frames;
          if (p <= 0) continue;
          centNum += f * p;
          centDen += p;
          for (let b = 0; b < bandFreqsHz.length; b++) {
            const f0 = b === 0 ? 0 : (bandFreqsHz[b] + bandFreqsHz[b - 1]) / 2;
            const f1 = b === bandFreqsHz.length - 1 ? sr / 2 : (bandFreqsHz[b] + bandFreqsHz[b + 1]) / 2;
            if (f >= f0 && f < f1) bandE[b] += p;
          }
          if (f >= 100 && f <= 10000) logPairs.push([Math.log10(f), Math.log10(p + 1e-20)]);
        }
        spectralCentroidHz = centDen > 0 ? centNum / centDen : null;
        bandEnergyDb = bandE.map(e => e > 0 ? 10 * Math.log10(e) : -120);
        // simple slope via linear regression on log-log
        if (logPairs.length > 8) {
          let sx = 0, sy = 0, sxx = 0, sxy = 0, np = logPairs.length;
          for (let i = 0; i < np; i++) {
            sx += logPairs[i][0]; sy += logPairs[i][1];
            sxx += logPairs[i][0] * logPairs[i][0];
            sxy += logPairs[i][0] * logPairs[i][1];
          }
          spectralSlope = (np * sxy - sx * sy) / (np * sxx - sx * sx + 1e-12);
        }
      }
    } catch (e) { console.warn("spectral features", e); }

    // Transient density: flux of highpassed envelope
    let transientDensity = null;
    try {
      const L = chData[0];
      let prev = 0, peaks = 0;
      const thr = rms * 2.5;
      for (let i = 1; i < L.length; i++) {
        const env = Math.abs(L[i] - L[i - 1]); // crude differentiator
        if (env > thr && prev <= thr) peaks++;
        prev = env;
      }
      transientDensity = peaks / (len / sr); // events per second
    } catch (e) {}

    // Approx loudness range proxy: block RMS percentiles
    let approxLraLu = null;
    try {
      const block = Math.floor(0.4 * sr);
      const levels = [];
      for (let i = 0; i + block < len; i += block) {
        let ss = 0;
        for (let j = 0; j < block; j++) {
          let s = 0;
          for (let c = 0; c < chs; c++) s += chData[c][i + j] * chData[c][i + j];
          ss += s / chs;
        }
        const br = Math.sqrt(ss / block);
        if (br > 1e-8) levels.push(20 * Math.log10(br));
      }
      levels.sort((a, b) => a - b);
      if (levels.length > 10) {
        const p10 = levels[Math.floor(levels.length * 0.1)];
        const p95 = levels[Math.floor(levels.length * 0.95)];
        approxLraLu = p95 - p10;
      }
    } catch (e) {}

    return {
      lufs: lufs,
      truePeakDbtp: truePeakDbtp,
      samplePeakDbfs: samplePeakDbfs,
      rmsDb: rmsDb,
      crestDb: crestDb,
      peakToAvgDb: crestDb,
      dcOffsetDb: dcOffsetDb,
      stereoCorrelation: stereoCorrelation,
      spectralCentroidHz: spectralCentroidHz,
      spectralSlope: spectralSlope,
      bandEnergyDb: bandEnergyDb,
      bandFreqsHz: bandFreqsHz,
      transientDensity: transientDensity,
      approxLraLu: approxLraLu,
      durationSec: dur,
      sampleRate: sr,
      channels: chs,
      windowNote: buffer.length > maxWin ? ("centre_" + (opts.maxSec || 45) + "s") : "full"
    };
  } catch (e) {
    console.warn("extractAudioFeatures", e);
    return empty;
  }
}

function snapshotProcessingParams() {
  const eq = [];
  for (let i = 0; i < 6; i++) eq.push($("eq" + i) ? +$("eq" + i).value : 0);
  return {
    preset: typeof preset !== "undefined" ? preset : null,
    gainDb: $("gain") ? +$("gain").value : 0,
    volDb: $("vol") ? +$("vol").value : 0,
    hpfHz: $("hpf") ? +$("hpf").value : null,
    lpfKhz: $("lpf") ? +$("lpf").value : null,
    width: $("width") ? +$("width").value : null,
    drive: $("drive") ? +$("drive").value : null,
    eqDb: eq,
    toggles: typeof toggles !== "undefined" ? Object.assign({}, toggles) : {},
    srIndex: $("sr") ? +$("sr").value : null,
    exportSr: (typeof SR_VALUES !== "undefined" && $("sr")) ? SR_VALUES[+$("sr").value] : 44100
  };
}

function buildMasterTracker(cat) {
  const songs = {};
  const presets = ["devine", "spotify", "match"];
  (cat.entries || []).forEach(e => {
    const key = (e.song || e.fileName || "unknown").replace(/\s+/g, " ").trim();
    if (!songs[key]) {
      songs[key] = { devine: null, spotify: null, match: null, editions: 0 };
    }
    songs[key].editions++;
    const p = e.preset;
    if (presets.indexOf(p) >= 0) {
      const cell = {
        masterId: e.id,
        ts: e.ts,
        lufs: e.metrics ? e.metrics.lufs : (e.output && e.output.lufs),
        tpDbtp: e.metrics ? e.metrics.tpDbtp : null,
        safetyPass: e.safetyPass,
        engine: e.appBuild || e.engine_version
      };
      // keep latest by ts
      if (!songs[key][p] || (e.ts && songs[key][p].ts && e.ts > songs[key][p].ts) || !songs[key][p].ts) {
        songs[key][p] = cell;
      }
    }
  });
  const rows = Object.keys(songs).sort().map(name => {
    const s = songs[name];
    let n = 0;
    presets.forEach(p => { if (s[p]) n++; });
    return {
      song: name,
      coverage: n + "/3",
      coveredCount: n,
      complete: n === 3,
      devine: s.devine,
      spotify: s.spotify,
      match: s.match,
      editions: s.editions
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    songCount: rows.length,
    completeCount: rows.filter(r => r.complete).length,
    rows: rows
  };
}


function catalogueRecordMaster(entry) {
  try {
    const cat = loadCatalogue();
    if (!cat.version || cat.version < 2) cat.version = 2;
    const songKey = (entry.song || entry.fileName || "unknown").replace(/\s+/g, " ").trim();
    const row = {
      master_id: entry.id || ("m_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7)),
      id: null,
      timestamp: entry.ts || new Date().toISOString(),
      ts: null,
      track_id: songKey,
      song: songKey,
      fileName: entry.fileName || "",
      source: {
        fileName: entry.fileName || "",
        format: entry.inputFormat || entry.input_format || "",
        origin: "user_upload"
      },
      engine_version: typeof APP_BUILD !== "undefined" ? APP_BUILD : "",
      appBuild: typeof APP_BUILD !== "undefined" ? APP_BUILD : "",
      measurement_spec: typeof MEASUREMENT_SPEC_VERSION !== "undefined" ? MEASUREMENT_SPEC_VERSION : "unknown",
      measurementSpec: typeof MEASUREMENT_SPEC_VERSION !== "undefined" ? MEASUREMENT_SPEC_VERSION : "unknown",
      preset_id: entry.preset || "",
      preset: entry.preset || "",
      presetLabel: entry.presetLabel || "",
      // analysis = measured state of the source (pre-master)
      analysis: entry.input || null,
      input: entry.input || null,
      input_format: entry.inputFormat || entry.input_format || "",
      processing: entry.processing_parameters || entry.params || null,
      processing_parameters: entry.processing_parameters || entry.params || null,
      mapping_results: entry.mapping_results || {
        type: "fixed_preset_plus_loudness_aim",
        loudnessAimDb: entry.loudnessAimDb != null ? entry.loudnessAimDb : null,
        notes: "Recipe preset + optional LUFS aim + TP force; adaptive θ not yet active"
      },
      output: entry.output || {
        lufs: entry.lufs,
        truePeakDbtp: entry.tpDbtp,
        samplePeakDbfs: entry.samplePeakDbfs
      },
      quality_assessment: entry.qa || entry.quality_assessment || {
        note: "QualityGate not run for this entry"
      },
      qa: entry.qa || null,
      qa_vector: (entry.qa && entry.qa.vector) ? entry.qa.vector : null,
      metrics: {
        lufs: entry.lufs,
        tpDbtp: entry.tpDbtp,
        samplePeakDbfs: entry.samplePeakDbfs,
        targetLufs: entry.targetLufs
      },
      validation_results: {
        safetyPass: !!entry.safetyPass,
        hardFailCount: entry.hardFailCount != null ? entry.hardFailCount : 0,
        softWarnCount: entry.softWarnCount != null ? entry.softWarnCount : 0,
        hardFails: entry.hardFails || [],
        softWarns: entry.softWarns || [],
        streamingEligible: !!entry.safetyPass
      },
      safetyPass: !!entry.safetyPass,
      hardFailCount: entry.hardFailCount != null ? entry.hardFailCount : 0,
      softWarnCount: entry.softWarnCount != null ? entry.softWarnCount : 0,
      export: {
        format: entry.exportFormat || "WAV",
        bitDepth: entry.bitDepth || "16-bit",
        sampleRate: entry.sampleRate || 44100,
        dither: entry.dither !== false
      },
      export_format: entry.exportFormat || "WAV",
      provenance: entry.provenance !== false,
      mark: entry.provenance !== false ? "Ⓟ" : ""
    };
    row.id = row.master_id;
    row.ts = row.timestamp;
    cat.entries.push(row);
    if (cat.entries.length > 5000) cat.entries = cat.entries.slice(-5000);
    // tracker is derived at export/view time — not stored as source of truth
    saveCatalogue(cat);
    try {
      window.__dmLastMaster = row;
      window.__dmLastMasterOk = !!(row && row.validation_results && row.validation_results.safetyPass);
      if (typeof window.sdSyncStatusFlags === "function") {
        window.sdSyncStatusFlags(row.fileName || row.song || (typeof fileName !== "undefined" ? fileName : ""));
      }
    } catch (e2) {}
    return row;
  } catch (e) {
    console.warn("catalogueRecordMaster", e);
    return null;
  }
}

/**
 * Single export: Master Catalogue is the source of truth.
 * Preset coverage / tracker is a *derived view* computed at export time — not a second database.
 */
function catalogueExportJson() {
  const cat = loadCatalogue();
  const payload = {
    schema: "devine_master_catalogue_v3",
    schemaNote: "Source of truth = entries[] (immutable master records). views.presetCoverage is derived analysis only.",
    exportedAt: new Date().toISOString(),
    engine_version: typeof APP_BUILD !== "undefined" ? APP_BUILD : "",
    measurement_spec: typeof MEASUREMENT_SPEC_VERSION !== "undefined" ? MEASUREMENT_SPEC_VERSION : "",
    // ---- source of truth ----
    entries: cat.entries || [],
    // ---- derived views (never write these as independent history) ----
    views: {
      presetCoverage: buildMasterTracker(cat)
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "devine_master_catalogue_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function catalogueStatsSummary() {
  const cat = loadCatalogue();
  const n = cat.entries.length;
  const byPreset = {};
  cat.entries.forEach(e => {
    byPreset[e.preset] = (byPreset[e.preset] || 0) + 1;
  });
  return { n: n, byPreset: byPreset };
}


function measureSamplePeakDb(buffer) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
    }
  }
  if (peak < 1e-12) return -120;
  return 20 * Math.log10(peak);
}

function measureDcOffsetDb(buffer) {
  // Mean abs DC across channels, dB relative full scale
  let worst = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i];
    const mean = Math.abs(sum / Math.max(1, d.length));
    if (mean > worst) worst = mean;
  }
  if (worst < 1e-12) return -120;
  return 20 * Math.log10(worst);
}

function measureCrestDb(buffer) {
  let peak = 0, sumSq = 0, n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const s = d[i];
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sumSq += s * s;
      n++;
    }
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n));
  if (rms < 1e-12 || peak < 1e-12) return 0;
  return 20 * Math.log10(peak / rms);
}

function streamingTargetLufs() {
  if (preset === "spotify") return STREAM_TARGETS.spotify;
  if (preset === "match") return STREAM_TARGETS.match;
  return STREAM_TARGETS.devine;
}

/**
 * Evaluate streaming export eligibility on a rendered buffer.
 * @param {AudioBuffer} rendered
 * @param {AudioBuffer|null} sourceBuf  original A (for hot-source + crest delta)
 * @param {{width?:number}} opts
 */
function measureBufferStatsFast(buffer, stride) {
  stride = Math.max(1, stride || 8);
  let peak = 0, sum = 0, sumSq = 0, n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    let csum = 0, cn = 0;
    for (let i = 0; i < d.length; i += stride) {
      const s = d[i];
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sumSq += s * s;
      csum += s;
      cn++;
      n++;
    }
    sum += Math.abs(csum / Math.max(1, cn));
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n));
  const samplePeakDb = peak < 1e-12 ? -120 : 20 * Math.log10(peak);
  const dcDb = sum < 1e-12 ? -120 : 20 * Math.log10(sum / Math.max(1, buffer.numberOfChannels));
  const crestDb = (rms < 1e-12 || peak < 1e-12) ? 0 : 20 * Math.log10(peak / rms);
  return { samplePeakDb, dcDb, crestDb };
}

function evaluateStreamingEligibility(rendered, sourceBuf, opts) {
  opts = opts || {};
  const target = streamingTargetLufs();
  // Prefer LUFS/TP already computed on MASTER path
  const loud = opts.loud || measureBS1770(rendered);
  const fast = measureBufferStatsFast(rendered, 8);
  const samplePeak = fast.samplePeakDb;
  const dcDb = fast.dcDb;
  const crestOut = fast.crestDb;
  let crestIn = null;
  let sourceTp = null;
  if (sourceBuf) {
    const sfast = measureBufferStatsFast(sourceBuf, 16);
    crestIn = sfast.crestDb;
    // Sample peak of source as hot-source proxy (avoid second full TP pass)
    sourceTp = sfast.samplePeakDb;
  }
  const width = opts.width != null ? opts.width : ( $("width") ? +$("width").value : 1 );

  const hard = [];
  const soft = [];

  // Hard: True Peak — same AUTHORITATIVE meter as forceTruePeakCeiling / measureBS1770
  // Pass if tp <= STREAM_TP_CEILING_DBTP + STREAM_TP_GATE_TOL_DB (default -1.0 + 0.05)
  const tpCeil = typeof STREAM_TP_CEILING_DBTP !== "undefined" ? STREAM_TP_CEILING_DBTP : -1.0;
  const tpTol = typeof STREAM_TP_GATE_TOL_DB !== "undefined" ? STREAM_TP_GATE_TOL_DB : 0.05;
  if (!(loud.tp <= tpCeil + tpTol)) {
    hard.push("True Peak is " + loud.tp.toFixed(3) + " dBTP (raw) — must be ≤ " +
      tpCeil.toFixed(1) + " dBTP (+" + tpTol.toFixed(2) + " dB tol) for streaming safety.");
  }
  // Hard: Sample peak
  if (samplePeak > -0.1 + 1e-6) {
    hard.push("Sample peak is " + samplePeak.toFixed(2) + " dBFS — must be ≤ −0.1 dBFS (clipping floor).");
  }
  // Hard: DC
  if (dcDb > -50) {
    hard.push("DC offset is " + dcDb.toFixed(1) + " dB — must be below −50 dB.");
  }

  // LUFS is NOT a hard block for export.
  // Spotify/Apple normalize on their side — your live catalogue sits near −10.1 (D.Devine),
  // not −14. Missing the preset target is a soft advisory only.
  const lufsErr = Math.abs(loud.lufs - target.lufs);
  if (lufsErr > 1.5) {
    soft.push("Loudness is " + loud.lufs.toFixed(1) + " LUFS (preset aim " + target.lufs.toFixed(1) +
      " for " + target.label + ", off by " + lufsErr.toFixed(1) + " LU). " +
      "Platforms still accept this — Spotify will normalize. Switch preset to D.Devine if this is a catalogue-hot master.");
  }
  // Extreme only: refuse absurd levels (broken render)
  if (loud.lufs > -3 || loud.lufs < -30) {
    hard.push("Integrated LUFS is " + loud.lufs.toFixed(1) + " — outside a sane master range (−30 … −3). Check gain/limiter.");
  }

  // Soft: dynamics / crest
  if (crestIn != null) {
    const dCrest = crestOut - crestIn;
    if (dCrest < -3.0) {
      soft.push("Significant dynamics reduction detected — crest factor down " +
        Math.abs(dCrest).toFixed(1) + " dB. Check if the master still breathes.");
    }
  }
  // Soft: width
  if (width > 1.25 || width < 0.75) {
    soft.push("Extreme stereo image — width " + width.toFixed(2) +
      ". Check mono compatibility before release.");
  }
  // Soft: heavy limiting proxy — if crest very low absolute
  if (crestOut < 6.0) {
    soft.push("Heavy limiting detected — possible pumping (crest ≈ " +
      crestOut.toFixed(1) + " dB). A/B against the source if unsure.");
  }

  const hotSource = sourceTp != null && sourceTp > -0.5;

  return {
    ok: hard.length === 0,
    hard: hard,
    soft: soft,
    hotSource: hotSource,
    sourceTp: sourceTp,
    metrics: {
      lufs: loud.lufs,
      tp: loud.tp,
      samplePeak: samplePeak,
      dcDb: dcDb,
      crestOut: crestOut,
      crestIn: crestIn,
      targetLufs: target.lufs,
      targetLabel: target.label,
      width: width
    }
  };
}

let _pendingExportUrl = null;
let _softAcknowledged = false;

function setDownloadEnabled(url, enabled) {
  // UI: only topDownload is visible. Hidden #download stays in sync for legacy callers.
  const top = $("topDownload");
  const legacy = $("download");
  const apply = (a, visible) => {
    if (!a) return;
    if (enabled && url) {
      a.href = url;
      a.style.pointerEvents = "auto";
      a.style.opacity = "1";
      if (visible) {
        a.style.display = "inline";
        a.style.visibility = "visible";
      } else {
        a.style.display = "none";
        a.style.visibility = "hidden";
      }
    } else {
      a.removeAttribute("href");
      a.style.pointerEvents = "none";
      a.style.opacity = visible ? "0.35" : "0";
      if (visible) {
        a.style.display = "inline";
        a.style.visibility = "visible";
      } else {
        a.style.display = "none";
        a.style.visibility = "hidden";
      }
    }
  };
  apply(top, true);
  apply(legacy, false);
}

function showEligibilityPanel(result, url, opts) {
  opts = opts || {};
  const reopen = !!opts.reopen;
  const panel = $("eligibilityPanel");
  const title = $("eligTitle");
  const body = $("eligBody");
  const actions = $("eligActions");
  const badge = $("streamBadge");
  if (!panel || !title || !body || !actions) return;

  // Remember for badge click — Eligible · warnings AND Streaming export eligible
  try {
    window.__dmEligibilityLast = {
      result: result,
      url: url || (typeof _pendingExportUrl !== "undefined" ? _pendingExportUrl : null),
      at: Date.now()
    };
  } catch (e) {}

  panel.classList.remove("show", "ok", "warn", "blocked");
  actions.innerHTML = "";
  if (!reopen) {
    _pendingExportUrl = url;
    _softAcknowledged = false;
  } else if (url) {
    _pendingExportUrl = url;
  }

  let html = "";
  if (result.hotSource) {
    html += '<div class="hot-notice">Hot source detected — stricter scrutiny applied. ' +
      'Favour the −1.0 dBTP ceiling; avoid aggressive upward gain.</div>';
  }

  html += '<p>Path: <strong>' + result.metrics.targetLabel + '</strong> · aim ' +
    result.metrics.targetLufs.toFixed(1) + ' LUFS (advisory) · ceiling −1.0 dBTP hard</p>';
  html += '<p style="font-size:0.68rem;opacity:0.9">Spotify does not require −14 LUFS masters — your live catalogue can ship hot. Hard gates are peak/clip/DC only.</p>';
  html += '<p style="font-size:0.62rem;opacity:0.75;margin-top:6px">Meter ' +
    (typeof MEASUREMENT_SPEC_VERSION !== "undefined" ? MEASUREMENT_SPEC_VERSION : "n/a") +
    ' · build ' + (typeof APP_BUILD !== "undefined" ? APP_BUILD : "") + '</p>';
  html += '<p>Measured · LUFS ' + result.metrics.lufs.toFixed(1) +
    ' · TP ' + result.metrics.tp.toFixed(2) + ' dBTP · sample peak ' +
    result.metrics.samplePeak.toFixed(2) + ' dBFS</p>';

  if (result.hard.length) {
    panel.classList.add("blocked");
    title.textContent = "Streaming export blocked";
    html += '<p class="hard"><strong>Hard gates failed</strong> — export is refused until these are fixed:</p><ul>';
    result.hard.forEach(m => { html += '<li class="hard">' + m + '</li>'; });
    html += '</ul>';
    if (result.soft.length) {
      html += '<p class="soft"><strong>Also noted</strong> (soft):</p><ul>';
      result.soft.forEach(m => { html += '<li class="soft">' + m + '</li>'; });
      html += '</ul>';
    }
    if (badge) {
      badge.className = "stream-badge show blocked";
      badge.textContent = "Export blocked";
    }
    setDownloadEnabled(null, false);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "elig-close";
    close.textContent = "Understood — fix and MASTER again";
    close.onclick = () => { if (typeof hideEligibilityPanel === "function") hideEligibilityPanel(); else { panel.classList.remove("show"); panel.style.display = "none"; } };
    actions.appendChild(close);
  } else if (result.soft.length) {
    panel.classList.add("warn");
    title.textContent = "Streaming export — warnings";
    html += '<p>Hard gates passed. Soft gates need a quick look before you download:</p><ul>';
    result.soft.forEach(m => { html += '<li class="soft">' + m + '</li>'; });
    html += '</ul>';
    if (reopen && _softAcknowledged) {
      html += '<p style="opacity:0.85;margin-top:8px">Warnings already acknowledged — download stays enabled.</p>';
      if (badge) {
        badge.className = "stream-badge show ok";
        badge.textContent = "Streaming export eligible";
      }
      setDownloadEnabled(url || _pendingExportUrl, true);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "elig-close";
      close.textContent = "Close";
      close.onclick = () => { if (typeof hideEligibilityPanel === "function") hideEligibilityPanel(); else { panel.classList.remove("show"); panel.style.display = "none"; } };
      actions.appendChild(close);
    } else {
      if (badge) {
        badge.className = "stream-badge show warn";
        badge.textContent = "Eligible · warnings";
      }
      setDownloadEnabled(null, false); // until ack
      const ack = document.createElement("button");
      ack.type = "button";
      ack.className = "elig-ack";
      ack.textContent = "I understand — enable download";
      ack.onclick = () => {
        _softAcknowledged = true;
        setDownloadEnabled(url, true);
        if (badge) {
          badge.className = "stream-badge show ok";
          badge.textContent = "Streaming export eligible";
          badge.title = "Show streaming eligibility report";
        }
        if (typeof hideEligibilityPanel === "function") hideEligibilityPanel(); else { panel.classList.remove("show"); panel.style.display = "none"; }
        if ($("status")) {
          $("status").textContent = ($("status").textContent || "") + "  ·  warnings acknowledged";
        }
      };
      actions.appendChild(ack);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "elig-close";
      close.textContent = "Close";
      close.onclick = () => { if (typeof hideEligibilityPanel === "function") hideEligibilityPanel(); else { panel.classList.remove("show"); panel.style.display = "none"; } };
      actions.appendChild(close);
    }
  } else {
    panel.classList.add("ok");
    title.textContent = "Streaming export eligible";
    html += '<p>All hard gates passed. No soft warnings. This master meets the streaming scrutiny path for the active preset.</p>';
    if (reopen) {
      html += '<p style="opacity:0.8;margin-top:8px;font-size:0.72rem">Reopened from badge (INFO-style). Run MASTER again to refresh measurements.</p>';
    }
    if (badge) {
      badge.className = "stream-badge show ok";
      badge.textContent = "Streaming export eligible";
      badge.title = "Show streaming eligibility report";
    }
    setDownloadEnabled(url, true);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "elig-close";
    close.textContent = "Close";
    close.onclick = () => { if (typeof hideEligibilityPanel === "function") hideEligibilityPanel(); else { panel.classList.remove("show"); panel.style.display = "none"; } };
    actions.appendChild(close);
  }

  body.innerHTML = html;
  panel.classList.add("show");
  panel.style.display = "block";
  // Center on vinyl like INFO popup
  try {
    if (typeof positionInfoOnVinyl === "function") positionInfoOnVinyl(panel);
    else {
      panel.style.left = "50%";
      panel.style.top = "42%";
      panel.style.transform = "translate(-50%, -50%)";
    }
  } catch (e) {}
}

function hideEligibilityPanel() {
  const panel = document.getElementById("eligibilityPanel");
  if (!panel) return;
  panel.classList.remove("show", "ok", "warn", "blocked");
  panel.style.display = "none";
}

/** Re-open last eligibility report from the stream badge (INFO-style). */
function openEligibilityFromBadge() {
  const panel = document.getElementById("eligibilityPanel");
  const title = document.getElementById("eligTitle");
  const body = document.getElementById("eligBody");
  const actions = document.getElementById("eligActions");
  const last = window.__dmEligibilityLast;

  if (last && last.result && typeof showEligibilityPanel === "function") {
    showEligibilityPanel(last.result, last.url, { reopen: true });
    return;
  }

  if (!panel || !title || !body) {
    console.warn("eligibility panel DOM missing");
    return;
  }
  title.textContent = "Streaming eligibility";
  body.innerHTML = "<p>No eligibility report yet. Run <strong>MASTER</strong> to evaluate hard/soft gates.</p><p style=\"opacity:0.8;font-size:0.72rem\">After MASTER, click this badge again to reopen the report (INFO-style).</p>";
  if (actions) {
    actions.innerHTML = "";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "elig-close";
    close.textContent = "Close";
    close.onclick = function () {
      if (typeof hideEligibilityPanel === "function") hideEligibilityPanel();
      else { panel.classList.remove("show"); panel.style.display = "none"; }
    };
    actions.appendChild(close);
  }
  panel.classList.remove("ok", "warn", "blocked");
  panel.classList.add("show");
  panel.style.display = "block";
  try {
    if (typeof positionInfoOnVinyl === "function") positionInfoOnVinyl(panel);
  } catch (e) {}
}

function wireStreamBadgeInfo() {
  const badge = document.getElementById("streamBadge");
  if (!badge) return;
  if (badge.dataset.eligWired === "1") return;
  badge.dataset.eligWired = "1";
  badge.style.pointerEvents = "auto";
  badge.style.cursor = "pointer";

  const open = function (ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    try {
      openEligibilityFromBadge();
    } catch (err) {
      console.warn("openEligibilityFromBadge", err);
    }
  };
  badge.addEventListener("click", open);
  badge.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" || ev.key === " ") open(ev);
  });
}

// Event delegation fallback (survives if badge node is ever replaced)
if (!window.__dmEligBadgeDelegated) {
  window.__dmEligBadgeDelegated = true;
  document.addEventListener("click", function (ev) {
    const t = ev.target;
    if (!t) return;
    const badge = t.id === "streamBadge" ? t : (t.closest && t.closest("#streamBadge"));
    if (!badge) return;
    try {
      openEligibilityFromBadge();
    } catch (err) {
      console.warn("elig badge delegate", err);
    }
  }, true);
}


try { wireStreamBadgeInfo(); } catch (e) {}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    try { wireStreamBadgeInfo(); } catch (e) {}
  });
} else {
  try { wireStreamBadgeInfo(); } catch (e) {}
}

function bufferToWav(buffer, applyDither) {
  if (applyDither == null) applyDither = true;
  const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const dataSize = len * numCh * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * numCh * 2, true); v.setUint16(32, numCh * 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, dataSize, true);
  let off = 44;
  const chData = [];
  for (let c = 0; c < numCh; c++) chData.push(buffer.getChannelData(c));

  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let sample = chData[c][i];

      // TPDF dither: two uniform [-0.5,0.5] → triangular, scaled to 1 LSB @ 16-bit
      if (applyDither) {
        const r1 = Math.random() - 0.5;
        const r2 = Math.random() - 0.5;
        sample += (r1 + r2) / 32768;
      }

      sample = Math.max(-1, Math.min(1, sample));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      v.setInt16(off, int16, true);
      off += 2;
    }
  }
  return ab;
}

// Boot — spectrum must init BEFORE tick() (tick calls drawSpectrum)

