from pathlib import Path

BASE_DIR = Path(__file__).parent
CATEGORY_KEYWORDS = {
    "วัตถุดิบ": [
        "lotus", "โลตัส", "tesco", "เทสโก้", "bigc", "บิ๊กซี", "makro", "แม็คโคร",
        "ตลาด", "market", "หมู", "pork", "ไก่", "chicken", "เนื้อ", "beef",
        "ผัก", "vegetable", "ปลา", "fish", "กุ้ง", "shrimp", "วัตถุดิบ", "เครื่องปรุง",
    ],
    "ค่าแพ็กเกจจิ้ง": [
        "กล่อง", "ถุง", "bag", "box", "แพ็ก", "pack", "packaging",
        "โฟม", "foam", "ช้อน", "ช้อนส้อม", "หลอด", "straw",
    ],
    "ค่าสาธารณูปโภค": [
        "ค่าน้ำ", "ค่าไฟ", "electric", "electricity", "water", "utility",
        "pea", "mea", "การประปา", "การไฟฟ้า", "ประปา", "ไฟฟ้า",
    ],
    "ค่าขนส่ง": [
        "ขนส่ง", "transport", "delivery", "grab", "lalamove", "kerry",
        "flash", "j&t", "นินจา", "ninja", "shippop", "ไปรษณีย์",
    ],
    "ค่าแรง/เงินเดือน": [
        "เงินเดือน", "salary", "ค่าจ้าง", "wage", "ค่าแรง", "แรงงาน",
    ],
    "ค่าเช่า": [
        "ค่าเช่า", "rent", "lease", "เช่าพื้นที่", "ค่าพื้นที่",
    ],
    "อื่นๆ": [],
}
DB_PATH = BASE_DIR / "database" / "expenses.db"
