import json
import sys
from pathlib import Path

import gspread
import streamlit as st
from google.oauth2.service_account import Credentials

sys.path.insert(0, str(Path(__file__).parent.parent))
from database.db_manager import get_verified_transactions, update_status

_SHEETS_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


@st.cache_resource
def _get_gspread_client():
    creds_info = json.loads(st.secrets["GCP_SERVICE_ACCOUNT"])
    creds = Credentials.from_service_account_info(creds_info, scopes=_SHEETS_SCOPES)
    return gspread.authorize(creds)


def sync_to_sheets() -> int:
    """ดึง verified records → append ไปยัง Google Sheets → อัปเดตสถานะเป็น uploaded"""
    pending = get_verified_transactions()
    if not pending:
        return 0

    client = _get_gspread_client()
    sheet = client.open_by_key(st.secrets["EXPENSE_SHEET_ID"]).worksheet("Master Data")

    rows = []
    for txn in pending:
        slip_formula = (
            f'=HYPERLINK("{txn["slip_url"]}", "ดูสลิป")'
            if txn.get("slip_url") else ""
        )
        attach_formula = (
            f'=HYPERLINK("{txn["attachment_url"]}", "ดูเอกสาร")'
            if txn.get("attachment_url") else ""
        )
        rows.append([
            txn.get("transfer_date", ""),
            txn.get("category", ""),
            txn.get("amount", 0),
            txn.get("receiver_name", ""),
            txn.get("note", ""),
            slip_formula,
            attach_formula,
            txn.get("transaction_id", ""),
        ])

    sheet.append_rows(rows, value_input_option="USER_ENTERED")
    for txn in pending:
        update_status(txn["transaction_id"], "uploaded")
    return len(rows)
