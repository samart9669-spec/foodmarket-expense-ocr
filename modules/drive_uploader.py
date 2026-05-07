import io
import json
import mimetypes

import streamlit as st
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"]


@st.cache_resource
def _get_drive_service():
    creds_info = json.loads(st.secrets["GCP_SERVICE_ACCOUNT"])
    creds = Credentials.from_service_account_info(creds_info, scopes=_DRIVE_SCOPES)
    return build("drive", "v3", credentials=creds)


def _get_or_create_folder(service, name: str, parent_id=None) -> str:
    query = (
        f"name='{name}' and mimeType='application/vnd.google-apps.folder'"
        f" and trashed=false"
    )
    if parent_id:
        query += f" and '{parent_id}' in parents"
    results = service.files().list(q=query, fields="files(id)", pageSize=1).execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]
    meta = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        meta["parents"] = [parent_id]
    folder = service.files().create(body=meta, fields="id").execute()
    return folder["id"]


def _make_public(service, file_id: str):
    service.permissions().create(
        fileId=file_id,
        body={"role": "reader", "type": "anyone"},
    ).execute()


def _upload_file(service, file_bytes: bytes, filename: str, folder_id: str) -> str:
    mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type)
    meta = {"name": filename, "parents": [folder_id]}
    uploaded = service.files().create(
        body=meta, media_body=media, fields="id,webViewLink"
    ).execute()
    _make_public(service, uploaded["id"])
    return uploaded.get("webViewLink", "")


def upload_expense_files(
    transaction_id: str,
    year_month: str,
    slip_bytes: bytes,
    slip_name: str,
    attachment_bytes=None,
    attachment_name=None,
):
    """อัปโหลด slip + เอกสารแนบไปยัง Google Drive และคืน URL ทั้งสอง"""
    service = _get_drive_service()
    parent_id = st.secrets.get("DRIVE_FOLDER_ID", None)
    root_id   = _get_or_create_folder(service, "Expense Tracking", parent_id)
    month_id  = _get_or_create_folder(service, year_month, root_id)
    folder_id = _get_or_create_folder(service, transaction_id, month_id)

    slip_url   = _upload_file(service, slip_bytes, slip_name, folder_id)
    attach_url = ""
    if attachment_bytes and attachment_name:
        attach_url = _upload_file(service, attachment_bytes, attachment_name, folder_id)
    return slip_url, attach_url
