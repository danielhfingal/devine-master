#!/usr/bin/env python3
"""Devine structure pass — RMS+flux novelty boundaries, provisional labels."""
from __future__ import annotations
import argparse, json, re, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import numpy as np

def load_audio(path, target_sr=22050):
    try:
        import soundfile as sf
        audio, sr = sf.read(str(path), always_2d=True)
        audio = audio.mean(axis=1).astype(np.float32)
    except Exception:
        import wave
        with wave.open(str(path), "rb") as w:
            sr = w.getframerate(); nch = w.getnchannels(); sw = w.getsampwidth()
            raw = w.readframes(w.getnframes())
        if sw != 2:
            raise SystemExit(f"Unsupported width {sw}: {path}")
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        if nch > 1: data = data.reshape(-1, nch).mean(axis=1)
        audio = data
    if sr != target_sr and len(audio):
        n_out = int(round(len(audio) * target_sr / sr))
        x_old = np.linspace(0, 1, num=len(audio), endpoint=False)
        x_new = np.linspace(0, 1, num=n_out, endpoint=False)
        audio = np.interp(x_new, x_old, audio).astype(np.float32); sr = target_sr
    return audio, sr

def frame_rms(y, win, hop):
    if len(y) < win: y = np.pad(y, (0, win - len(y)))
    n = 1 + (len(y) - win) // hop
    out = np.empty(n, dtype=np.float64)
    for i in range(n):
        seg = y[i*hop:i*hop+win]
        out[i] = np.sqrt(np.mean(seg*seg) + 1e-12)
    return out

def spectral_flux(y, n_fft, hop):
    window = np.hanning(n_fft).astype(np.float32)
    if len(y) < n_fft: y = np.pad(y, (0, n_fft - len(y)))
    n_frames = 1 + (len(y) - n_fft) // hop
    prev = None; flux = np.zeros(n_frames, dtype=np.float64)
    for i in range(n_frames):
        mag = np.abs(np.fft.rfft(y[i*hop:i*hop+n_fft] * window))
        flux[i] = 0.0 if prev is None else float(np.sum(np.maximum(0, mag - prev)))
        prev = mag
    return flux

def smooth(x, k=5):
    if k < 2 or len(x) < k: return x
    return np.convolve(x, np.ones(k)/k, mode="same")

def peak_pick(novelty, hop_sec, min_sep_sec=8.0, thresh=0.32):
    if len(novelty) == 0: return [0]
    n = novelty - np.median(novelty)
    n = n / (np.percentile(np.abs(n), 90) + 1e-8)
    min_sep = max(1, int(min_sep_sec / hop_sec))
    peaks = [0]; i = 1
    while i < len(n) - 1:
        if n[i] >= thresh and n[i] >= n[i-1] and n[i] >= n[i+1]:
            if i - peaks[-1] >= min_sep:
                peaks.append(i); i += min_sep; continue
        i += 1
    return peaks

def snap_to_grid(times, bpm, grid="bar"):
    if not bpm or bpm <= 0: return times
    step = (60.0 / bpm) * (4.0 if grid == "bar" else 1.0)
    snapped = [0.0]
    for t in times[1:]:
        s = round(t / step) * step
        if s <= snapped[-1]: s = snapped[-1] + step
        snapped.append(float(s))
    return snapped

def label_sections(segments, duration):
    energies = [s.get("energy", 0.0) for s in segments]
    if not energies: return segments
    med = float(np.median(energies))
    hi = float(np.percentile(energies, 70)) if len(energies) > 2 else med
    lo = float(np.percentile(energies, 30)) if len(energies) > 2 else med
    for i, s in enumerate(segments):
        pos = s["start"] / max(duration, 1e-6); e = s.get("energy", 0.0)
        if i == 0 and e <= lo: lab = "intro"
        elif i == len(segments)-1 and pos > 0.75: lab = "outro"
        elif e >= hi: lab = "chorus"
        elif e <= lo: lab = "bridge" if 0.3 < pos < 0.85 else "verse"
        else: lab = "verse"
        s["label"] = lab; s["labelStatus"] = "provisional"
    return segments

def analyze_file(wav, bpm=None, out_dir=None, min_sep_sec=8.0):
    y, sr = load_audio(wav)
    duration = float(len(y)/sr) if sr else 0.0
    win, hop = 2048, 1024; hop_sec = hop/sr
    rms = frame_rms(y, win, hop)
    flux = spectral_flux(y, 2048, hop)
    m = min(len(rms), len(flux)); rms, flux = rms[:m], flux[:m]
    rms_n = rms/(np.max(rms)+1e-8); flux_n = flux/(np.max(flux)+1e-8)
    novelty = smooth(0.55*flux_n + 0.45*np.maximum(0, np.diff(rms_n, prepend=rms_n[0])), k=7)
    peak_idx = peak_pick(novelty, hop_sec, min_sep_sec=min_sep_sec)
    times = [float(i*hop_sec) for i in peak_idx]
    if times[-1] < duration - 1.0: times.append(duration)
    times = snap_to_grid(times, bpm, "bar")
    times = [0.0] + [t for t in times[1:] if 0 < t < duration - 0.5]
    if not times or times[-1] < duration - 0.25: times.append(duration)
    times = sorted(set(round(t, 3) for t in times))
    if times[0] != 0.0: times = [0.0] + times
    if times[-1] < duration: times[-1] = round(duration, 3)
    segments = []
    for a, b in zip(times[:-1], times[1:]):
        if b <= a: continue
        i0 = int(a/hop_sec); i1 = min(len(rms), max(i0+1, int(b/hop_sec)))
        e = float(np.mean(rms[i0:i1])) if i1 > i0 else 0.0
        segments.append({"start": round(float(a),3), "end": round(float(b),3),
                         "duration": round(float(b-a),3), "energy": round(e,6)})
    segments = label_sections(segments, duration)
    bars = round(duration / (240.0/bpm), 2) if bpm and bpm > 0 else None
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    track_id = wav.stem
    doc = {
        "schema": "devine-structure-pass/v1", "track": track_id, "source": str(wav),
        "pass": f"structure-novelty-v1-{stamp}", "engine": "rms_flux_novelty_peakpick",
        "hints": {"bpm": bpm},
        "measurement": {"sr": sr, "durationSec": round(duration,3), "hop": hop,
                        "minSepSec": min_sep_sec, "estimatedBars44": bars},
        "summary": {"nSections": len(segments),
                    "labels": sorted({s.get("label") for s in segments}),
                    "boundariesSec": [s["start"] for s in segments] + ([segments[-1]["end"]] if segments else [])},
        "sections": segments,
        "quality": {"earRequired": False, "boundaryStatus": "machine", "labelStatus": "provisional",
                    "notes": ["Boundaries primary; labels heuristic.", "BPM snaps to bar grid when provided."],
                    "refuse": "Do not lock labels without human gate."},
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    out_dir = out_dir or Path("tracks/analysis"); out_dir.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^\w.\-]+", "_", track_id)
    out_path = out_dir / f"{safe}_structure_pass_{stamp}.json"
    out_path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    doc["_written"] = str(out_path)
    return doc

def is_master_wav(path):
    n = path.name.lower()
    if any(x in n for x in ("_bass","bass.","_drum","drums","_vocal","vocals","_piano","_other","_guitar","instrumental")):
        return False
    return path.suffix.lower()==".wav"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wav", nargs="?", type=Path)
    ap.add_argument("--batch", type=Path)
    ap.add_argument("--bpm", type=float, default=None)
    ap.add_argument("--out-dir", type=Path, default=Path("tracks/analysis"))
    ap.add_argument("--masters-only", action="store_true")
    ap.add_argument("--min-sep", type=float, default=8.0)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    files = []
    if args.batch:
        files = sorted(args.batch.rglob("*.wav")) + sorted(args.batch.rglob("*.WAV"))
        if args.masters_only: files = [p for p in files if is_master_wav(p)]
        if args.limit > 0: files = files[:args.limit]
    elif args.wav: files = [args.wav]
    else: ap.print_help(); sys.exit(2)
    index = []
    for i, f in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {f.name}")
        try:
            doc = analyze_file(f, bpm=args.bpm, out_dir=args.out_dir, min_sep_sec=args.min_sep)
            labs = [s.get("label") for s in doc.get("sections") or []]
            print(f"    sections={doc['summary']['nSections']}  labels={labs}")
            print(f"    wrote {doc.get('_written')}")
            index.append({"file": f.name, "out": doc.get("_written"), "nSections": doc["summary"]["nSections"], "labels": labs})
        except Exception as e:
            print(f"    ERROR: {e}"); index.append({"file": f.name, "error": str(e)})
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    idx = Path("lab/runs") / f"structure_batch_{stamp}.json"
    idx.parent.mkdir(parents=True, exist_ok=True)
    idx.write_text(json.dumps({"schema":"devine_structure_batch_v1","exportedAt":datetime.now(timezone.utc).isoformat(),"count":len(index),"rows":index}, indent=2), encoding="utf-8")
    print("index", idx)

if __name__ == "__main__":
    main()
