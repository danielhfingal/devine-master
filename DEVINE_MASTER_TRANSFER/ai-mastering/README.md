# D.Devine Mastering Prototype

Local, transparent mastering for AI-generated tracks (Suno etc.), calibrated to the D.Devine catalogue.

**Default preset `ddevine`:** −10.1 LUFS · −1.0 dBTP · 44.1 kHz · 16-bit FLAC  
**Preset `spotify`:** −14.0 LUFS · −1.0 dBTP (clean encode / normalization)

## Install

```bash
cd ai-mastering
pip install -r requirements.txt
```

## CLI

```bash
# Catalogue match (default)
python master.py track.wav --preset ddevine --declip 0.7 --exciter 0.12

# Spotify-optimal delivery (RouteNote → Spotify)
python master.py track.wav --preset spotify --format flac --sr 44100 --watermark

# Natural-language hint
python master.py track.wav -p "a bit more air" --report

# Batch folder
python master.py ../tracks/source/ --preset ddevine
```

## Gradio A/B UI

```bash
python app_gradio.py
# http://127.0.0.1:7860
```

## Dataset / profile tools

```bash
python build_dataset.py --verbose   # audio ↔ lyrics ↔ prompts → manifest
python refresh_profile.py           # rebuild LUFS/spectrum profile from mastered/
```

## Pipeline order

1. Optional de-clip  
2. Optional M/S width + mono bass  
3. Optional harmonic exciter  
4. Dynamics-aware gain staging  
5. EQ → compressor → limiter  
6. Predictive LUFS + true-peak limit  
7. Optional soft watermark (−48 dB keyed)  
8. Resample 44.1 kHz → export + provenance  

## Export formats

| Flag | Use |
|------|-----|
| `flac` (default) | **16-bit FLAC @ 44.1 — RouteNote** |
| `flac24` | 24-bit archive |
| `wav32` / `wav24` | Archive only (not RouteNote) |
| `mp3` | 320 kbps sharing |

## Project layout

```
tracks/
├── mastered/          # frozen Spotify masters (reference set)
├── source/            # primary raw exports
│   ├── archive/       # older renders (kept, not deleted)
│   └── pilots/        # generator pilot takes + masters
├── lyrics/
├── prompts/           # original Suno prompts (DNA layer)
├── pilot_got_away/    # pilot brief + style prompts
├── d_devine_dataset_manifest.json
└── d_devine_reference_profile.json
```
