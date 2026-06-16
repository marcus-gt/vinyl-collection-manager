"""Identify a music album from a photo using Claude's vision API.

This is intentionally dependency-light: it calls the Anthropic Messages API
directly over HTTPS (via requests) rather than adding the Anthropic SDK. It only
extracts artist + album; the caller resolves full metadata via Discogs.
"""

import os
import json
import re

import requests

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = "claude-haiku-4-5"

_ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

_PROMPT = (
    "You are identifying a music album from a photo of its cover or vinyl record. "
    "Respond with ONLY a single JSON object and nothing else, in this exact shape:\n"
    '{"artist": string, "album": string, "confidence": "high" | "medium" | "low"}\n'
    "Use the album's primary artist and title as they would appear in a music "
    "database like Discogs. If you cannot identify it with reasonable certainty, "
    'return {"artist": "", "album": "", "confidence": "low"}.'
)


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of the model's text response."""
    text = text.strip()
    # Strip code fences if present.
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def identify_album_from_image(image_b64: str, media_type: str = "image/jpeg") -> dict:
    """Return {'success', 'artist', 'album', 'confidence'} for a base64 image.

    Raises ValueError if the API key is missing or the media type is unsupported.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    if media_type not in _ALLOWED_MEDIA_TYPES:
        raise ValueError(f"Unsupported image type: {media_type}")

    model = os.getenv("ANTHROPIC_MODEL", DEFAULT_MODEL)

    payload = {
        "model": model,
        "max_tokens": 200,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": _PROMPT},
                ],
            }
        ],
    }

    try:
        response = requests.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
            timeout=30,
        )
    except requests.RequestException as e:
        print(f"Anthropic request failed: {e}", flush=True)
        return {
            "success": False,
            "kind": "service",
            "error": f"Image recognition service is unavailable ({type(e).__name__}). Please try again.",
        }

    if response.status_code != 200:
        # Surface the upstream error type so failures are diagnosable without
        # server log access (the API key itself is never included).
        detail = ""
        try:
            err = response.json().get("error", {})
            detail = err.get("type") or err.get("message") or ""
        except ValueError:
            detail = (response.text or "")[:120]
        print(f"Anthropic API error {response.status_code}: {response.text[:500]}", flush=True)
        suffix = f": {detail}" if detail else ""
        return {
            "success": False,
            "kind": "service",
            "error": f"Image recognition service error ({response.status_code}{suffix})",
        }

    try:
        text = response.json()["content"][0]["text"]
        parsed = _extract_json(text)
    except (KeyError, IndexError, ValueError) as e:
        print(f"Could not parse Anthropic response: {e}")
        return {
            "success": False,
            "kind": "service",
            "error": "Could not interpret the recognition result. Please try again.",
        }

    artist = (parsed.get("artist") or "").strip()
    album = (parsed.get("album") or "").strip()
    confidence = (parsed.get("confidence") or "low").strip().lower()

    if not artist or not album:
        return {
            "success": False,
            "kind": "not_found",
            "error": "Could not identify an album in the photo. Try a clearer shot of the cover.",
        }

    return {
        "success": True,
        "artist": artist,
        "album": album,
        "confidence": confidence,
    }
