# SourceCast Stem Lab

Ensemble music source separation for **Devine Master**. Drop this `sourcecast/` folder into the repo root and call it from the rest of the project.

```python
from sourcecast.stemlab import StemSeparator

separator = StemSeparator(config="high_quality")
stems = separator.separate("song.wav")
# stems["vocals"] / ["drums"] / ["bass"] / ["other"]  → numpy (channels, samples)
```

Print quality comes from a **Demucs v4 + BS-RoFormer + Mel-Band RoFormer** ensemble with per-stem weights, test-time augmentation, overlap-add chunking, and an optional diffusion/consistency refine hook. Machines without checkpoints still run: the spectral HPSS backend keeps the pipeline alive for wiring and audition.

## Install (Windows / F:)

From repo root or Ops (parent of `sourcecast/`):

```bat
pip install -r sourcecast\requirements.txt
set PYTHONPATH=%CD%
python -c "from sourcecast.stemlab import StemSeparator; print('ok')"
```

Presets: `high_quality`, `balanced`, `fast`, `six_stem`, `studio_preview`.

```bat
python -m sourcecast.stemlab song.wav -o .\stems -c studio_preview
python -m sourcecast.stemlab song.wav -o .\stems -c high_quality
```
