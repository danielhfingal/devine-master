"""SourceCast Stem Lab — ensemble music source separation.

Example
-------
::

    from sourcecast.stemlab import StemSeparator

    separator = StemSeparator(config="high_quality")
    stems = separator.separate("song.wav")
    # stems["vocals"], stems["drums"], stems["bass"], stems["other"]
"""

from __future__ import annotations

from .config import StemLabConfig, dump_yaml, load_config
from .models.base import ModelNotAvailable, StemModel
from .models.registry import register_backend
from .refine import register_refiner
from .separator import StemSeparator
from .types import STEM_4, STEM_6, Audio, SeparateResult

__all__ = [
    "StemSeparator",
    "StemLabConfig",
    "load_config",
    "dump_yaml",
    "Audio",
    "SeparateResult",
    "STEM_4",
    "STEM_6",
    "StemModel",
    "ModelNotAvailable",
    "register_backend",
    "register_refiner",
]
