import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import CATEGORY_KEYWORDS

_THAI_MONTHS = {
    "มกราคม": "01",   "กุมภาพันธ์": "02", "มีนาคม": "03",
    "เมษายน": "04",   "พฤษภาคม": "05",   "มิถุนายน": "06",
    "กรกฎาคม": "07",  "สิงหาคม": "08",   "กันยายน": "09",
    "ตุลาคม": "10",   "พฤศจิกายน": "11", "ธันวาคม": "12",
    "ม.ค.": "01", "ก.พ.": "02", "มี.ค.": "03",
    "เม.ย.": "04", "พ.ค.": "05", "มิ.ย.": "06",
    "ก.ค.": "07", "ส.ค.": "08", "ก.ย.": "09",
    "ต.ค.": "10", "พ.ย.": "11", "ธ.ค.": "12",
}


def _to_ad_year(y: int) -> int:
    return y - 543 if y > 2400 else y


def parse_date(text: str):
    m = re.search(r"\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b", text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        return f"{_to_ad_year(y):04d}-{mo:02d}-{d:02d}"
    for month_name, month_num in _THAI_MONTHS.items():
        pattern = rf"\b(\d{{1,2}})\s*{re.escape(month_name)}\s*(\d{{2,4}})\b"
        m = re.search(pattern, text)
        if m:
            d, y = int(m.group(1)), _to_ad_year(int(m.group(2)))
            return f"{y:04d}-{month_num}-{d:02d}"
    return None


def parse_amount(text: str):
    patterns = [
        r"(?:จำนวนเงิน|ยอดโอน|ยอดชำระ|amount|total)[^\d]*([\d,]+\.\d{2})",
        r"([\d,]+\.\d{2})\s*(?:บาท|baht|thb)",
        r"([\d,]+\.\d{2})",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1).replace(",", ""))
            except ValueError:
                continue
    return None


def parse_receiver(text: str) -> str:
    patterns = [
        r"(?:ผู้รับ|บัญชีปลายทาง|to|receiver|payee)[:\s]+(.+)",
        r"(?:ชื่อ|name)[:\s]+(.+)",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()[:100]
    return "ไม่ระบุ"


def detect_category(text: str, note: str = "") -> str:
    combined = (text + " " + note).lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if category == "อื่นๆ":
            continue
        if any(kw.lower() in combined for kw in keywords):
            return category
    return "อื่นๆ"


def parse_slip(ocr_text: str, note: str = "") -> dict:
    return {
        "transfer_date": parse_date(ocr_text),
        "amount":        parse_amount(ocr_text),
        "receiver_name": parse_receiver(ocr_text),
        "category":      detect_category(ocr_text, note),
    }
