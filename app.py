import streamlit as st
import pandas as pd
import json
import math
import datetime
import google.generativeai as genai
from PIL import Image
import gspread
from google.oauth2.service_account import Credentials

# --- CONFIG ---
EXPENSE_CATEGORIES = [
    "วัตถุดิบ",
    "บรรจุภัณฑ์",
    "ค่าไฟ/ค่าน้ำ",
    "ค่าแรง",
    "อุปกรณ์/เครื่องมือ",
    "ค่าขนส่ง",
    "อื่นๆ"
]

# --- Google Sheets ---
@st.cache_resource
def get_gspread_client():
    creds_info = json.loads(st.secrets["GCP_SERVICE_ACCOUNT"])
    creds = Credentials.from_service_account_info(
        creds_info,
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    return gspread.authorize(creds)

def get_expense_sheet():
    return get_gspread_client().open_by_key(st.secrets["SHEET_ID"]).worksheet("Expenses")

def clean_for_sheets(value):
    if value is None:
        return ""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return ""
    return value

# --- AI OCR ---
def extract_expenses(images, model_version):
    genai.configure(api_key=st.secrets["GEMINI_API_KEY"])
    model_name = "gemini-2.5-flash" if model_version == "Flash (แม่นยำ)" else "gemini-2.5-flash-lite"
    model = genai.GenerativeModel(model_name)

    categories_str = ", ".join(EXPENSE_CATEGORIES)
    prompt = f"""
Read this expense receipt/invoice carefully.
Extract every line item or if no line items, extract the total as one entry.

For each item return:
- date: date on receipt as YYYY-MM-DD (if unclear use today)
- vendor: store/supplier name
- category: pick the closest from [{categories_str}]
- description: item or service description
- qty: quantity (default 1 if not shown)
- unit_price: price per unit
- total_amount: total for this line (qty × unit_price)

Return ONLY a JSON array:
[{{"date": "str", "vendor": "str", "category": "str", "description": "str", "qty": float, "unit_price": float, "total_amount": float}}]
"""
    for attempt in range(3):
        try:
            response = model.generate_content([prompt] + images)
            text = response.text.strip()
            if not text:
                raise ValueError("AI ตอบกลับว่างเปล่า")
            return json.loads(text.replace("```json", "").replace("```", "").strip())
        except (ValueError, json.JSONDecodeError) as e:
            if attempt == 2:
                raise ValueError(f"AI ไม่สามารถอ่านใบเสร็จได้ ({e})")
            import time; time.sleep(2)

# ============================================================
# PAGE CONFIG & STYLES
# ============================================================
st.set_page_config(page_title="Expense OCR", page_icon="🧾", layout="wide")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap');

html, body, [class*="css"] { font-family: 'Sarabun', sans-serif !important; }

.stApp { background-color: #F1F5F9; }
.block-container { padding: 1.5rem 1.5rem 3rem !important; max-width: 960px; }

.hero {
    background: linear-gradient(135deg, #1E3A5F 0%, #7C3AED 100%);
    border-radius: 16px;
    padding: 24px 28px 20px;
    margin-bottom: 24px;
    box-shadow: 0 4px 24px rgba(124,58,237,0.25);
}
.hero-title { font-size: 22px; font-weight: 800; color: #FFFFFF; margin: 0 0 4px 0; }
.hero-sub { font-size: 13px; color: rgba(255,255,255,0.75); margin: 0 0 10px 0; }
.hero-badge {
    display: inline-block; background: #FCD34D; color: #1E3A5F;
    font-size: 10px; font-weight: 800; padding: 2px 10px;
    border-radius: 20px; letter-spacing: 1.5px; text-transform: uppercase;
}

.card {
    background: #FFFFFF; border: 1px solid #E2E8F0;
    border-radius: 14px; padding: 18px 22px 14px;
    margin-bottom: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.06);
}
.card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.step-num {
    background: linear-gradient(135deg, #7C3AED, #6D28D9);
    color: #fff; font-size: 12px; font-weight: 700;
    width: 28px; height: 28px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.card-title { color: #1E293B; font-size: 15px; font-weight: 700; margin: 0; }

.summary-box {
    background: #FAF5FF; border: 1px solid #DDD6FE;
    border-radius: 12px; padding: 16px 20px 12px; margin: 16px 0 12px;
}
.summary-box-title { color: #4C1D95; font-size: 14px; font-weight: 700; margin-bottom: 12px; }

.stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #7C3AED, #6D28D9) !important;
    color: #fff !important; border: none !important; border-radius: 10px !important;
    font-size: 15px !important; font-weight: 600 !important; padding: 0.65rem 1.2rem !important;
    box-shadow: 0 4px 14px rgba(124,58,237,0.35) !important;
    font-family: 'Sarabun', sans-serif !important;
}
.stButton > button[kind="primary"]:hover {
    background: linear-gradient(135deg, #6D28D9, #5B21B6) !important;
    box-shadow: 0 6px 20px rgba(124,58,237,0.45) !important;
    transform: translateY(-1px) !important;
}
.save-wrap .stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #059669, #047857) !important;
    box-shadow: 0 4px 14px rgba(5,150,105,0.35) !important;
}
.save-wrap .stButton > button[kind="primary"]:hover {
    background: linear-gradient(135deg, #047857, #065F46) !important;
    box-shadow: 0 6px 20px rgba(5,150,105,0.45) !important;
}

[data-testid="metric-container"] {
    background: linear-gradient(135deg, #FAF5FF, #EDE9FE) !important;
    border: 1px solid #DDD6FE !important; border-radius: 12px !important;
    padding: 14px 20px !important;
}
[data-testid="stMetricValue"] { color: #4C1D95 !important; font-size: 28px !important; font-weight: 800 !important; }
[data-testid="stMetricLabel"] { color: #7C3AED !important; font-size: 13px !important; font-weight: 600 !important; }

hr { border-color: #E2E8F0 !important; margin: 16px 0 !important; }
[data-testid="stAlert"] { border-radius: 10px !important; font-size: 14px !important; }
[data-testid="stDataFrame"] { border-radius: 10px; overflow: hidden; }
#MainMenu { visibility: hidden; } footer { visibility: hidden; } header { visibility: hidden; }
</style>
""", unsafe_allow_html=True)

# ── Hero ──────────────────────────────────────────────────────
st.markdown("""
<div class="hero">
    <div class="hero-title">🧾 Expense OCR</div>
    <div class="hero-sub">ระบบสแกนและบันทึกค่าใช้จ่าย · Food Market</div>
    <span class="hero-badge">AI Powered</span>
</div>
""", unsafe_allow_html=True)

# ── Step 1: Settings ──────────────────────────────────────────
st.markdown("""
<div class="card">
    <div class="card-header">
        <span class="step-num">1</span>
        <span class="card-title">ตั้งค่าการทำงาน</span>
    </div>
</div>
""", unsafe_allow_html=True)

col1, col2 = st.columns(2)
with col1:
    selected_date = st.date_input("วันที่ค่าใช้จ่าย", datetime.date.today())
    formatted_date = selected_date.strftime("%Y-%m-%d")
with col2:
    ai_choice = st.radio("ขุมพลัง AI", ["Flash (แม่นยำ)", "Flash Lite (เร็ว)"])

st.markdown("<div style='height:18px'></div>", unsafe_allow_html=True)

# ── Step 2: Upload ────────────────────────────────────────────
st.markdown("""
<div class="card">
    <div class="card-header">
        <span class="step-num">2</span>
        <span class="card-title">อัปโหลดใบเสร็จ / ใบแจ้งหนี้</span>
    </div>
</div>
""", unsafe_allow_html=True)

files = st.file_uploader(
    "ถ่ายรูปหรืออัปโหลดใบเสร็จค่าใช้จ่าย",
    type=['jpg', 'jpeg', 'png'],
    accept_multiple_files=True
)

st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)

if st.button("🔍  สแกนและดึงข้อมูล", type="primary", use_container_width=True):
    if not files:
        st.warning("กรุณาอัปโหลดใบเสร็จอย่างน้อย 1 ใบ")
    else:
        with st.spinner(f"กำลังสแกนด้วย {ai_choice} ..."):
            try:
                imgs = [Image.open(f) for f in files]
                ai_results = extract_expenses(imgs, ai_choice)

                rows = []
                for d in ai_results:
                    total = float(d.get("total_amount", 0))
                    if total > 0:
                        rows.append({
                            "วันที่": d.get("date") or formatted_date,
                            "ร้านค้า/ผู้ขาย": str(d.get("vendor", "")).strip(),
                            "หมวดหมู่": str(d.get("category", "อื่นๆ")).strip(),
                            "รายการ": str(d.get("description", "")).strip(),
                            "จำนวน": float(d.get("qty", 1)),
                            "ราคาต่อหน่วย (฿)": float(d.get("unit_price", 0)),
                            "ยอดรวม (฿)": total,
                        })

                if rows:
                    st.session_state["expense_data"] = rows
                    st.success(f"สแกนสำเร็จ — พบ {len(rows)} รายการ")
                else:
                    st.warning("ไม่พบรายการที่มียอดเงิน กรุณาตรวจสอบรูปภาพ")
            except Exception as e:
                st.error(f"เกิดข้อผิดพลาด: {e}")

# ── Step 3: Review & Save ─────────────────────────────────────
if st.session_state.get("expense_data"):
    st.markdown("""
    <div class="card">
        <div class="card-header">
            <span class="step-num">3</span>
            <span class="card-title">ตรวจสอบและยืนยันค่าใช้จ่าย</span>
        </div>
    </div>
    """, unsafe_allow_html=True)

    df = pd.DataFrame(st.session_state["expense_data"])
    df_edited = st.data_editor(
        df,
        use_container_width=True,
        column_config={
            "หมวดหมู่": st.column_config.SelectboxColumn(
                options=EXPENSE_CATEGORIES, required=True
            ),
            "ยอดรวม (฿)": st.column_config.NumberColumn(format="฿%.2f"),
            "ราคาต่อหน่วย (฿)": st.column_config.NumberColumn(format="฿%.2f"),
        }
    )

    # Summary by category
    df_summary = (
        df_edited
        .groupby("หมวดหมู่", as_index=False)
        .agg(จำนวนรายการ=("รายการ", "count"), ยอดรวม=("ยอดรวม (฿)", "sum"))
        .sort_values("ยอดรวม", ascending=False)
    )
    df_summary["ยอดรวม"] = df_summary["ยอดรวม"].map("{:,.2f}".format)

    total_all = df_edited["ยอดรวม (฿)"].sum()

    st.markdown('<div class="summary-box"><div class="summary-box-title">📊 สรุปค่าใช้จ่ายตามหมวดหมู่</div>', unsafe_allow_html=True)
    st.dataframe(df_summary, use_container_width=True, hide_index=True)
    st.markdown('</div>', unsafe_allow_html=True)

    st.metric("ยอดค่าใช้จ่ายรวม", f"฿{total_all:,.2f}")
    st.markdown("<div style='height:14px'></div>", unsafe_allow_html=True)

    st.markdown('<div class="save-wrap">', unsafe_allow_html=True)
    if st.button("✅  ยืนยันและบันทึกลง Google Sheets", type="primary", use_container_width=True):
        try:
            sheet = get_expense_sheet()
            rows_to_save = []
            for row in df_edited.values.tolist():
                rows_to_save.append([clean_for_sheets(v) for v in row])
            sheet.append_rows(rows_to_save, value_input_option="USER_ENTERED")
            st.success("บันทึกค่าใช้จ่ายสำเร็จ 🎉")
            st.balloons()
            st.session_state["expense_data"] = []
        except Exception as e:
            st.error(f"ไม่สามารถบันทึกลงชีตได้: {e}")
    st.markdown('</div>', unsafe_allow_html=True)
