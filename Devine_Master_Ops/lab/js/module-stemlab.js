var StemLab = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // entry.ts
  var entry_exports = {};
  __export(entry_exports, {
    STEM_IDS_6: () => STEM_IDS_6,
    STEM_IDS_8: () => STEM_IDS_8,
    STEM_META: () => STEM_META,
    approxLufs: () => approxLufs,
    camelotOf: () => camelotOf,
    dbfs: () => dbfs,
    decodeAudioFile: () => decodeAudioFile,
    encodeWavPcm16: () => encodeWavPcm16,
    estimateKey: () => estimateKey,
    estimateTempo: () => estimateTempo,
    fft: () => fft,
    hann: () => hann,
    keyFromChroma: () => keyFromChroma,
    mixDown: () => mixDown,
    onsetEnvelope: () => onsetEnvelope,
    resampleLinear: () => resampleLinear,
    rms: () => rms,
    samplePeak: () => samplePeak,
    separateMix: () => separateMix,
    siSdrDb: () => siSdrDb,
    waveformPeaks: () => waveformPeaks,
    yieldToMain: () => yieldToMain,
    zipStore: () => zipStore
  });

  // src/lib/audio/types.ts
  var STEM_IDS_8 = [
    "vocals",
    "drums",
    "bass",
    "guitar",
    "keys",
    "strings",
    "fx",
    "other"
  ];
  var STEM_IDS_6 = ["vocals", "drums", "bass", "guitar", "keys", "other"];
  var STEM_META = {
    vocals: { label: "Vocals", short: "VOC", colorToken: "var(--color-stem-vocals)" },
    drums: { label: "Drums", short: "DRM", colorToken: "var(--color-stem-drums)" },
    bass: { label: "Bass", short: "BAS", colorToken: "var(--color-stem-bass)" },
    guitar: { label: "Guitar", short: "GTR", colorToken: "var(--color-stem-guitar)" },
    keys: { label: "Keys", short: "KEY", colorToken: "var(--color-stem-keys)" },
    strings: { label: "Strings", short: "STR", colorToken: "var(--color-stem-strings)" },
    fx: { label: "FX", short: "FX", colorToken: "var(--color-stem-fx)" },
    other: { label: "Other", short: "OTH", colorToken: "var(--color-stem-other)" }
  };

  // src/lib/audio/fft.ts
  function fft(re, im, inverse = false) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inverse ? 2 : -2) * Math.PI / len;
      const wlenRe = Math.cos(ang);
      const wlenIm = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let wRe = 1;
        let wIm = 0;
        for (let j = 0; j < half; j++) {
          const ur = re[i + j];
          const ui = im[i + j];
          const vr = re[i + j + half] * wRe - im[i + j + half] * wIm;
          const vi = re[i + j + half] * wIm + im[i + j + half] * wRe;
          re[i + j] = ur + vr;
          im[i + j] = ui + vi;
          re[i + j + half] = ur - vr;
          im[i + j + half] = ui - vi;
          const nwRe = wRe * wlenRe - wIm * wlenIm;
          wIm = wRe * wlenIm + wIm * wlenRe;
          wRe = nwRe;
        }
      }
    }
    if (inverse) {
      const inv = 1 / n;
      for (let i = 0; i < n; i++) {
        re[i] *= inv;
        im[i] *= inv;
      }
    }
  }
  function hann(n) {
    const w = new Float32Array(n);
    if (n < 2) return w;
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
    return w;
  }
  function resampleLinear(input, fromRate, toRate) {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const n = Math.max(1, Math.floor(input.length / ratio));
    const out = new Float32Array(n);
    const last = input.length - 1;
    for (let i = 0; i < n; i++) {
      const x = i * ratio;
      const j = Math.floor(x);
      const f = x - j;
      const a = input[Math.min(j, last)] ?? 0;
      const b = input[Math.min(j + 1, last)] ?? 0;
      out[i] = a + (b - a) * f;
    }
    return out;
  }
  async function yieldToMain() {
    await new Promise((r) => setTimeout(r, 0));
  }

  // src/lib/audio/analysis.ts
  var PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  var CAMELOT_MAJ = {
    C: "8B",
    G: "9B",
    D: "10B",
    A: "11B",
    E: "12B",
    B: "1B",
    "F#": "2B",
    "C#": "3B",
    "G#": "4B",
    "D#": "5B",
    "A#": "6B",
    F: "7B"
  };
  var CAMELOT_MIN = {
    A: "8A",
    E: "9A",
    B: "10A",
    "F#": "11A",
    "C#": "12A",
    "G#": "1A",
    "D#": "2A",
    "A#": "3A",
    F: "4A",
    C: "5A",
    G: "6A",
    D: "7A"
  };
  function camelotOf(key, mode) {
    return mode === "major" ? CAMELOT_MAJ[key] ?? null : CAMELOT_MIN[key] ?? null;
  }
  function corr(a, b) {
    const n = a.length;
    let ma = 0;
    let mb = 0;
    for (let i = 0; i < n; i++) {
      ma += a[i] ?? 0;
      mb += b[i] ?? 0;
    }
    ma /= n;
    mb /= n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
      const x = (a[i] ?? 0) - ma;
      const y = (b[i] ?? 0) - mb;
      num += x * y;
      da += x * x;
      db += y * y;
    }
    return num / (Math.sqrt(da * db) + 1e-12);
  }
  function rotate(profile, shift) {
    const out = new Array(12);
    for (let i = 0; i < 12; i++) out[i] = profile[(i - shift + 12) % 12];
    return out;
  }
  function keyFromChroma(chromaIn) {
    const chroma = new Float64Array(12);
    let mx = 0;
    for (let i = 0; i < 12; i++) {
      chroma[i] = Math.max(0, chromaIn[i] ?? 0);
      if (chroma[i] > mx) mx = chroma[i];
    }
    const chromaArr = [];
    if (mx < 1e-12) {
      return {
        key: "C",
        mode: "major",
        camelot: "8B",
        confidence: 0,
        candidates: [],
        chroma: new Array(12).fill(0)
      };
    }
    for (let i = 0; i < 12; i++) {
      chroma[i] /= mx;
      chromaArr.push(Math.round(chroma[i] * 1e3) / 1e3);
    }
    const candidates = [];
    for (let shift = 0; shift < 12; shift++) {
      const keyName = PITCH_CLASSES[shift];
      const cMaj = corr(chroma, rotate(MAJOR_PROFILE, shift));
      const cMin = corr(chroma, rotate(MINOR_PROFILE, shift));
      candidates.push({
        key: keyName,
        mode: "major",
        corr: Math.round(cMaj * 1e3) / 1e3,
        camelot: camelotOf(keyName, "major")
      });
      candidates.push({
        key: keyName,
        mode: "minor",
        corr: Math.round(cMin * 1e3) / 1e3,
        camelot: camelotOf(keyName, "minor")
      });
    }
    candidates.sort((a, b) => b.corr - a.corr);
    const top = candidates[0];
    const second = candidates[1];
    const conf = Math.max(
      0,
      Math.min(1, (top.corr - (second ? second.corr : 0)) * 3 + top.corr * 0.4)
    );
    return {
      key: top.key,
      mode: top.mode,
      camelot: top.camelot,
      confidence: Math.round(conf * 100) / 100,
      candidates: candidates.slice(0, 6),
      chroma: chromaArr
    };
  }
  function estimateKey(pcm, sampleRate) {
    const sr = sampleRate;
    const len = pcm.length;
    const start = Math.min(Math.floor(sr * 1.5), Math.max(0, len - sr * 4));
    const nSamp = Math.min(len - start, Math.floor(sr * 24));
    const step = Math.max(1, Math.floor(sr / 4e3));
    const chroma = new Float64Array(12);
    const fMin = 65.4;
    const fMax = Math.min(1670, sr / 2 - 1);
    for (let pc = 0; pc < 12; pc++) {
      let energy = 0;
      for (let oct = 0; oct < 6; oct++) {
        const f0 = fMin * Math.pow(2, (pc + oct * 12) / 12);
        if (f0 < 80) continue;
        if (f0 > fMax) break;
        const w = 2 * Math.PI * f0 / sr;
        const coeff = 2 * Math.cos(w);
        let s0 = 0;
        let s1 = 0;
        let s2 = 0;
        let count = 0;
        const end = start + nSamp;
        for (let i = start; i < end; i += step) {
          const x = pcm[i] ?? 0;
          s0 = x + coeff * s1 - s2;
          s2 = s1;
          s1 = s0;
          count++;
          if (count > 18e3) break;
        }
        const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        const reg = f0 < 200 ? 0.7 : f0 > 1e3 ? 0.85 : 1;
        energy += Math.max(0, power) * reg;
      }
      chroma[pc] = energy;
    }
    return keyFromChroma(chroma);
  }
  function estimateTempo(onset, fps) {
    const n = onset.length;
    if (n < 16 || !(fps > 0)) {
      return { bpm: 120, confidence: 0, peaks: [], families: [] };
    }
    const mean = onset.reduce((a, b) => a + b, 0) / n;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.max(0, (onset[i] ?? 0) - mean);
    const minBpm = 60;
    const maxBpm = 180;
    const minLag = Math.max(2, Math.round(fps * 60 / maxBpm));
    const maxLag = Math.min(n - 2, Math.round(fps * 60 / minBpm));
    const ac = [];
    let acMax = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      const m = n - lag;
      for (let i = 0; i < m; i++) s += x[i] * x[i + lag];
      s /= m;
      const bpm2 = 60 * fps / lag;
      ac.push({ bpm: bpm2, ac: s });
      if (s > acMax) acMax = s;
    }
    if (acMax < 1e-12) return { bpm: 120, confidence: 0, peaks: [], families: [] };
    for (const p of ac) p.ac /= acMax;
    const peaks = [];
    for (let i = 1; i < ac.length - 1; i++) {
      const a = ac[i];
      if (a.ac >= (ac[i - 1]?.ac ?? 0) && a.ac >= (ac[i + 1]?.ac ?? 0) && a.ac > 0.12) {
        peaks.push({ bpm: Math.round(a.bpm * 10) / 10, ac: Math.round(a.ac * 1e4) / 1e4 });
      }
    }
    peaks.sort((p, q) => q.ac - p.ac);
    const topPeaks = peaks.slice(0, 8);
    const families = [];
    const centers = [70, 74, 80, 86, 90, 96, 100, 110, 117, 120, 128, 135, 140, 150, 160];
    for (const c of centers) {
      let score = 0;
      for (const p of topPeaks) {
        const r1 = p.bpm / c;
        const r2 = c / p.bpm;
        const r = Math.min(r1, r2);
        const half = Math.abs(p.bpm * 2 - c) / c;
        const dbl = Math.abs(p.bpm / 2 - c) / Math.max(c, 1);
        const near = Math.abs(p.bpm - c) / c;
        if (near < 0.04) score += p.ac * 1.2;
        else if (half < 0.04 || dbl < 0.04) score += p.ac * 0.7;
        else if (r > 0.96) score += p.ac * 0.4;
      }
      if (score > 0.05) families.push({ center: c, score: Math.round(score * 1e4) / 1e4 });
    }
    families.sort((a, b) => b.score - a.score);
    const bpm = topPeaks[0]?.bpm ?? families[0]?.center ?? 120;
    const confidence = Math.max(0, Math.min(1, (topPeaks[0]?.ac ?? 0) * 0.7 + (families[0]?.score ?? 0) * 0.3));
    return {
      bpm: Math.round(bpm * 10) / 10,
      confidence: Math.round(confidence * 100) / 100,
      peaks: topPeaks,
      families: families.slice(0, 5)
    };
  }
  function dbfs(x) {
    return 20 * Math.log10(Math.max(x, 1e-12));
  }
  function samplePeak(pcm) {
    let m = 0;
    for (let i = 0; i < pcm.length; i++) m = Math.max(m, Math.abs(pcm[i] ?? 0));
    return m;
  }
  function rms(pcm) {
    if (pcm.length === 0) return 0;
    let s = 0;
    for (let i = 0; i < pcm.length; i++) {
      const v = pcm[i] ?? 0;
      s += v * v;
    }
    return Math.sqrt(s / pcm.length);
  }
  function approxLufs(left, right, sampleRate) {
    const n = Math.min(left.length, right.length);
    if (n < 16) return -70;
    const hp = Math.exp(-2 * Math.PI * 60 / sampleRate);
    let xl = 0;
    let xr = 0;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const sl = left[i] ?? 0;
      const sr = right[i] ?? 0;
      xl = sl + hp * (xl - sl);
      xr = sr + hp * (xr - sr);
      const hl = sl - xl;
      const hr = sr - xr;
      acc += hl * hl + hr * hr;
    }
    const mean = acc / n;
    return Math.round((-0.691 + 10 * Math.log10(Math.max(mean, 1e-12))) * 10) / 10;
  }
  function waveformPeaks(pcm, buckets) {
    const out = new Array(buckets).fill(0);
    if (pcm.length === 0 || buckets <= 0) return out;
    const step = pcm.length / buckets;
    for (let i = 0; i < buckets; i++) {
      const a = Math.floor(i * step);
      const b = Math.max(a + 1, Math.floor((i + 1) * step));
      let m = 0;
      for (let j = a; j < b && j < pcm.length; j++) m = Math.max(m, Math.abs(pcm[j] ?? 0));
      out[i] = m;
    }
    return out;
  }
  function siSdrDb(ref, est) {
    const n = Math.min(ref.length, est.length);
    if (n < 32) return 0;
    let dot = 0;
    let r2 = 0;
    for (let i = 0; i < n; i++) {
      const r = ref[i] ?? 0;
      const e = est[i] ?? 0;
      dot += r * e;
      r2 += r * r;
    }
    if (r2 < 1e-12) return 0;
    const scale = dot / r2;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const t = scale * (ref[i] ?? 0);
      const err = (est[i] ?? 0) - t;
      num += t * t;
      den += err * err;
    }
    return Math.round(10 * Math.log10(num / (den + 1e-12)) * 10) / 10;
  }
  function mixDown(left, right) {
    const n = Math.min(left.length, right.length);
    const m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = 0.5 * ((left[i] ?? 0) + (right[i] ?? 0));
    return m;
  }
  function onsetEnvelope(mag, frames, bins) {
    const env = new Float32Array(frames);
    for (let t = 1; t < frames; t++) {
      let s = 0;
      const off = t * bins;
      const prev = (t - 1) * bins;
      for (let k = 1; k < bins; k++) {
        const d = (mag[off + k] ?? 0) - (mag[prev + k] ?? 0);
        if (d > 0) s += d;
      }
      env[t] = s;
    }
    return env;
  }

  // src/lib/audio/separate.ts
  var NFFT = 4096;
  var HOP = 1024;
  var BINS = NFFT / 2 + 1;
  var PROCESS_SR = 44100;
  var MAX_SECONDS = 90;
  function chooseSr(srcRate, duration) {
    if (duration > 75) return 22050;
    return srcRate >= 4e4 ? PROCESS_SR : Math.max(22050, srcRate);
  }
  function chooseNfft(sr) {
    if (sr <= 24e3) return { nfft: 2048, hop: 512, bins: 1025 };
    return { nfft: NFFT, hop: HOP, bins: BINS };
  }
  function stftReal(pcm, nfft, hop, window2) {
    const frames = Math.max(1, 1 + Math.floor(Math.max(0, pcm.length - nfft) / hop));
    const bins = nfft / 2 + 1;
    const mag = new Float32Array(frames * bins);
    const re = new Float32Array(frames * bins);
    const im = new Float32Array(frames * bins);
    const reW = new Float32Array(nfft);
    const imW = new Float32Array(nfft);
    for (let t = 0; t < frames; t++) {
      const off = t * hop;
      reW.fill(0);
      imW.fill(0);
      for (let i = 0; i < nfft; i++) {
        reW[i] = (pcm[off + i] ?? 0) * (window2[i] ?? 0);
      }
      fft(reW, imW, false);
      const base = t * bins;
      for (let k = 0; k < bins; k++) {
        const r = reW[k] ?? 0;
        const imv = imW[k] ?? 0;
        re[base + k] = r;
        im[base + k] = imv;
        mag[base + k] = Math.hypot(r, imv);
      }
    }
    return { mag, re, im, frames };
  }
  function istft(re, im, frames, nfft, hop, window2, length) {
    const bins = nfft / 2 + 1;
    const out = new Float32Array(length);
    const wsum = new Float32Array(length);
    const reW = new Float32Array(nfft);
    const imW = new Float32Array(nfft);
    for (let t = 0; t < frames; t++) {
      const base = t * bins;
      reW.fill(0);
      imW.fill(0);
      for (let k = 0; k < bins; k++) {
        reW[k] = re[base + k] ?? 0;
        imW[k] = im[base + k] ?? 0;
      }
      for (let k = 1; k < bins - 1; k++) {
        reW[nfft - k] = reW[k];
        imW[nfft - k] = -(imW[k] ?? 0);
      }
      fft(reW, imW, true);
      const off = t * hop;
      for (let i = 0; i < nfft; i++) {
        const idx = off + i;
        if (idx >= length) break;
        const w = window2[i] ?? 0;
        out[idx] += (reW[i] ?? 0) * w;
        wsum[idx] += w * w;
      }
    }
    for (let i = 0; i < length; i++) {
      const w = wsum[i] ?? 0;
      out[i] = w > 1e-4 ? out[i] / w : 0;
    }
    return out;
  }
  function hpss(mag, frames, bins) {
    const harm = new Float32Array(mag.length);
    const perc = new Float32Array(mag.length);
    for (let t = 0; t < frames; t++) {
      const base = t * bins;
      for (let k = 0; k < bins; k++) {
        const m = mag[base + k] ?? 0;
        const hL = mag[(t > 0 ? t - 1 : t) * bins + k] ?? 0;
        const hR = mag[(t + 1 < frames ? t + 1 : t) * bins + k] ?? 0;
        const h2 = mag[(t > 1 ? t - 2 : t) * bins + k] ?? 0;
        const h3 = mag[(t + 2 < frames ? t + 2 : t) * bins + k] ?? 0;
        const pL = mag[base + Math.max(0, k - 1)] ?? 0;
        const pR = mag[base + Math.min(bins - 1, k + 1)] ?? 0;
        const p2 = mag[base + Math.max(0, k - 2)] ?? 0;
        const p3 = mag[base + Math.min(bins - 1, k + 2)] ?? 0;
        const h = 0.15 * h2 + 0.2 * hL + 0.3 * m + 0.2 * hR + 0.15 * h3;
        const p = 0.15 * p2 + 0.2 * pL + 0.3 * m + 0.2 * pR + 0.15 * p3;
        const hs = h * h;
        const ps = p * p;
        const den = hs + ps + 1e-12;
        harm[base + k] = m * (hs / den);
        perc[base + k] = m * (ps / den);
      }
    }
    return { harm, perc };
  }
  function padPcm(pcm, pad) {
    const o = new Float32Array(pcm.length + pad * 2);
    o.set(pcm, pad);
    return o;
  }
  function freqOf(k, sr, nfft) {
    return k * sr / nfft;
  }
  function gate(f, lo, hi, loSlope = 40, hiSlope = 400) {
    if (f <= lo - loSlope || f >= hi + hiSlope) return 0;
    let g = 1;
    if (f < lo) g *= (f - (lo - loSlope)) / loSlope;
    if (f > hi) g *= 1 - (f - hi) / hiSlope;
    return Math.max(0, Math.min(1, g));
  }
  function formantVocal(f) {
    const a = Math.exp(-Math.pow((f - 720) / 220, 2));
    const b = Math.exp(-Math.pow((f - 1240) / 280, 2));
    const c = Math.exp(-Math.pow((f - 2480) / 420, 2));
    return 0.35 + 0.9 * a + 0.7 * b + 0.5 * c;
  }
  function applyMask(re, im, mask, frames, bins) {
    const or = new Float32Array(re.length);
    const oi = new Float32Array(im.length);
    const n = frames * bins;
    for (let i = 0; i < n; i++) {
      const m = mask[i] ?? 0;
      or[i] = (re[i] ?? 0) * m;
      oi[i] = (im[i] ?? 0) * m;
    }
    return { re: or, im: oi };
  }
  function presenceFromEnergy(stemE, mixE) {
    const r = stemE / (mixE + 1e-12);
    return Math.max(0, Math.min(1, Math.pow(r, 0.55) * 1.15));
  }
  async function separateMix(input, opts) {
    const report = opts.onProgress ?? (() => {
    });
    report(0.02, "Resampling");
    const srcDur = input.left.length / input.sampleRate;
    const dur = Math.min(srcDur, MAX_SECONDS);
    const sr = chooseSr(input.sampleRate, dur);
    const { nfft, hop, bins } = chooseNfft(sr);
    const keep = Math.floor(dur * input.sampleRate);
    const leftSrc = input.left.subarray(0, keep);
    const rightSrc = input.right.subarray(0, Math.min(keep, input.right.length));
    const left = resampleLinear(leftSrc, input.sampleRate, sr);
    const right = resampleLinear(rightSrc, input.sampleRate, sr);
    const n = Math.min(left.length, right.length);
    const window2 = hann(nfft);
    const pad = nfft;
    const leftP = padPcm(left, pad);
    const rightP = padPcm(right, pad);
    report(0.08, "Casting spectrogram");
    await yieldToMain();
    const stL = stftReal(leftP, nfft, hop, window2);
    report(0.18, "Right channel");
    await yieldToMain();
    const stR = stftReal(rightP, nfft, hop, window2);
    const frames = Math.min(stL.frames, stR.frames);
    const magMid = new Float32Array(frames * bins);
    const magSide = new Float32Array(frames * bins);
    const magL = stL.mag;
    const magR = stR.mag;
    for (let i = 0; i < frames * bins; i++) {
      const l = magL[i] ?? 0;
      const r = magR[i] ?? 0;
      magMid[i] = 0.5 * (l + r);
      magSide[i] = 0.5 * Math.abs(l - r);
    }
    report(0.28, "HPSS split");
    await yieldToMain();
    const { harm, perc } = hpss(magMid, frames, bins);
    const flux = onsetEnvelope(perc, frames, bins);
    let fluxMax = 1e-12;
    for (let i = 0; i < flux.length; i++) if ((flux[i] ?? 0) > fluxMax) fluxMax = flux[i];
    report(0.4, "Masking 8 stems");
    await yieldToMain();
    const gamma = Math.max(1, Math.min(2.2, opts.isolation));
    const ids = STEM_IDS_8;
    const scores = ids.map(() => new Float32Array(frames * bins));
    const energy = new Float64Array(ids.length);
    for (let t = 0; t < frames; t++) {
      const base = t * bins;
      const onsetN = Math.min(1, (flux[t] ?? 0) / fluxMax);
      for (let k = 0; k < bins; k++) {
        const f = freqOf(k, sr, nfft);
        const m = magMid[base + k] ?? 0;
        const s = magSide[base + k] ?? 0;
        const h = harm[base + k] ?? 0;
        const p = perc[base + k] ?? 0;
        const tot = h + p + 1e-12;
        const hn = h / tot;
        const pn = p / tot;
        const center = m / (m + s + 1e-12);
        const sideN = s / (m + s + 1e-12);
        const sustain = 1 - onsetN;
        const kick = gate(f, 28, 110, 8, 40) * onsetN * (0.55 + 0.45 * pn);
        const snare = (gate(f, 160, 380, 30, 80) + 0.7 * gate(f, 2200, 7e3, 300, 1200)) * onsetN * (0.4 + 0.6 * pn);
        const hat = gate(f, 6500, 16e3, 600, 3e3) * (0.35 + 0.65 * pn);
        const drums = 1.15 * kick + 1.05 * snare + 0.9 * hat;
        const bass = gate(f, 32, 260, 8, 70) * sustain * (0.55 + 0.65 * hn) * (0.7 + 0.3 * center);
        const vocals = gate(f, 180, 4200, 40, 600) * Math.pow(center, 1.25) * formantVocal(f) * (0.35 + 0.75 * hn) * (0.55 + 0.45 * sustain);
        const guitar = gate(f, 82, 1600, 18, 400) * (0.35 + 0.65 * sideN) * (0.4 + 0.6 * hn) * (0.45 + 0.55 * (0.4 + 0.6 * onsetN));
        const keys = gate(f, 130, 3800, 25, 700) * (0.4 + 0.6 * hn) * sustain * (0.45 + 0.55 * (1 - 0.5 * center));
        const strings = gate(f, 200, 3400, 40, 600) * hn * sustain * (0.4 + 0.6 * sideN);
        const fx = (0.5 * sideN + 0.5 * (1 - hn)) * (0.35 + 0.75 * gate(f, 2500, 14e3, 400, 2500)) * (0.4 + 0.6 * (1 - center));
        const other = 0.08 + 0.12 * hn * gate(f, 500, 6e3, 80, 1200);
        const raw = [vocals, drums, bass, guitar, keys, strings, fx, other];
        let den = 0;
        for (let sIdx = 0; sIdx < 8; sIdx++) {
          const v = Math.pow(Math.max(raw[sIdx], 1e-8), gamma);
          raw[sIdx] = v;
          den += v;
        }
        for (let sIdx = 0; sIdx < 8; sIdx++) {
          const mask = raw[sIdx] / (den + 1e-12) * (m > 1e-8 ? 1 : 0);
          scores[sIdx][base + k] = mask;
          energy[sIdx] += mask * m;
        }
      }
      if (t % 24 === 0) {
        report(0.4 + 0.25 * (t / frames), "Masking 8 stems");
        await yieldToMain();
      }
    }
    report(0.68, "Reconstructing");
    await yieldToMain();
    const stems = [];
    const paddedLen = leftP.length;
    for (let sIdx = 0; sIdx < 8; sIdx++) {
      const mask = scores[sIdx];
      const lM = applyMask(stL.re, stL.im, mask, frames, bins);
      const rM = applyMask(stR.re, stR.im, mask, frames, bins);
      const lFull = istft(lM.re, lM.im, frames, nfft, hop, window2, paddedLen);
      const rFull = istft(rM.re, rM.im, frames, nfft, hop, window2, paddedLen);
      stems.push({
        id: ids[sIdx],
        left: lFull.slice(pad, pad + n),
        right: rFull.slice(pad, pad + n)
      });
      report(0.68 + 0.18 * ((sIdx + 1) / 8), `Reconstructing ${STEM_META[ids[sIdx]].label}`);
      await yieldToMain();
    }
    report(0.9, "Key / tempo pass");
    await yieldToMain();
    const mixE = energy.reduce((a, b) => a + b, 0);
    const mixMono = mixDown(left, right);
    const mixKey = estimateKey(mixMono, sr);
    const mixOnset = flux;
    const fps = sr / hop;
    const mixTempo = estimateTempo(mixOnset, fps);
    const orig = opts.originalStems ?? null;
    const stemAnalyses = [];
    for (const stem of stems) {
      const mono = mixDown(stem.left, stem.right);
      const pk = samplePeak(mono);
      const r = rms(mono);
      const lufs = approxLufs(stem.left, stem.right, sr);
      const idx = ids.indexOf(stem.id);
      const pres = presenceFromEnergy(energy[idx] ?? 0, mixE);
      let key2 = null;
      let tempo2 = null;
      if (pres > 0.08 && pk > 0.01) {
        key2 = estimateKey(mono, sr);
        if (stem.id === "drums" || stem.id === "bass" || stem.id === "other") {
          const st = stftReal(mono, nfft, hop, window2);
          const env = onsetEnvelope(st.mag, st.frames, nfft / 2 + 1);
          tempo2 = estimateTempo(env, fps);
        }
      }
      let sdr = null;
      if (orig) {
        const o = orig.find((x) => x.id === stem.id);
        if (o) {
          const oL = resampleLinear(o.left, input.sampleRate, sr).subarray(0, n);
          sdr = siSdrDb(oL, stem.left);
        }
      }
      stemAnalyses.push({
        id: stem.id,
        label: STEM_META[stem.id].label,
        presence: Math.round(pres * 100) / 100,
        lufs,
        peakDb: Math.round(dbfs(pk) * 10) / 10,
        rmsDb: Math.round(dbfs(r) * 10) / 10,
        crestDb: Math.round((dbfs(pk) - dbfs(r)) * 10) / 10,
        key: key2,
        tempo: tempo2,
        sdrDb: sdr,
        peaks: waveformPeaks(mono, 240)
      });
    }
    const drumsA = stemAnalyses.find((s) => s.id === "drums");
    const bassA = stemAnalyses.find((s) => s.id === "bass");
    const tempo = drumsA?.tempo && drumsA.presence > 0.12 && drumsA.tempo.confidence >= 0.25 ? drumsA.tempo : mixTempo;
    const key = bassA?.key && bassA.presence > 0.15 && bassA.key.confidence >= 0.35 ? bassA.key : mixKey;
    const analysis = {
      track: opts.name,
      pass: "sourcecast-stem-2026-08-24",
      stemCount: opts.stemCount,
      durationSec: Math.round(n / sr * 100) / 100,
      sampleRate: sr,
      method: "STFT HPSS + mid/side + template masks \xB7 Wiener-style competition \xB7 bass-weighted key \xB7 drums-weighted tempo",
      tempo,
      key,
      tempoSource: drumsA?.tempo && drumsA.presence > 0.12 && drumsA.tempo.confidence >= 0.25 ? "Drums" : "Mix",
      keySource: bassA?.key && bassA.presence > 0.15 && bassA.key.confidence >= 0.35 ? "Bass" : "Mix",
      lufs: approxLufs(left, right, sr),
      peakDb: Math.round(dbfs(Math.max(samplePeak(left), samplePeak(right))) * 10) / 10,
      stems: stemAnalyses
    };
    report(1, "Ready");
    return {
      mix: { left, right, sampleRate: sr },
      stems,
      analysis,
      originalStems: orig
    };
  }
  async function decodeAudioFile(file) {
    const ab = await file.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(ab.slice(0));
    await ctx.close();
    const left = buf.getChannelData(0).slice();
    const right = buf.numberOfChannels > 1 ? buf.getChannelData(1).slice() : left.slice();
    return { left, right, sampleRate: buf.sampleRate, name: file.name.replace(/\.[^.]+$/, "") };
  }

  // src/lib/audio/wav.ts
  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  function encodeWavPcm16(left, right, sampleRate) {
    const stereo = right !== null;
    const n = stereo ? Math.min(left.length, right.length) : left.length;
    const channels = stereo ? 2 : 1;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = n * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    let o = 44;
    const clamp = (x) => Math.max(-1, Math.min(1, x));
    for (let i = 0; i < n; i++) {
      const l = clamp(left[i] ?? 0);
      view.setInt16(o, l < 0 ? l * 32768 : l * 32767, true);
      o += 2;
      if (stereo) {
        const r = clamp(right[i] ?? 0);
        view.setInt16(o, r < 0 ? r * 32768 : r * 32767, true);
        o += 2;
      }
    }
    return new Uint8Array(buf);
  }

  // src/lib/audio/zip.ts
  var CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(data) {
    let c = 4294967295;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  }
  function dosDateTime(d = /* @__PURE__ */ new Date()) {
    const time = d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1;
    const date = d.getFullYear() - 1980 << 9 | d.getMonth() + 1 << 5 | d.getDate();
    return { time, date };
  }
  function encodeUtf8(s) {
    return new TextEncoder().encode(s);
  }
  function zipStore(files) {
    const { time, date } = dosDateTime();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const file of files) {
      const name = encodeUtf8(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length + data.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 67324752, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      localParts.push(local);
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 33639248, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      centralParts.push(central);
      offset += local.length;
    }
    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 101010256, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    const chunks = [...localParts, ...centralParts, end];
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return new Blob([out], { type: "application/zip" });
  }
  return __toCommonJS(entry_exports);
})();
try { window.StemLab = StemLab; } catch (e) {}

try { if (typeof StemLab !== "undefined") window.StemLab = StemLab; } catch (e) {}
