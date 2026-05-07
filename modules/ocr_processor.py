import base64
import json

import google.auth.transport.requests
import requests as http_requests
import streamlit as st
from google.oauth2.service_account import Credentials

_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"
_VISION_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


def _get_access_token() -> str:
    creds_info = json.loads(st.secrets["GCP_SERVICE_ACCOUNT"])
    creds = Credentials.from_service_account_info(creds_info, scopes=_VISION_SCOPES)
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token


def extract_text_from_image(image_bytes: bytes) -> str:
    """ส่งรูปสลิปไปยัง Google Cloud Vision API และคืนค่าข้อความที่อ่านได้"""
    token = _get_access_token()
    payload = {
        "requests": [
            {
                "image": {"content": base64.b64encode(image_bytes).decode("utf-8")},
                "features": [{"type": "TEXT_DETECTION", "maxResults": 1}],
            }
        ]
    }
    resp = http_requests.post(
        _VISION_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    resp.raise_for_status()
    annotations = resp.json().get("responses", [{}])[0].get("textAnnotations", [])
    return annotations[0].get("description", "") if annotations else ""
