#!/usr/bin/env python3
"""
DEVINE MASTER — HTML UI + local FastAPI server (no Gradio).

Launch:
    cd ai-mastering
    python app_web.py

Then open http://127.0.0.1:7860
"""
from __future__ import annotations

import json
import tempfile
import traceback
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pedalboard import Pedalboard, LowpassFilter
import uvicorn

from utils import load_audio, save_audio, ensure_stereo
from chain import apply_chain
from grok_suggest import suggest_parameters
from analysis import measure_loudness, measure_crest_factor, true_peak_limit
from provenance import build_stamp, apply_provenance

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
PROJECT = ROOT.parent
MANIFEST_PATH = PROJECT / "tracks" / "d_devine_dataset_manifest.json"
LYRICS_DIR = PROJECT / "tracks" / "lyrics"
OUT_DIR = PROJECT / "tracks" / "source" / "web_out"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PRESETS = {
    "D.Devine": {"target_lufs": -10.1, "target_tp": -1.0},
    "Spotify": {"target_lufs": -14.0, "target_tp": -1.0},
}

app = FastAPI(title="DEVINE MASTER")
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {"tracks": []}


def lyrics_for_title(title: str) -> str:
    if not title:
        return ""
    m = load_manifest()
    for t in m.get("tracks", []):
        if t.get("title") == title or title in str(t.get("title", "")):
            lp = t.get("lyrics") or {}
            path = lp.get("path")
            if path:
                p = PROJECT / path
                if p.exists():
                    return p.read_text(encoding="utf-8", errors="replace")
    if LYRICS_DIR.is_dir():
        key = title.lower().replace(" ", "").replace("-", "")
        for f in LYRICS_DIR.glob("*.txt"):
            if key in f.stem.lower().replace(" ", "").replace("-", ""):
                return f.read_text(encoding="utf-8", errors="replace")
    return ""


@app.get("/", response_class=HTMLResponse)
def index():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/api/tracks")
def api_tracks():
    m = load_manifest()
    tracks = [{"title": t.get("title"), "id": t.get("id")} for t in m.get("tracks", [])]
    return {"tracks": tracks}


@app.get("/api/lyrics")
def api_lyrics(title: str = ""):
    return {"lyrics": lyrics_for_title(title) or "(no lyrics found)"}


@app.post("/api/master")
async def api_master(
    file: UploadFile = File(...),
    preset: str = Form("D.Devine"),
    output_gain_db: float = Form(0.0),
    sample_rate: int = Form(44100),
    hpf_hz: float = Form(30.0),
    lpf_khz: float = Form(20.0),
    mono_bass: bool = Form(True),
    limiter: bool = Form(True),
    declip: bool = Form(True),
    eq: bool = Form(True),
    comp: bool = Form(True),
    transient: bool = Form(False),
    sub_db: float = Form(0.0),
    bass_db: float = Form(0.0),
    lowmid_db: float = Form(0.0),
    presence_db: float = Form(0.0),
    highmid_db: float = Form(0.0),
    air_db: float = Form(0.0),
    track_title: str = Form(""),
):
    try:
        suffix = Path(file.filename or "input.wav").suffix or ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            in_path = Path(tmp.name)

        audio, sr = load_audio(in_path)
        audio = ensure_stereo(audio)
        before = measure_loudness(audio, sr)

        cfg = PRESETS.get(preset, PRESETS["D.Devine"])
        target_lufs = float(cfg["target_lufs"])
        target_tp = float(cfg["target_tp"])

        chain_params = suggest_parameters(audio=audio, sr=sr, use_grok=False)
        chain_params = {k: v for k, v in chain_params.items() if not str(k).startswith("_")}

        if eq:
            chain_params["low_shelf_gain"] = float(
                np.clip(float(chain_params.get("low_shelf_gain", 0.5)) + 0.45 * (sub_db + bass_db), -6, 6)
            )
            chain_params["presence_gain"] = float(
                np.clip(
                    float(chain_params.get("presence_gain", 1.0))
                    + 0.4 * presence_db
                    + 0.25 * highmid_db
                    + 0.2 * lowmid_db,
                    -6,
                    6,
                )
            )
            chain_params["high_shelf_gain"] = float(
                np.clip(float(chain_params.get("high_shelf_gain", 1.5)) + 0.5 * air_db, -6, 6)
            )

        if not comp:
            chain_params["comp_ratio"] = 1.1
            chain_params["comp_threshold"] = -8.0
        if not limiter:
            chain_params["limiter_threshold"] = -0.1
        if transient:
            chain_params["comp_attack"] = max(5.0, float(chain_params.get("comp_attack", 15.0)) * 0.5)

        chain_params["hp_freq"] = float(hpf_hz)

        processed, report = apply_chain(
            audio,
            sr,
            target_lufs=target_lufs,
            target_tp=target_tp if limiter else -0.3,
            use_auto_staging=True,
            chain_params=chain_params,
            declip_strength=0.7 if declip else 0.0,
            width=1.0,
            mono_bass_hz=120.0 if mono_bass else 0.0,
            exciter_drive=0.0,
            watermark=False,
        )

        lpf_hz = float(lpf_khz) * 1000.0
        if lpf_hz < 19000:
            board = Pedalboard([LowpassFilter(cutoff_frequency_hz=lpf_hz)])
            processed = board(processed.T, sr).T

        if abs(float(output_gain_db)) > 0.01:
            processed = processed * (10.0 ** (float(output_gain_db) / 20.0))
            processed, _ = true_peak_limit(processed, sr, target_tp=target_tp)

        target_sr = int(sample_rate) if int(sample_rate) in (32000, 44100, 48000) else 44100
        after = measure_loudness(processed, sr)
        crest = measure_crest_factor(processed, use_true_peak=True, sr=sr)

        stem = Path(file.filename or "track").stem
        out_path = OUT_DIR / f"{stem}_DEVINE_mastered.flac"
        out_path = save_audio(out_path, processed, sr, fmt="flac", target_sr=target_sr)
        stamp = build_stamp(target_lufs=target_lufs, target_tp=target_tp, prompt=f"HTML:{preset}")
        apply_provenance(out_path, stamp, title=stem)

        stages = [s.get("name") for s in report.get("stages", [])]
        text = (
            f"DEVINE MASTER  |  {preset}\n"
            f"Track: {track_title or stem}\n"
            f"SOURCE    LUFS {before['integrated_lufs']:.2f}   TP {before['true_peak_dbtp']:.2f} dBTP\n"
            f"MASTERED  LUFS {after['integrated_lufs']:.2f}   TP {after['true_peak_dbtp']:.2f} dBTP   "
            f"Crest {crest:.1f} dB\n"
            f"SR out: {target_sr} Hz  |  HPF {hpf_hz:.0f}  LPF {lpf_hz:.0f}\n"
            f"EQ  SUB{sub_db:+.1f} BASS{bass_db:+.1f} LM{lowmid_db:+.1f} "
            f"PRES{presence_db:+.1f} HM{highmid_db:+.1f} AIR{air_db:+.1f}\n"
            f"Stages: {', '.join(stages)}\n"
            f"File: {out_path.name}"
        )
        lyrics = lyrics_for_title(track_title) if track_title else ""

        try:
            in_path.unlink(missing_ok=True)
        except Exception:
            pass

        return {
            "report": text,
            "lyrics": lyrics,
            "audio_url": f"/api/audio/{out_path.name}",
            "download_url": f"/api/download/{out_path.name}",
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/audio/{name}")
def api_audio(name: str):
    path = OUT_DIR / Path(name).name
    if not path.exists():
        raise HTTPException(404, "not found")
    return FileResponse(path, media_type="audio/flac")


@app.get("/api/download/{name}")
def api_download(name: str):
    path = OUT_DIR / Path(name).name
    if not path.exists():
        raise HTTPException(404, "not found")
    return FileResponse(path, media_type="audio/flac", filename=path.name)


if __name__ == "__main__":
    print("DEVINE MASTER → http://127.0.0.1:7860")
    uvicorn.run(app, host="0.0.0.0", port=7860, log_level="info")
