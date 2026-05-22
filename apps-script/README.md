# Google Apps Script — Master Data Sync

Script สำหรับดึงข้อมูลค่าใช้จ่ายจากหลายไฟล์ลูก (child Spreadsheets) มารวมและสร้าง Dashboard ในไฟล์ Master

## โครงสร้าง Sheets ที่สร้าง

| Sheet | รายละเอียด |
|---|---|
| `AllExpenses` | Raw data รวมจากทุกไฟล์ลูก |
| `Dashboard` | สรุป / pivot (หมวดหมู่, เดือน, สาขา, Top 10) |
| `SyncLog` | บันทึก log การ sync แต่ละครั้ง |

## วิธีติดตั้ง

1. เปิด **Google Sheets** ไฟล์ Master ของคุณ
2. ไปที่ **Extensions → Apps Script**
3. คัดลอกเนื้อหาจาก `MasterDataSync.gs` วางลงใน editor
4. แก้ไข **CONFIG** ในบรรทัดแรกของไฟล์:

```javascript
var CONFIG = {
  MASTER_ID: '',  // ← ปล่อยว่างถ้า script รันอยู่ใน master sheet เอง

  CHILD_FILES: [
    { id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms', sheetName: 'Expenses', label: 'ร้านสาขา 1' },
    { id: 'SPREADSHEET_ID_อีกไฟล์',                    sheetName: 'Expenses', label: 'ร้านสาขา 2' },
  ],
  // ...
};
```

5. กด **Save** แล้วกลับไปที่ Sheets → จะมีเมนู **📊 Master Sync** ปรากฏขึ้น

## วิธีใช้งาน

### รันแบบ Manual
- **📊 Master Sync → 🔄 ดึงข้อมูล + สร้าง Dashboard** — ดึงข้อมูลและสร้าง Dashboard ในครั้งเดียว
- **🔄 ดึงข้อมูลจากไฟล์ลูก** — ดึงเฉพาะ raw data
- **📈 สร้าง / อัปเดต Dashboard** — สร้าง Dashboard จากข้อมูลที่มีอยู่แล้ว

### ตั้ง Auto-sync ทุกวัน
รันฟังก์ชัน `setupDailyTrigger()` ใน Apps Script editor เพื่อให้ sync อัตโนมัติทุกวันเวลา 06:00

## โครงสร้างข้อมูลไฟล์ลูก

ไฟล์ลูกแต่ละไฟล์ต้องมี Sheet ที่มีหัวคอลัมน์ดังนี้:

| วันที่ | ร้านค้า/ผู้ขาย | หมวดหมู่ | รายการ | จำนวน | ราคาต่อหน่วย (฿) | ยอดรวม (฿) |
|---|---|---|---|---|---|---|

> ตรงกับ format ที่บันทึกโดย **Expense OCR App** (app.py)

## Dashboard ที่ได้

- **ยอดรวมทั้งหมด** — grand total ทุกไฟล์
- **สรุปตามหมวดหมู่** — วัตถุดิบ, บรรจุภัณฑ์, ค่าไฟ/ค่าน้ำ ฯลฯ พร้อม %
- **สรุปรายเดือน** — trend ค่าใช้จ่ายแต่ละเดือน
- **สรุปตามแหล่งข้อมูล** — เปรียบเทียบระหว่างสาขา
- **Top 10 รายการสูงสุด** — รายการค่าใช้จ่ายสูงที่สุด
