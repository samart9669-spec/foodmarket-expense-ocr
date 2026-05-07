import base64

import google.generativeai as genai
import streamlit as st

_MODEL = "gemini-2.5-flash-lite"

_PROMPT = (
    "Extract all text from this file exactly as it appears. "
    "If it is a payment slip or receipt, include all numbers, dates, names, and amounts. "
    "Return plain text only."
)

_MIME = {
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "pdf":  "application/pdf",
}


def _get_model() -> genai.GenerativeModel:
    genai.configure(api_key=st.secrets["GEMINI_API_KEY"])
    return genai.GenerativeModel(_MODEL)


def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    """Extract text from JPG, PNG, PDF, or CSV using Gemini 2.5 Flash Lite."""
    ext = filename.rsplit(".", 1)[-1].lower()

    if ext == "csv":
        return file_bytes.decode("utf-8", errors="replace")

    mime_type = _MIME.get(ext, "application/octet-stream")
    response = _get_model().generate_content([
        {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(file_bytes).decode()}},
        _PROMPT,
    ])
    return response.text
