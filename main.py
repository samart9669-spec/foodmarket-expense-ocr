import datetime
import sys
import uuid
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).parent))
from config import CATEGORY_KEYWORDS
from database.db_manager import (
    get_all_transactions,
    get_verified_transactions,
    init_db,
    insert_transaction,
)
from modules.data_parser import parse_slip
from modules.drive_uploader import upload_expense_files
from modules.ocr_processor import extract_text_from_file
from modules.sheets_updater import sync_to_sheets

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(page_title="Expense Tracker · OCR", page_icon="🧾", layout="wide")
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap');
html, body, [class*="css"] { font-family: 'Sarabun', sans-serif !important; }
.stApp { background-color: #F1F5F9; }
.block-container { padding: 1.5rem 1.5rem 3rem !important; max-width: 960px; }
.hero {
    background: linear-gradient(135deg, #065F46 0%, #10B981 100%);
    border-radius: 16px; padding: 24px 28px 20px;
    margin-bottom: 24px; box-shadow: 0 4px 24px rgba(16,185,129,0.25);
}
.hero-title { font-size: 22px; font-weight: 800; color: #fff; margin: 0 0 4px; }
.hero-sub   { font-size: 13px; color: rgba(255,255,255,0.8); margin: 0 0 10px; }
.hero-badge {
    display: inline-block; background: #FCD34D; color: #065F46;
    font-size: 10px; font-weight: 800; padding: 2px 10px;
    border-radius: 20px; letter-spacing: 1.5px; text-transform: uppercase;
}
.card {
    background: #fff; border: 1px solid #E2E8F0; border-radius: 14px;
    padding: 18px 22px 14px; margin-bottom: 16px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.06);
}
.card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.step-num {
    background: linear-gradient(135deg, #10B981, #059669);
    color: #fff; font-size: 12px; font-weight: 700;
    width: 28px; height: 28px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.card-title { color: #1E293B; font-size: 15px; font-weight: 700; margin: 0; }
[data-testid="metric-container"] {
    background: linear-gradient(135deg, #ECFDF5, #D1FAE5) !important;
    border: 1px solid #A7F3D0 !important; border-radius: 12px !important;
    padding: 14px 20px !important;
}
[data-testid="stMetricValue"] { color: #065F46 !important; font-size: 26px !important; font-weight: 800 !important; }
[data-testid="stMetricLabel"] { color: #10B981 !important; font-size: 13px !important; font-weight: 600 !important; }
hr { border-color: #E2E8F0 !important; margin: 16px 0 !important; }
#MainMenu, footer, header { visibility: hidden; }
</style>
""", unsafe_allow_html=True)

# ── Init DB ───────────────────────────────────────────────────────────────────
init_db()

# ── Hero ──────────────────────────────────────────────────────────────────────
st.markdown("""
<div class="hero">
    <div class="hero-title">🧾 Expense Tracker · OCR</div>
    <div class="hero-sub">บันทึกค่าใช้จ่ายอัตโนมัติ · สแกนสลิป → Google Drive & Sheets</div>
    <span class="hero-badge">OCR Powered</span>
</div>
""", unsafe_allow_html=True)

# ── Tabs ──────────────────────────────────────────────────────────────────────
tab_submit, tab_history, tab_sync = st.tabs([
    "📤 บันทึกรายจ่าย", "📋 รายการทั้งหมด", "☁️ ซิงค์ Google Sheets",
])

# ─────────────────────────────────────────────────────────────────────────────
# TAB 1 — บันทึกรายจ่าย
# ─────────────────────────────────────────────────────────────────────────────
with tab_submit:
    st.markdown("""
    <div class="card">
        <div class="card-header">
            <span class="step-num">1</span>
            <span class="card-title">อัปโหลดสลิปและเอกสารแนบ</span>
        </div>
    </div>""", unsafe_allow_html=True)

    col_slip, col_attach = st.columns(2)
    with col_slip:
        slip_file = st.file_uploader(
            "สลิปการชำระเงิน (จำเป็น)",
            type=["jpg", "jpeg", "png", "pdf", "csv"],
            key="slip_upload",
        )
    with col_attach:
        attach_file = st.file_uploader(
            "เอกสารแนบ / ใบแจ้งหนี้ (ไม่บังคับ)",
            type=["jpg", "jpeg", "png", "pdf"],
            key="attach_upload",
        )

    note = st.text_area(
        "หมายเหตุ",
        placeholder="เช่น ซื้อวัตถุดิบจากตลาดไท, ค่าน้ำมัน, ค่าแพ็กเกจ",
        height=80,
    )

    if slip_file:
        slip_bytes = slip_file.read()

        st.markdown("""
        <div class="card">
            <div class="card-header">
                <span class="step-num">2</span>
                <span class="card-title">ผลการสแกน OCR · ตรวจสอบและแก้ไขได้</span>
            </div>
        </div>""", unsafe_allow_html=True)

        @st.cache_data(show_spinner=False)
        def _run_ocr(file_bytes: bytes, filename: str) -> str:
            return extract_text_from_file(file_bytes, filename)

        with st.spinner("กำลังสแกนด้วย Gemini 2.5 Flash Lite..."):
            try:
                ocr_text = _run_ocr(slip_bytes, slip_file.name)
                parsed = parse_slip(ocr_text, note)
            except Exception as exc:
                st.warning(f"OCR ไม่สำเร็จ: {exc} — กรุณากรอกข้อมูลเอง")
                ocr_text = ""
                parsed = {
                    "transfer_date": None, "amount": None,
                    "receiver_name": "ไม่ระบุ", "category": "อื่นๆ",
                }

        if ocr_text:
            with st.expander("ข้อความดิบที่ OCR อ่านได้"):
                st.text(ocr_text)

        col_a, col_b = st.columns(2)
        with col_a:
            default_date = (
                datetime.date.fromisoformat(parsed["transfer_date"])
                if parsed.get("transfer_date") else datetime.date.today()
            )
            transfer_date = st.date_input("วันที่โอนเงิน", value=default_date)
            amount = st.number_input(
                "จำนวนเงิน (บาท)",
                value=float(parsed["amount"]) if parsed.get("amount") else 0.0,
                min_value=0.0, step=0.01, format="%.2f",
            )
        with col_b:
            receiver_name = st.text_input(
                "ผู้รับเงิน / ร้านค้า",
                value=parsed.get("receiver_name", ""),
            )
            cat_opts = list(CATEGORY_KEYWORDS.keys())
            default_cat = parsed.get("category", "อื่นๆ")
            category = st.selectbox(
                "หมวดหมู่ค่าใช้จ่าย",
                options=cat_opts,
                index=cat_opts.index(default_cat) if default_cat in cat_opts else 0,
            )

        st.markdown("""
        <div class="card">
            <div class="card-header">
                <span class="step-num">3</span>
                <span class="card-title">ยืนยันและบันทึก</span>
            </div>
        </div>""", unsafe_allow_html=True)

        if st.button("✅ ยืนยันและบันทึก", type="primary", use_container_width=True):
            if amount <= 0:
                st.warning("กรุณาระบุจำนวนเงินที่มากกว่า 0")
            else:
                today = datetime.date.today()
                txn_id = f"EXP-{today.strftime('%Y%m%d')}-{str(uuid.uuid4())[:6].upper()}"
                year_month = today.strftime("%Y-%m")
                slip_url, attach_url = "", ""

                with st.spinner("กำลังอัปโหลดไฟล์ขึ้น Google Drive..."):
                    try:
                        ab = attach_file.read() if attach_file else None
                        an = attach_file.name if attach_file else None
                        slip_url, attach_url = upload_expense_files(
                            txn_id, year_month, slip_bytes, slip_file.name, ab, an,
                        )
                        st.success("อัปโหลด Google Drive เรียบร้อย ✅")
                    except Exception as exc:
                        st.warning(f"Drive upload ล้มเหลว: {exc} — บันทึกโดยไม่มี URL")

                insert_transaction({
                    "transaction_id": txn_id,
                    "transfer_date":  str(transfer_date),
                    "amount":         amount,
                    "receiver_name":  receiver_name,
                    "category":       category,
                    "note":           note,
                    "slip_url":       slip_url,
                    "attachment_url": attach_url,
                    "status":         "verified",
                })
                st.success(f"บันทึกสำเร็จ! รหัสรายการ: **{txn_id}**")
                st.balloons()
    else:
        st.info("กรุณาอัปโหลดรูปสลิปการชำระเงินก่อน (ขั้นตอนที่ 1)")

# ─────────────────────────────────────────────────────────────────────────────
# TAB 2 — รายการทั้งหมด
# ─────────────────────────────────────────────────────────────────────────────
with tab_history:
    st.markdown("""
    <div class="card">
        <div class="card-header">
            <span class="step-num">📋</span>
            <span class="card-title">รายการค่าใช้จ่ายทั้งหมด</span>
        </div>
    </div>""", unsafe_allow_html=True)

    records = get_all_transactions()
    if records:
        import pandas as pd
        df = pd.DataFrame(records)
        display = df[[
            "transaction_id", "transfer_date", "amount",
            "receiver_name", "category", "note", "status",
        ]].copy()
        display.columns = ["รหัส", "วันที่", "จำนวนเงิน (฿)", "ผู้รับ", "หมวดหมู่", "หมายเหตุ", "สถานะ"]
        display["จำนวนเงิน (฿)"] = display["จำนวนเงิน (฿)"].map(lambda x: f"{x:,.2f}")
        st.dataframe(display, use_container_width=True, hide_index=True)

        col1, col2, col3 = st.columns(3)
        total       = sum(r.get("amount", 0) for r in records)
        verified_ct = sum(1 for r in records if r.get("status") == "verified")
        uploaded_ct = sum(1 for r in records if r.get("status") == "uploaded")
        col1.metric("ยอดรวม", f"฿{total:,.2f}")
        col2.metric("รอซิงค์ (verified)", verified_ct)
        col3.metric("ซิงค์แล้ว (uploaded)", uploaded_ct)

        if st.button("🔄 รีเฟรชรายการ"):
            st.rerun()
    else:
        st.info("ยังไม่มีรายการค่าใช้จ่าย — เริ่มบันทึกได้ที่แถบ 'บันทึกรายจ่าย'")

# ─────────────────────────────────────────────────────────────────────────────
# TAB 3 — ซิงค์ Google Sheets
# ─────────────────────────────────────────────────────────────────────────────
with tab_sync:
    st.markdown("""
    <div class="card">
        <div class="card-header">
            <span class="step-num">☁️</span>
            <span class="card-title">ซิงค์ข้อมูลไปยัง Google Sheets</span>
        </div>
    </div>""", unsafe_allow_html=True)

    verified_list = get_verified_transactions()
    st.info(
        f"พบ **{len(verified_list)}** รายการที่รอซิงค์ (สถานะ verified)\n\n"
        "ระบบจะส่งข้อมูลไปยัง Google Sheets แถบ **Master Data** "
        "และอัปเดตสถานะเป็น **uploaded** หลังส่งสำเร็จ"
    )

    if st.button("☁️ ซิงค์ไปยัง Google Sheets", type="primary", use_container_width=True):
        if not verified_list:
            st.info("ไม่มีรายการที่ต้องซิงค์")
        else:
            with st.spinner("กำลังซิงค์..."):
                try:
                    synced = sync_to_sheets()
                    st.success(f"ซิงค์สำเร็จ! ส่งข้อมูล **{synced}** รายการไปยัง Sheets แล้ว 🎉")
                    st.balloons()
                except Exception as exc:
                    st.error(f"ซิงค์ไม่สำเร็จ: {exc}")
