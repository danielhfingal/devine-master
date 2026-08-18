#!/usr/bin/env python3
"""
DEVINE MASTER — Gradio UI aligned to the production mockup.

A = original (drop/click)   B = mastered
Presets: D.Devine | Spotify
6-band EQ + processing toggles + lyrics panel

Launch:
    cd ai-mastering
    python app_gradio.py
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import gradio as gr
import numpy as np

from utils import load_audio, save_audio, ensure_stereo
from chain import apply_chain
from grok_suggest import suggest_parameters
from analysis import measure_loudness, measure_crest_factor, true_peak_limit
from provenance import build_stamp, apply_provenance
from pedalboard import Pedalboard, LowpassFilter

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "tracks" / "d_devine_dataset_manifest.json"
LYRICS_DIR = ROOT / "tracks" / "lyrics"

PRESETS = {
    "D.Devine": {"target_lufs": -10.1, "target_tp": -1.0},
    "Spotify": {"target_lufs": -14.0, "target_tp": -1.0},
}


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {"tracks": []}


def track_choices() -> list[str]:
    m = load_manifest()
    return [t["title"] for t in m.get("tracks", [])] or ["(no tracks in manifest)"]


def lyrics_for_title(title: str) -> str:
    if not title:
        return ""
    m = load_manifest()
    for t in m.get("tracks", []):
        if t.get("title") == title or title in str(t.get("title", "")):
            lp = t.get("lyrics") or {}
            path = lp.get("path")
            if path:
                p = ROOT / path
                if p.exists():
                    return p.read_text(encoding="utf-8", errors="replace")
    if LYRICS_DIR.is_dir():
        key = title.lower().replace(" ", "").replace("-", "")
        for f in LYRICS_DIR.glob("*.txt"):
            if key in f.stem.lower().replace(" ", "").replace("-", ""):
                return f.read_text(encoding="utf-8", errors="replace")
    return "(no lyrics found for this track)"


def _to_gr(audio: np.ndarray, sr: int):
    if audio.ndim == 2:
        return (sr, audio.T)
    return (sr, audio)


def master_track(
    input_path,
    preset_name,
    output_gain_db,
    sample_rate_khz,
    hpf_hz,
    lpf_khz,
    use_transient,
    use_mono_bass,
    use_limiter,
    use_declip,
    use_eq,
    use_comp,
    use_dither,
    sub_db,
    bass_db,
    lowmid_db,
    presence_db,
    highmid_db,
    air_db,
    track_title,
):
    if input_path is None:
        return None, None, "Drop or click a file on A first.", None, lyrics_for_title(track_title or "")

    path = Path(input_path)
    audio, sr = load_audio(path)
    audio = ensure_stereo(audio)
    before = measure_loudness(audio, sr)

    cfg = PRESETS.get(preset_name, PRESETS["D.Devine"])
    target_lufs = float(cfg["target_lufs"])
    target_tp = float(cfg["target_tp"])

    chain_params = suggest_parameters(audio=audio, sr=sr, use_grok=False)
    chain_params = {k: v for k, v in chain_params.items() if not str(k).startswith("_")}

    if use_eq:
        chain_params["low_shelf_gain"] = float(
            np.clip(float(chain_params.get("low_shelf_gain", 0.5)) + 0.45 * (sub_db + bass_db), -6.0, 6.0)
        )
        chain_params["presence_gain"] = float(
            np.clip(
                float(chain_params.get("presence_gain", 1.0))
                + 0.4 * presence_db
                + 0.25 * highmid_db
                + 0.2 * lowmid_db,
                -6.0,
                6.0,
            )
        )
        chain_params["high_shelf_gain"] = float(
            np.clip(float(chain_params.get("high_shelf_gain", 1.5)) + 0.5 * air_db, -6.0, 6.0)
        )

    if not use_comp:
        chain_params["comp_ratio"] = 1.1
        chain_params["comp_threshold"] = -8.0

    if not use_limiter:
        chain_params["limiter_threshold"] = -0.1

    chain_params["hp_freq"] = float(hpf_hz)
    mono_bass_hz = 120.0 if use_mono_bass else 0.0

    # Transient toggle reserved — gentle extra attack when on
    if use_transient:
        chain_params["comp_attack"] = max(5.0, float(chain_params.get("comp_attack", 15.0)) * 0.5)

    processed, report = apply_chain(
        audio,
        sr,
        target_lufs=target_lufs,
        target_tp=target_tp if use_limiter else -0.3,
        use_auto_staging=True,
        chain_params=chain_params,
        declip_strength=0.7 if use_declip else 0.0,
        width=1.0,
        mono_bass_hz=mono_bass_hz,
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

    target_sr = {"32": 32000, "44.1": 44100, "48": 48000, 32: 32000, 44.1: 44100, 48: 48000}.get(sample_rate_khz, 44100)
    if not isinstance(target_sr, int):
        try:
            target_sr = {"32": 32000, "44.1": 44100, "48": 48000}.get(str(sample_rate_khz), 44100)
        except Exception:
            target_sr = 44100

    after = measure_loudness(processed, sr)
    crest = measure_crest_factor(processed, use_true_peak=True, sr=sr)

    tmp = Path(tempfile.mkdtemp()) / f"{path.stem}_DEVINE_mastered.flac"
    out_path = save_audio(tmp, processed, sr, fmt="flac", target_sr=target_sr)
    stamp = build_stamp(target_lufs=target_lufs, target_tp=target_tp, prompt=f"UI:{preset_name}")
    apply_provenance(out_path, stamp, title=path.stem)

    stages = [s.get("name") for s in report.get("stages", [])]
    summary = (
        f"DEVINE MASTER  |  {preset_name}\n"
        f"Track: {track_title or path.name}\n"
        f"SOURCE    LUFS {before['integrated_lufs']:.2f}   TP {before['true_peak_dbtp']:.2f} dBTP\n"
        f"MASTERED  LUFS {after['integrated_lufs']:.2f}   TP {after['true_peak_dbtp']:.2f} dBTP   "
        f"Crest {crest:.1f} dB\n"
        f"SR out: {target_sr} Hz  |  HPF {hpf_hz:.0f} Hz  LPF {lpf_hz:.0f} Hz\n"
        f"EQ dB  SUB{sub_db:+.1f} BASS{bass_db:+.1f} LM{lowmid_db:+.1f} "
        f"PRES{presence_db:+.1f} HM{highmid_db:+.1f} AIR{air_db:+.1f}\n"
        f"Stages: {', '.join(stages)}\n"
        f"File: {out_path.name}"
    )
    if use_dither:
        summary += "\n(Dither: 16-bit FLAC export quantizes for RouteNote delivery.)"

    lyrics = lyrics_for_title(track_title) if track_title else lyrics_for_title(path.stem)
    return _to_gr(audio, sr), _to_gr(processed, target_sr), summary, str(out_path), lyrics


def on_preset(name: str):
    cfg = PRESETS.get(name, PRESETS["D.Devine"])
    return cfg["target_lufs"], cfg["target_tp"]


def on_track_select(title: str):
    return lyrics_for_title(title)


def build_ui():
    with gr.Blocks(title="DEVINE MASTER") as demo:
        gr.Markdown("# DEVINE MASTER")
        gr.Markdown(
            "**A** = original (drop/click) · **B** = mastered · "
            "Presets: **D.Devine** (−10.1 LUFS) / **Spotify** (−14 LUFS)"
        )

        with gr.Row():
            with gr.Column():
                gr.Markdown("### A — Original")
                inp = gr.Audio(type="filepath", label="Drop or Click")
                out_orig = gr.Audio(label="A playback", interactive=False)
            with gr.Column():
                gr.Markdown("### B — Mastered")
                out_mast = gr.Audio(label="Mastered", interactive=False)

        with gr.Row():
            preset = gr.Radio(["D.Devine", "Spotify"], value="D.Devine", label="Preset")
            track_title = gr.Dropdown(
                choices=track_choices(),
                allow_custom_value=True,
                label="Track title (loads lyrics)",
            )
            target_lufs_disp = gr.Number(value=-10.1, label="Target LUFS", interactive=False)
            target_tp_disp = gr.Number(value=-1.0, label="Target TP", interactive=False)

        with gr.Row():
            output_gain = gr.Slider(-12, 12, value=0, step=0.1, label="Output Gain (dB)")
            sample_rate = gr.Radio(["32", "44.1", "48"], value="44.1", label="Sample Rate (kHz)")
            hpf = gr.Slider(20, 500, value=30, step=1, label="HPF (Hz)")
            lpf = gr.Slider(8, 20, value=20, step=0.1, label="LPF (kHz)")

        with gr.Row():
            use_transient = gr.Checkbox(False, label="Transient")
            use_mono = gr.Checkbox(True, label="Mono bass")
            use_limiter = gr.Checkbox(True, label="Limiter")
            use_declip = gr.Checkbox(True, label="De-Clip")
            use_eq = gr.Checkbox(True, label="EQ")
            use_comp = gr.Checkbox(True, label="Comp")
            use_dither = gr.Checkbox(True, label="Dither")

        gr.Markdown("### EQ — SUB · BASS · LOW-MID · PRESENCE · HIGH-MID · AIR")
        with gr.Row():
            sub = gr.Slider(-12, 12, value=0, step=0.5, label="SUB")
            bass = gr.Slider(-12, 12, value=0, step=0.5, label="BASS")
            lowmid = gr.Slider(-12, 12, value=0, step=0.5, label="LOW-MID")
            presence = gr.Slider(-12, 12, value=0, step=0.5, label="PRESENCE")
            highmid = gr.Slider(-12, 12, value=0, step=0.5, label="HIGH-MID")
            air = gr.Slider(-12, 12, value=0, step=0.5, label="AIR")

        btn = gr.Button("MASTER", variant="primary")
        report = gr.Textbox(label="Report", lines=8)
        download = gr.File(label="Download mastered FLAC")
        lyrics = gr.Textbox(label="LYRICS", lines=14)

        preset.change(on_preset, inputs=[preset], outputs=[target_lufs_disp, target_tp_disp])
        track_title.change(on_track_select, inputs=[track_title], outputs=[lyrics])

        btn.click(
            master_track,
            inputs=[
                inp, preset, output_gain, sample_rate, hpf, lpf,
                use_transient, use_mono, use_limiter, use_declip, use_eq, use_comp, use_dither,
                sub, bass, lowmid, presence, highmid, air, track_title,
            ],
            outputs=[out_orig, out_mast, report, download, lyrics],
        )
    return demo


if __name__ == "__main__":
    demo = build_ui()
    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        theme=gr.themes.Soft(primary_hue="orange", neutral_hue="slate"),
    )
