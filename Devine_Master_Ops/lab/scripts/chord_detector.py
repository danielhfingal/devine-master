#!/usr/bin/env python3
"""Devine Master chord detector — chroma + maj/min triad templates."""
from __future__ import annotations
import argparse, json, re, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import numpy as np

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

def load_audio(path: Path, target_sr: int = 22050):
    try:
        import soundfile as sf
        audio, sr = sf.read(str(path), always_2d=True)
        audio = audio.mean(axis=1).astype(np.float32)
    except Exception:
        try:
            from scipy.io import wavfile
            sr, audio = wavfile.read(str(path))
            if audio.dtype.kind in "iu":
                audio = audio.astype(np.float32) / np.iinfo(audio.dtype).max
            else:
                audio = audio.astype(np.float32)
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
        except Exception:
            import wave, struct
            with wave.open(str(path), "rb") as w:
                sr = w.getframerate()
                nch = w.getnchannels()
                sw = w.getsampwidth()
                raw = w.readframes(w.getnframes())
            if sw == 2:
                data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
            else:
                raise SystemExit(f"Unsupported WAV width {sw}: {path}")
            if nch > 1:
                data = data.reshape(-1, nch).mean(axis=1)
            audio = data
    if sr != target_sr:
        n_out = int(round(len(audio) * target_sr / sr))
        x_old = np.linspace(0.0, 1.0, num=len(audio), endpoint=False)
        x_new = np.linspace(0.0, 1.0, num=n_out, endpoint=False)
        audio = np.interp(x_new, x_old, audio).astype(np.float32)
        sr = target_sr
    return audio, sr

def stft_mag(y, n_fft=4096, hop=2048):
    window = np.hanning(n_fft).astype(np.float32)
    if len(y) < n_fft:
        y = np.pad(y, (0, n_fft - len(y)))
    n_frames = 1 + (len(y) - n_fft) // hop
    frames = np.lib.stride_tricks.as_strided(
        y, shape=(n_frames, n_fft),
        strides=(y.strides[0] * hop, y.strides[0]), writeable=False)
    return np.abs(np.fft.rfft(frames * window, axis=1)).T

def hz_to_midi(hz):
    return 69.0 + 12.0 * np.log2(np.maximum(hz, 1e-8) / 440.0)

def chroma_from_stft(mag, sr, n_fft):
    freqs = np.linspace(0, sr / 2, mag.shape[0])
    midi = hz_to_midi(freqs)
    chroma = np.zeros((12, mag.shape[1]), dtype=np.float64)
    for fi, m in enumerate(midi):
        if freqs[fi] < 65 or freqs[fi] > 5000:
            continue
        chroma[int(np.round(m)) % 12] += mag[fi]
    chroma = np.log1p(chroma * 10.0)
    s = chroma.sum(axis=0, keepdims=True)
    s[s < 1e-8] = 1.0
    return (chroma / s).astype(np.float32)

def compute_chroma(y, sr):
    hop = 2048
    try:
        import librosa
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop, n_chroma=12)
        s = chroma.sum(axis=0, keepdims=True)
        s[s < 1e-8] = 1.0
        return (chroma / s).astype(np.float32), hop
    except Exception:
        n_fft = 4096
        mag = stft_mag(y, n_fft=n_fft, hop=hop)
        return chroma_from_stft(mag, sr, n_fft), hop

def triad_template(root, mode):
    t = np.zeros(12, dtype=np.float32)
    t[root % 12] = 1.0
    if mode == "maj":
        t[(root + 4) % 12] = 0.8
        t[(root + 7) % 12] = 0.9
    else:
        t[(root + 3) % 12] = 0.8
        t[(root + 7) % 12] = 0.9
    return t / (t.sum() + 1e-8)

TEMPLATES = []
for i, name in enumerate(NOTE_NAMES):
    TEMPLATES.append((name, triad_template(i, "maj")))
    TEMPLATES.append((name + "m", triad_template(i, "min")))

def parse_key_hint(hint):
    if not hint:
        return None
    m = re.match(r"([A-G]#?b?)\s*(major|minor|maj|min)?", hint.strip(), re.I)
    if not m:
        return None
    root_name = m.group(1)
    flat_map = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
    root_name = flat_map.get(root_name, root_name)
    if root_name not in NOTE_NAMES:
        return None
    root = NOTE_NAMES.index(root_name)
    mode = (m.group(2) or "major").lower()
    intervals = [0, 2, 3, 5, 7, 8, 10] if mode.startswith("min") else [0, 2, 4, 5, 7, 9, 11]
    return {(root + i) % 12 for i in intervals}

def score_frame(chroma_col, key_hint_pcs=None):
    best_name, best_score = "N", -1.0
    for name, tmpl in TEMPLATES:
        denom = (np.linalg.norm(chroma_col) * np.linalg.norm(tmpl)) + 1e-8
        sc = float(np.dot(chroma_col, tmpl) / denom)
        if key_hint_pcs is not None:
            base = name.replace("m", "")
            if base in NOTE_NAMES and NOTE_NAMES.index(base) in key_hint_pcs:
                sc += 0.03
        if sc > best_score:
            best_score, best_name = sc, name
    if float(chroma_col.sum()) < 1e-6:
        return "N", 0.0
    return best_name, best_score

def detect_chords(chroma, sr, hop, key_hint=None, min_seg_sec=0.4, conf_floor=0.55):
    n_frames = chroma.shape[1]
    times = np.arange(n_frames) * (hop / sr)
    hint_pcs = parse_key_hint(key_hint)
    labels, confs = [], []
    for t in range(n_frames):
        name, sc = score_frame(chroma[:, t], hint_pcs)
        if sc < conf_floor:
            name = "N"
        labels.append(name)
        confs.append(sc)
    raw = []
    i = 0
    while i < n_frames:
        j = i + 1
        while j < n_frames and labels[j] == labels[i]:
            j += 1
        raw.append({
            "start": float(times[i]),
            "end": float(times[min(j, n_frames - 1)] + hop / sr),
            "chord": labels[i],
            "confidence": float(np.mean(confs[i:j])),
        })
        i = j
    merged = []
    for seg in raw:
        dur = seg["end"] - seg["start"]
        if merged and dur < min_seg_sec:
            merged[-1]["end"] = seg["end"]
            merged[-1]["confidence"] = float(0.7 * merged[-1]["confidence"] + 0.3 * seg["confidence"])
        else:
            merged.append(dict(seg))
    if merged:
        merged[-1]["end"] = float(times[-1] + hop / sr)
    return merged

def summarize_chords(segments):
    from collections import Counter
    weighted = Counter()
    total = 0.0
    for s in segments:
        dur = max(0.0, s["end"] - s["start"])
        if s["chord"] == "N":
            continue
        weighted[s["chord"]] += dur
        total += dur
    top = weighted.most_common(8)
    return {
        "topChords": [{"chord": c, "seconds": round(sec, 2), "share": round(sec / total, 3) if total else 0.0} for c, sec in top],
        "coverageSec": round(total, 2),
        "nSegments": len(segments),
        "nLabeled": sum(1 for s in segments if s["chord"] != "N"),
    }

def analyze_file(wav, bpm=None, key_hint=None, out_dir=None):
    y, sr = load_audio(wav)
    chroma, hop = compute_chroma(y, sr)
    segments = detect_chords(chroma, sr, hop, key_hint=key_hint)
    summary = summarize_chords(segments)
    duration = float(len(y) / sr)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    track_id = wav.stem
    doc = {
        "schema": "devine-chord-pass/v1",
        "track": track_id,
        "source": str(wav),
        "pass": f"chord-chroma-v1-{stamp}",
        "engine": "chroma_triad_templates",
        "measurement": {"sr": sr, "hop": hop, "durationSec": round(duration, 3), "confFloor": 0.55, "minSegSec": 0.4},
        "hints": {"bpm": bpm, "key": key_hint},
        "summary": summary,
        "segments": segments,
        "quality": {
            "earRequired": False,
            "notes": [
                "Triad-only model (maj/min). Sevenths/slash chords not labeled.",
                "Low confidence -> chord N.",
                "Key hint is soft prior only.",
            ],
            "refuse": "No single global chord without timeline; timeline is authoritative.",
        },
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    out_dir = out_dir or Path("tracks/analysis")
    out_dir.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^\w.\-]+", "_", track_id)
    out_path = out_dir / f"{safe}_chord_pass_{stamp}.json"
    out_path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    doc["_written"] = str(out_path)
    return doc

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wav", nargs="?", type=Path)
    ap.add_argument("--batch", type=Path)
    ap.add_argument("--bpm", type=float, default=None)
    ap.add_argument("--key-hint", type=str, default=None)
    ap.add_argument("--out-dir", type=Path, default=Path("tracks/analysis"))
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    files = []
    if args.batch:
        files = sorted(args.batch.rglob("*.wav")) + sorted(args.batch.rglob("*.WAV"))
        if args.limit > 0:
            files = files[: args.limit]
    elif args.wav:
        files = [args.wav]
    else:
        ap.print_help()
        sys.exit(2)
    index = []
    for i, f in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {f.name}")
        try:
            doc = analyze_file(f, bpm=args.bpm, key_hint=args.key_hint, out_dir=args.out_dir)
            top = (doc["summary"].get("topChords") or [])[:3]
            tops = ", ".join(f"{t['chord']}({t['share']:.0%})" for t in top) or "-"
            print(f"    segs={doc['summary']['nSegments']}  top: {tops}")
            print(f"    wrote {doc.get('_written')}")
            index.append({"file": f.name, "out": doc.get("_written"), "topChords": top, "nSegments": doc["summary"]["nSegments"]})
        except Exception as e:
            print(f"    ERROR: {e}")
            index.append({"file": f.name, "error": str(e)})
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    idx_path = Path("lab/runs") / f"chord_batch_{stamp}.json"
    idx_path.parent.mkdir(parents=True, exist_ok=True)
    idx_path.write_text(json.dumps({"schema": "devine_chord_batch_v1", "exportedAt": datetime.now(timezone.utc).isoformat(), "count": len(index), "rows": index}, indent=2), encoding="utf-8")
    print("index", idx_path)

if __name__ == "__main__":
    main()
