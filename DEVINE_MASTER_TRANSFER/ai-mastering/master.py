#!/usr/bin/env python3
"""
AI Music Mastering Prototype
============================
Default preset: ddevine (-10.1 LUFS / -1.0 dBTP). Use --preset spotify for -14 LUFS.
Transparent, self-hosted, AI-track friendly.
Supports single files, batch folders, and simple stem folders.
"""

from __future__ import annotations

import click
import json
from pathlib import Path
from typing import List

from utils import load_audio, save_audio, ensure_stereo
from provenance import build_stamp, apply_provenance
from chain import apply_chain
from analysis import measure_loudness, spectral_balance
from grok_suggest import suggest_parameters


SUPPORTED_EXT = {".wav", ".flac", ".aiff", ".aif", ".ogg", ".mp3"}


# Delivery presets – same chain, watermark, provenance; only loudness targets change
PRESETS = {
    "ddevine": {
        "label": "D.Devine catalogue match",
        "target_lufs": -10.1,
        "target_tp": -1.0,
    },
    "spotify": {
        "label": "Spotify-optimal (clean encode / normalization)",
        "target_lufs": -14.0,
        "target_tp": -1.0,
    },
}


def process_one(
    input_path: Path,
    output_path: Path,
    target_lufs: float,
    target_tp: float,
    prompt: str | None,
    use_auto_staging: bool,
    use_grok: bool,
    report: bool,
    ref_audio=None,
    ref_sr=None,
    eq_strength: float = 0.55,
    fmt: str = "flac",
    target_sr: int | None = 44100,
    declip_strength: float = 0.0,
    width: float = 1.0,
    mono_bass_hz: float = 120.0,
    exciter_drive: float = 0.0,
    exciter_mix: float = 0.2,
    embed_provenance: bool = True,
    watermark: bool = False,
    watermark_level_db: float = -48.0,
) -> dict:
    click.echo(f"→ {input_path.name}")
    audio, sr = load_audio(input_path)
    audio = ensure_stereo(audio)

    # Grok / prompt + spectral / reference-track suggestions
    chain_params = suggest_parameters(
        prompt=prompt,
        audio=audio,
        sr=sr,
        use_grok=use_grok,
        ref_audio=ref_audio,
        ref_sr=ref_sr,
        eq_strength=eq_strength,
    )

    processed, stats = apply_chain(
        audio,
        sr,
        target_lufs=target_lufs,
        target_tp=target_tp,
        use_auto_staging=use_auto_staging,
        chain_params=chain_params,
        declip_strength=declip_strength,
        width=width,
        mono_bass_hz=mono_bass_hz,
        exciter_drive=exciter_drive,
        exciter_mix=exciter_mix,
        watermark=watermark,
        watermark_level_db=watermark_level_db,
    )

    output_path = save_audio(output_path, processed, sr, fmt=fmt, target_sr=target_sr)
    if embed_provenance:
        stamp = build_stamp(
            target_lufs=target_lufs,
            target_tp=target_tp,
            prompt=prompt,
            extra={"param_source": stats.get("param_source"), "format": fmt},
        )
        apply_provenance(output_path, stamp, title=input_path.stem)


    if report:
        click.echo(json.dumps(stats, indent=2, default=str))
    else:
        b = stats.get("before_chain", {})
        a = stats.get("after_final", {})
        src = stats.get("param_source", "?")
        click.echo(
            f"  {b.get('integrated_lufs', 0):.1f} → {a.get('integrated_lufs', 0):.1f} LUFS  |  "
            f"TP {a.get('true_peak_dbtp', 0):.1f} dBTP  |  params: {src}"
        )
    return stats


@click.command()
@click.argument("input_path", type=click.Path(exists=True))
@click.option("-o", "--output", type=click.Path(), default=None,
              help="Output file or directory")
@click.option("--preset", type=click.Choice(["ddevine", "spotify"]), default="ddevine",
              show_default=True,
              help="ddevine = catalogue match (-10.1); spotify = platform-optimal (-14)")
@click.option("--target-lufs", default=None, type=float,
              help="Override preset LUFS (default: from --preset)")
@click.option("--target-tp", default=None, type=float,
              help="Override preset true-peak dBTP (default: from --preset)")
@click.option("--prompt", "-p", default=None,
              help="Natural-language guidance, e.g. 'brighter and more glue'")
@click.option("--reference", "-r", type=click.Path(exists=True), default=None,
              help="Reference track (WAV/FLAC preferred) for spectrum + loudness matching")
@click.option("--eq-strength", default=0.55, show_default=True,
              help="How strongly to match the reference spectrum (0.0–1.0)")
@click.option("--no-auto-stage", is_flag=True,
              help="Disable dynamics-aware gain staging")
@click.option("--no-grok", is_flag=True,
              help="Force offline keyword parser (skip Grok API even if key is set)")
@click.option("--report", is_flag=True, help="Print full JSON report")
@click.option("--stems", is_flag=True,
              help="Treat input as a folder of stems (mix them first, then master)")
@click.option("--format", "fmt", type=click.Choice(["flac", "flac24", "wav32", "wav24", "mp3"]),
              default="flac", show_default=True,
              help="Export: flac=16-bit RouteNote, flac24=archive, wav32/wav24=archive, mp3=320k")
@click.option("--sr", "target_sr", default=44100, show_default=True,
              help="Export sample rate (44100 preferred). 0 = keep original")
@click.option("--declip", default=0.0, show_default=True,
              help="De-clip strength 0..1 (Suno source repair)")
@click.option("--width", default=1.0, show_default=True,
              help="M/S stereo width (0=mono, 1=original, >1=wider)")
@click.option("--mono-bass", default=120.0, show_default=True,
              help="Force side channel mono below this Hz")
@click.option("--exciter", default=0.0, show_default=True,
              help="Harmonic exciter drive 0..1 (keep low)")
@click.option("--exciter-mix", default=0.2, show_default=True,
              help="Exciter wet mix 0..1")
@click.option("--no-provenance", is_flag=True,
              help="Skip provenance sidecar / metadata stamp")
@click.option("--watermark", is_flag=True,
              help="Embed soft inaudible audio watermark (keyed to D.Devine)")
@click.option("--watermark-level", default=-48.0, show_default=True,
              help="Watermark level in dB (default -48, keep very low)")
def main(input_path, output, preset, target_lufs, target_tp, prompt, reference, eq_strength,
         no_auto_stage, no_grok, report, stems, fmt, target_sr, declip, width,
         mono_bass, exciter, exciter_mix, no_provenance, watermark, watermark_level):
    """
    Master a single file, a whole folder (batch), or a stems folder.
    Optionally match a real reference track (spectrum + loudness).
    """
    input_path = Path(input_path)
    use_auto = not no_auto_stage
    use_grok = not no_grok
    target_sr = None if target_sr == 0 else target_sr
    embed_prov = not no_provenance

    preset_cfg = PRESETS[preset]
    if target_lufs is None:
        target_lufs = preset_cfg["target_lufs"]
    if target_tp is None:
        target_tp = preset_cfg["target_tp"]
    click.echo(f"Preset: {preset} — {preset_cfg['label']}  ({target_lufs} LUFS / {target_tp} dBTP)")

    # Load reference once if supplied
    ref_audio, ref_sr = None, None
    if reference:
        from utils import load_audio, ensure_stereo
        ref_audio, ref_sr = load_audio(reference)
        ref_audio = ensure_stereo(ref_audio)
        click.echo(f"Reference loaded: {Path(reference).name}")

    # ------------------------------------------------------------------
    # Stem mode: sum all audio files in the folder, then master the sum
    # ------------------------------------------------------------------
    if stems:
        if not input_path.is_dir():
            raise click.ClickException("--stems requires a directory")
        stem_files = sorted(
            p for p in input_path.iterdir()
            if p.suffix.lower() in SUPPORTED_EXT
        )
        if not stem_files:
            raise click.ClickException("No audio files found in stems folder")

        click.echo(f"Mixing {len(stem_files)} stems ...")
        mixed = None
        sr = None
        for f in stem_files:
            audio, s = load_audio(f)
            audio = ensure_stereo(audio)
            if mixed is None:
                mixed = audio
                sr = s
            else:
                # Simple sum (pad/truncate to shortest for prototype)
                min_len = min(mixed.shape[1], audio.shape[1])
                mixed = mixed[:, :min_len] + audio[:, :min_len]

        # Normalize mix a bit before mastering
        peak = np.max(np.abs(mixed))
        if peak > 0.95:
            mixed *= 0.95 / peak

        out = Path(output) if output else input_path / "mastered_from_stems.wav"
        chain_params = suggest_parameters(
            prompt=prompt, audio=mixed, sr=sr, use_grok=use_grok,
            ref_audio=ref_audio, ref_sr=ref_sr, eq_strength=eq_strength,
        )
        processed, stats = apply_chain(
            mixed, sr,
            target_lufs=target_lufs,
            target_tp=target_tp,
            use_auto_staging=use_auto,
            chain_params=chain_params,
            declip_strength=declip,
            width=width,
            mono_bass_hz=mono_bass,
            exciter_drive=exciter,
            exciter_mix=exciter_mix,
            watermark=watermark,
            watermark_level_db=watermark_level,
        )
        out = save_audio(out, processed, sr, fmt=fmt, target_sr=target_sr)
        if embed_prov:
            stamp = build_stamp(target_lufs=target_lufs, target_tp=target_tp, prompt=prompt)
            apply_provenance(out, stamp, title="stems_master")
        click.echo(f"Saved stem master → {out}")
        if report:
            click.echo(json.dumps(stats, indent=2, default=str))
        else:
            a = stats.get("after_final", {})
            src = stats.get("param_source", "?")
            click.echo(
                f"  Final: {a.get('integrated_lufs', 0):.1f} LUFS  |  "
                f"TP {a.get('true_peak_dbtp', 0):.1f} dBTP  |  params: {src}"
            )
        return

    # ------------------------------------------------------------------
    # Batch mode (directory of full tracks)
    # ------------------------------------------------------------------
    if input_path.is_dir():
        files: List[Path] = sorted(
            p for p in input_path.iterdir()
            if p.suffix.lower() in SUPPORTED_EXT
        )
        if not files:
            raise click.ClickException("No supported audio files found")

        out_dir = Path(output) if output else input_path / "mastered"
        out_dir.mkdir(parents=True, exist_ok=True)

        click.echo(f"Batch processing {len(files)} files → {out_dir}")
        for f in files:
            out_file = out_dir / f"{f.stem}_mastered.wav"
            process_one(
                f, out_file, target_lufs, target_tp, prompt,
                use_auto, use_grok, report,
                ref_audio=ref_audio, ref_sr=ref_sr, eq_strength=eq_strength,
                fmt=fmt, target_sr=target_sr,
                declip_strength=declip, width=width, mono_bass_hz=mono_bass,
                exciter_drive=exciter, exciter_mix=exciter_mix,
                embed_provenance=embed_prov,
                watermark=watermark, watermark_level_db=watermark_level,
            )
        return

    # ------------------------------------------------------------------
    # Single file
    # ------------------------------------------------------------------
    ext = {"flac": ".flac", "flac24": ".flac", "wav32": ".wav", "wav24": ".wav", "mp3": ".mp3"}.get(fmt, ".flac")
    out = Path(output) if output else input_path.with_name(f"{input_path.stem}_mastered{ext}")
    process_one(
        input_path, out, target_lufs, target_tp, prompt,
        use_auto, use_grok, report,
        ref_audio=ref_audio, ref_sr=ref_sr, eq_strength=eq_strength,
        fmt=fmt, target_sr=target_sr,
        declip_strength=declip, width=width, mono_bass_hz=mono_bass,
        exciter_drive=exciter, exciter_mix=exciter_mix,
        embed_provenance=embed_prov,
        watermark=watermark, watermark_level_db=watermark_level,
    )


# Need numpy for the stems peak check
import numpy as np

if __name__ == "__main__":
    main()
