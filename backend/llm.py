"""Provider client for the optional AI features. Server side only: keys come from environment variables and never
reach the browser. Supports Google Gemini (default when GEMINI_API_KEY is set) and Anthropic (ANTHROPIC_API_KEY).
Isolated here so tests can replace `generate` and so no other module needs to know which provider is in use."""
import os

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"  # override with GEMINI_MODEL; check current names in Google AI Studio


def provider():
    """'gemini', 'anthropic' or '' (none). AI_PROVIDER can force one when both keys exist."""
    want = os.environ.get("AI_PROVIDER", "").strip().lower()
    has_g = bool(os.environ.get("GEMINI_API_KEY", "").strip())
    has_a = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
    if want == "anthropic":
        return "anthropic" if has_a else ""
    if want == "gemini":
        return "gemini" if has_g else ""
    return "gemini" if has_g else ("anthropic" if has_a else "")


def available():
    return bool(provider())


def model_name():
    p = provider()
    if p == "gemini":
        return os.environ.get("GEMINI_MODEL", "").strip() or DEFAULT_GEMINI_MODEL
    return os.environ.get("AI_MODEL", "").strip() or "claude-sonnet-5-5"


def generate(system, turns, max_tokens=800, timeout=15.0):
    """turns: list of (role, text) with role 'user' or 'model', ending with a user turn. Returns the reply text.
    Raises on any network or provider error; callers decide the fallback."""
    import httpx
    p = provider()
    if p == "gemini":
        body = {"systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": r, "parts": [{"text": t}]} for r, t in turns],
                "generationConfig": {"maxOutputTokens": max_tokens}}
        r = httpx.post(f"{GEMINI_BASE}/models/{model_name()}:generateContent",
                       headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"], "content-type": "application/json"},
                       json=body, timeout=httpx.Timeout(timeout))
        r.raise_for_status()
        data = r.json()
        if (data.get("promptFeedback") or {}).get("blockReason"):
            return ""
        cands = data.get("candidates") or []
        if not cands:
            return ""
        return "".join(x.get("text", "") for x in (cands[0].get("content") or {}).get("parts", []) if isinstance(x, dict))
    if p == "anthropic":
        r = httpx.post(os.environ.get("AI_API_URL", "https://api.anthropic.com/v1/messages"),
                       headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
                       json={"model": model_name(), "max_tokens": max_tokens, "system": system,
                             "messages": [{"role": "assistant" if r_ == "model" else "user", "content": t} for r_, t in turns]},
                       timeout=httpx.Timeout(timeout))
        r.raise_for_status()
        return "".join(x.get("text", "") for x in r.json().get("content", []) if x.get("type") == "text")
    raise RuntimeError("no AI provider configured")
