"""
Grok-driven parameter suggestions from natural language.

- Tries the real xAI Grok API first (OpenAI-compatible).
- Falls back to a transparent keyword parser if no API key or request fails.
- Always returns a full, clamped parameter dict ready for the mastering chain.
"""
from __future__ import annotations

import os
import re
import json
import numpy as np
from typing import Optional, Any
from analysis import spectral_balance, suggest_eq_from_spectrum, match_reference


# ---------------------------------------------------------------------------
# Defaults & keyword fallback (kept for offline / transparency)
# ---------------------------------------------------------------------------

KEYWORD_MAP = {
    # Brightness / air
    r"\b(brighter|more air|sparkle|open up)\b": {"high_shelf_gain": +1.5, "presence_gain": +0.8},
    r"\b(darker|duller|less air|muddy)\b": {"high_shelf_gain": -1.5, "presence_gain": -0.8},
    # Low end
    r"\b(more bass|heavier|fatter|thicker)\b": {"low_shelf_gain": +1.5},
    r"\b(less bass|thinner|tighter low)\b": {"low_shelf_gain": -1.5, "hp_freq": 40.0},
    # Glue / compression
    r"\b(more glue|tighter|punchier|squash)\b": {"comp_ratio": 3.5, "comp_threshold": -20.0},
    r"\b(less compression|more dynamic|open dynamics)\b": {"comp_ratio": 1.8, "comp_threshold": -14.0},
    # Presence
    r"\b(more presence|forward|vocal forward)\b": {"presence_gain": +1.5},
    r"\b(less presence|recessed)\b": {"presence_gain": -1.2},
}

DEFAULT_PARAMS = {
    "hp_freq": 30.0,
    "low_shelf_gain": 0.5,
    "low_shelf_freq": 120.0,
    "presence_gain": 1.0,
    "presence_freq": 3500.0,
    "presence_q": 0.8,
    "high_shelf_gain": 1.5,
    "high_shelf_freq": 10000.0,
    "comp_threshold": -18.0,
    "comp_ratio": 2.5,
    "comp_attack": 15.0,
    "comp_release": 100.0,
    "limiter_threshold": -1.0,
}

# Allowed keys Grok is allowed to return (prevents hallucination of random params)
ALLOWED_KEYS = set(DEFAULT_PARAMS.keys())


def parse_prompt_keywords(prompt: str) -> dict:
    """Offline keyword parser – fully transparent fallback."""
    prompt = prompt.lower().strip()
    overrides = {}
    for pattern, adjustments in KEYWORD_MAP.items():
        if re.search(pattern, prompt):
            overrides.update(adjustments)
    return overrides


# ---------------------------------------------------------------------------
# Real Grok API call
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an expert mastering engineer specialising in AI-generated music (Suno, Udio, etc.).
Your job is to translate a short natural-language request into a JSON object of mastering parameters.

Return ONLY a valid JSON object with any subset of these keys (all values must be numbers):
{
  "hp_freq": float,          // high-pass cutoff Hz (20-80)
  "low_shelf_gain": float,   // dB (-4 to +4)
  "low_shelf_freq": float,   // Hz (80-200)
  "presence_gain": float,    // dB (-3 to +4)
  "presence_freq": float,    // Hz (2000-5000)
  "presence_q": float,       // 0.5-2.0
  "high_shelf_gain": float,  // dB (-3 to +5)
  "high_shelf_freq": float,  // Hz (6000-14000)
  "comp_threshold": float,   // dB (-30 to -8)
  "comp_ratio": float,       // 1.2-6.0
  "comp_attack": float,      // ms (5-50)
  "comp_release": float,     // ms (50-300)
  "limiter_threshold": float // dBTP (-2.0 to -0.5)
}

Rules for AI-generated tracks:
- Prefer gentle changes (AI material is often already processed).
- Never suggest extreme boosts or high ratios.
- If the user asks for "brighter", raise high_shelf_gain and/or presence_gain moderately.
- If they ask for "more glue", raise ratio a little and lower threshold.
- Keep limiter_threshold around -1.0 unless explicitly asked otherwise.
- Output pure JSON only – no markdown, no explanation.
"""


def call_grok_api(prompt: str, model: str = "grok-4.5") -> Optional[dict]:
    """
    Call the official xAI Grok API (OpenAI-compatible).
    Requires environment variable XAI_API_KEY.
    Returns a dict of parameter overrides or None on failure.
    """
    api_key = os.getenv("XAI_API_KEY")
    if not api_key:
        return None

    try:
        # Prefer the official openai package if available
        from openai import OpenAI
        client = OpenAI(
            api_key=api_key,
            base_url="https://api.x.ai/v1",
        )
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=400,
        )
        content = response.choices[0].message.content.strip()
    except Exception:
        # Fallback to raw requests if openai package missing or any error
        try:
            import requests
            resp = requests.post(
                "https://api.x.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 400,
                },
                timeout=30,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"].strip()
        except Exception:
            return None

    # Extract JSON (handle possible markdown fencing)
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)

    try:
        data = json.loads(content)
        if not isinstance(data, dict):
            return None
        # Keep only allowed keys and numeric values
        clean = {}
        for k, v in data.items():
            if k in ALLOWED_KEYS and isinstance(v, (int, float)):
                clean[k] = float(v)
        return clean
    except json.JSONDecodeError:
        return None


def suggest_parameters(
    prompt: Optional[str] = None,
    audio=None,
    sr: Optional[int] = None,
    base: Optional[dict] = None,
    use_grok: bool = True,
    grok_model: str = "grok-4.5",
    ref_audio=None,
    ref_sr: Optional[int] = None,
    eq_strength: float = 0.55,
) -> dict:
    """
    Combine (priority order, later stages override earlier):
    1. Defaults
    2. Built-in spectral curve  OR  real reference-track matching
    3. Natural-language prompt → Grok API (or keyword fallback)

    Everything is still clamped for safety on AI-generated material.
    """
    params = dict(base or DEFAULT_PARAMS)
    source = "defaults"
    match_info = None

    # 1. Spectral / reference-track suggestions
    if audio is not None and sr is not None:
        if ref_audio is not None and ref_sr is not None:
            # Real reference-track matching
            match_info = match_reference(
                audio, sr, ref_audio, ref_sr,
                match_loudness=True,
                match_spectrum=True,
                eq_strength=eq_strength,
            )
            for k, v in match_info.get("suggested_params", {}).items():
                if k in params:
                    params[k] = params.get(k, 0.0) + v
            source = "reference-track"
        else:
            # Built-in Spotify-ish curve
            balance = spectral_balance(audio, sr)
            eq_suggestions = suggest_eq_from_spectrum(balance, strength=0.5)
            params["low_shelf_gain"] = params.get("low_shelf_gain", 0.5) + eq_suggestions.get("bass", 0.0) * 0.5
            params["presence_gain"] = params.get("presence_gain", 1.0) + eq_suggestions.get("presence", 0.0) * 0.4
            params["high_shelf_gain"] = params.get("high_shelf_gain", 1.5) + eq_suggestions.get("air", 0.0) * 0.4
            source = "spectral + defaults"

    # 2. Prompt → Grok or keywords (highest priority)
    if prompt:
        overrides = None
        if use_grok:
            overrides = call_grok_api(prompt, model=grok_model)
            if overrides:
                source = f"{source} + grok-api" if source != "defaults" else "grok-api"
        if overrides is None:
            overrides = parse_prompt_keywords(prompt)
            source = f"{source} + keyword" if source != "defaults" else "keyword-fallback"

        params.update(overrides)

    # 3. Safety clamps for AI-generated material
    params["hp_freq"] = float(np.clip(params["hp_freq"], 20.0, 80.0))
    params["low_shelf_gain"] = float(np.clip(params["low_shelf_gain"], -4.0, 4.0))
    params["low_shelf_freq"] = float(np.clip(params["low_shelf_freq"], 60.0, 250.0))
    params["presence_gain"] = float(np.clip(params["presence_gain"], -3.0, 4.0))
    params["presence_freq"] = float(np.clip(params["presence_freq"], 1500.0, 6000.0))
    params["presence_q"] = float(np.clip(params["presence_q"], 0.4, 2.5))
    params["high_shelf_gain"] = float(np.clip(params["high_shelf_gain"], -3.0, 5.0))
    params["high_shelf_freq"] = float(np.clip(params["high_shelf_freq"], 5000.0, 16000.0))
    params["comp_threshold"] = float(np.clip(params["comp_threshold"], -30.0, -8.0))
    params["comp_ratio"] = float(np.clip(params["comp_ratio"], 1.2, 6.0))
    params["comp_attack"] = float(np.clip(params["comp_attack"], 5.0, 80.0))
    params["comp_release"] = float(np.clip(params["comp_release"], 30.0, 400.0))
    params["limiter_threshold"] = float(np.clip(params["limiter_threshold"], -2.5, -0.3))

    # Attach metadata
    params["_source"] = source
    if match_info is not None:
        params["_reference_match"] = {
            "source_lufs": match_info["source_lufs"],
            "reference_lufs": match_info["reference_lufs"],
            "lufs_delta": match_info["lufs_delta"],
            "suggested_gain_offset_db": match_info.get("suggested_gain_offset_db"),
        }
    return params
