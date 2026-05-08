import io
import json

import streamlit as st
from google.cloud import storage
from google.oauth2.service_account import Credentials


@st.cache_resource
def _get_client():
    creds_info = json.loads(st.secrets["GCP_SERVICE_ACCOUNT"])
    creds = Credentials.from_service_account_info(creds_info)
    return storage.Client(credentials=creds, project=creds_info["project_id"])


def _upload(file_bytes: bytes, blob_name: str) -> str:
    bucket = _get_client().bucket(st.secrets["GCS_BUCKET_NAME"])
    blob = bucket.blob(blob_name)
    blob.upload_from_file(io.BytesIO(file_bytes))
    blob.make_public()
    return blob.public_url


def upload_expense_files(
    transaction_id: str,
    year_month: str,
    slip_bytes: bytes,
    slip_name: str,
    attachment_bytes=None,
    attachment_name=None,
):
    """อัปโหลด slip + เอกสารแนบไปยัง Google Cloud Storage และคืน URL ทั้งสอง"""
    base = f"{year_month}/{transaction_id}"
    slip_url = _upload(slip_bytes, f"{base}/{slip_name}")
    attach_url = ""
    if attachment_bytes and attachment_name:
        attach_url = _upload(attachment_bytes, f"{base}/{attachment_name}")
    return slip_url, attach_url
