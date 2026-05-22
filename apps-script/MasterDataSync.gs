// ============================================================
// MasterDataSync.gs
// ดึงข้อมูลจากไฟล์ลูก (child Spreadsheets) มาแสดงในไฟล์ master
// รองรับโครงสร้างที่บันทึกโดย Expense OCR App
// ============================================================

// ─── CONFIG: แก้ไขตรงนี้เพียงอย่างเดียว ────────────────────
var CONFIG = {
  // Spreadsheet ID ของไฟล์ master (ไฟล์ที่ Script นี้รันอยู่ ปล่อยว่างได้)
  MASTER_ID: '',  // ← ถ้าปล่อยว่าง จะใช้ spreadsheet ที่ script ผูกอยู่

  // รายการไฟล์ลูก: ใส่ Spreadsheet ID และชื่อ Sheet ที่ต้องการดึง
  CHILD_FILES: [
    { id: 'SPREADSHEET_ID_1', sheetName: 'Expenses', label: 'ร้านที่ 1' },
    { id: 'SPREADSHEET_ID_2', sheetName: 'Expenses', label: 'ร้านที่ 2' },
    // เพิ่มไฟล์ลูกได้ที่นี่...
  ],

  // ชื่อ Sheet ปลายทางใน master
  RAW_SHEET_NAME:       'AllExpenses',   // รวม raw data ทั้งหมด
  DASHBOARD_SHEET_NAME: 'Dashboard',     // สรุป / pivot
  LOG_SHEET_NAME:       'SyncLog',       // บันทึก log การ sync

  // หัวตารางที่คาดหวังในไฟล์ลูก (ต้องตรงกัน)
  EXPECTED_HEADERS: [
    'วันที่', 'ร้านค้า/ผู้ขาย', 'หมวดหมู่', 'รายการ',
    'จำนวน', 'ราคาต่อหน่วย (฿)', 'ยอดรวม (฿)'
  ]
};
// ────────────────────────────────────────────────────────────


// ── เมนูใน Google Sheets ────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Master Sync')
    .addItem('🔄 ดึงข้อมูลจากไฟล์ลูก', 'pullAllData')
    .addItem('📈 สร้าง / อัปเดต Dashboard', 'buildDashboard')
    .addItem('🔄 ดึงข้อมูล + สร้าง Dashboard', 'syncAndDashboard')
    .addSeparator()
    .addItem('🗑️ ล้างข้อมูล AllExpenses', 'clearRawData')
    .addItem('📋 ดู Sync Log', 'openLog')
    .addToUi();
}


// ── ฟังก์ชันหลัก: ดึง + Dashboard ──────────────────────────
function syncAndDashboard() {
  pullAllData();
  buildDashboard();
  SpreadsheetApp.getActive().toast('✅ Sync และ Dashboard เสร็จแล้ว!', 'สำเร็จ', 5);
}


// ── ดึงข้อมูลจากไฟล์ลูกทั้งหมด ─────────────────────────────
function pullAllData() {
  var master = CONFIG.MASTER_ID
    ? SpreadsheetApp.openById(CONFIG.MASTER_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  var rawSheet = getOrCreateSheet(master, CONFIG.RAW_SHEET_NAME);
  rawSheet.clearContents();

  // หัวตาราง master (เพิ่มคอลัมน์ 'แหล่งข้อมูล')
  var masterHeaders = CONFIG.EXPECTED_HEADERS.concat(['แหล่งข้อมูล', 'Spreadsheet ID']);
  rawSheet.appendRow(masterHeaders);
  formatHeaderRow(rawSheet, 1);

  var totalRows = 0;
  var errors    = [];
  var startTime = new Date();

  CONFIG.CHILD_FILES.forEach(function(child) {
    try {
      var rows = fetchFromChild(child);
      if (rows.length > 0) {
        rawSheet.getRange(rawSheet.getLastRow() + 1, 1, rows.length, rows[0].length)
                .setValues(rows);
        totalRows += rows.length;
      }
      writeLog(master, child.label || child.id, rows.length, '', startTime);
    } catch (e) {
      errors.push(child.label + ': ' + e.message);
      writeLog(master, child.label || child.id, 0, e.message, startTime);
    }
  });

  autoResizeSheet(rawSheet);
  formatDateColumn(rawSheet);

  var msg = '✅ ดึงข้อมูลสำเร็จ ' + totalRows + ' แถว จาก ' + CONFIG.CHILD_FILES.length + ' ไฟล์';
  if (errors.length > 0) msg += '\n⚠️ ข้อผิดพลาด: ' + errors.join(', ');
  SpreadsheetApp.getActive().toast(msg, 'ผลการ Sync', 8);
  Logger.log(msg);
}


// ── ดึงข้อมูลจากไฟล์ลูกไฟล์เดียว ───────────────────────────
function fetchFromChild(child) {
  var ss    = SpreadsheetApp.openById(child.id);
  var sheet = ss.getSheetByName(child.sheetName);
  if (!sheet) throw new Error('ไม่พบ sheet ชื่อ "' + child.sheetName + '"');

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return []; // ไม่มีข้อมูล

  var headers = data[0].map(function(h) { return String(h).trim(); });

  // ตรวจสอบ headers
  CONFIG.EXPECTED_HEADERS.forEach(function(expected) {
    if (headers.indexOf(expected) === -1) {
      throw new Error('ไม่พบคอลัมน์ "' + expected + '" (พบ: ' + headers.join(', ') + ')');
    }
  });

  // แมป index
  var idx = {};
  CONFIG.EXPECTED_HEADERS.forEach(function(h) {
    idx[h] = headers.indexOf(h);
  });

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    // ข้ามแถวว่าง
    if (CONFIG.EXPECTED_HEADERS.every(function(h) {
      return String(row[idx[h]]).trim() === '';
    })) continue;

    var mappedRow = CONFIG.EXPECTED_HEADERS.map(function(h) {
      return row[idx[h]];
    });
    mappedRow.push(child.label || child.id); // แหล่งข้อมูล
    mappedRow.push(child.id);                // Spreadsheet ID
    rows.push(mappedRow);
  }
  return rows;
}


// ── สร้าง / อัปเดต Dashboard ────────────────────────────────
function buildDashboard() {
  var master = CONFIG.MASTER_ID
    ? SpreadsheetApp.openById(CONFIG.MASTER_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  var rawSheet  = master.getSheetByName(CONFIG.RAW_SHEET_NAME);
  if (!rawSheet) {
    SpreadsheetApp.getUi().alert('⚠️ ยังไม่มีข้อมูลใน AllExpenses\nกรุณา "ดึงข้อมูลจากไฟล์ลูก" ก่อน');
    return;
  }

  var data = rawSheet.getDataRange().getValues();
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert('⚠️ ไม่มีข้อมูลใน AllExpenses');
    return;
  }

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var rows    = data.slice(1);

  var iDate     = headers.indexOf('วันที่');
  var iCat      = headers.indexOf('หมวดหมู่');
  var iDesc     = headers.indexOf('รายการ');
  var iVendor   = headers.indexOf('ร้านค้า/ผู้ขาย');
  var iTotal    = headers.indexOf('ยอดรวม (฿)');
  var iSource   = headers.indexOf('แหล่งข้อมูล');

  // ── รวบรวม pivot data ────────────────────────────────────
  var byCategory = {};
  var byMonth    = {};
  var bySource   = {};
  var grandTotal = 0;

  rows.forEach(function(row) {
    var cat    = String(row[iCat]   || 'อื่นๆ').trim();
    var total  = parseFloat(row[iTotal]) || 0;
    var source = String(row[iSource] || 'ไม่ระบุ').trim();
    var dateVal = row[iDate];
    var month  = getMonthKey(dateVal);

    byCategory[cat]    = (byCategory[cat]    || 0) + total;
    byMonth[month]     = (byMonth[month]     || 0) + total;
    bySource[source]   = (bySource[source]   || 0) + total;
    grandTotal        += total;
  });

  // ── เขียน Dashboard Sheet ────────────────────────────────
  var dash = getOrCreateSheet(master, CONFIG.DASHBOARD_SHEET_NAME);
  dash.clearContents();
  dash.clearFormats();

  var r = 1; // current row

  // ── หัว Dashboard ─────────────────────────────────────────
  r = writeSectionTitle(dash, r, '📊 MASTER DASHBOARD — สรุปค่าใช้จ่ายรวมทุกสาขา');
  dash.getRange(r, 1).setValue('อัปเดตล่าสุด: ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'));
  dash.getRange(r, 1).setFontColor('#64748b').setFontSize(10);
  r += 2;

  // ── ยอดรวมทั้งหมด ─────────────────────────────────────────
  dash.getRange(r, 1).setValue('💰 ยอดรวมทั้งหมด');
  dash.getRange(r, 1).setFontWeight('bold').setFontSize(13);
  dash.getRange(r, 2).setValue(grandTotal);
  dash.getRange(r, 2).setNumberFormat('#,##0.00 "฿"').setFontWeight('bold')
      .setFontSize(13).setFontColor('#7C3AED');
  r += 2;

  // ── สรุปตามหมวดหมู่ ──────────────────────────────────────
  r = writeSectionTitle(dash, r, '📂 สรุปตามหมวดหมู่');
  dash.getRange(r, 1, 1, 3).setValues([['หมวดหมู่', 'ยอดรวม (฿)', '% จากทั้งหมด']]);
  formatSubHeader(dash, r, 3);
  r++;

  var catEntries = Object.keys(byCategory).sort(function(a, b) {
    return byCategory[b] - byCategory[a];
  });
  catEntries.forEach(function(cat) {
    var amt = byCategory[cat];
    dash.getRange(r, 1, 1, 3).setValues([
      [cat, amt, grandTotal > 0 ? amt / grandTotal : 0]
    ]);
    dash.getRange(r, 2).setNumberFormat('#,##0.00');
    dash.getRange(r, 3).setNumberFormat('0.00%');
    r++;
  });
  // แถวรวม
  dash.getRange(r, 1, 1, 2).setValues([['รวมทั้งหมด', grandTotal]]);
  dash.getRange(r, 2).setNumberFormat('#,##0.00');
  dash.getRange(r, 1, 1, 3).setFontWeight('bold').setBackground('#EDE9FE');
  r += 2;

  // ── สรุปรายเดือน ─────────────────────────────────────────
  r = writeSectionTitle(dash, r, '📅 สรุปรายเดือน');
  dash.getRange(r, 1, 1, 2).setValues([['เดือน', 'ยอดรวม (฿)']]);
  formatSubHeader(dash, r, 2);
  r++;

  var monthKeys = Object.keys(byMonth).sort();
  monthKeys.forEach(function(m) {
    dash.getRange(r, 1, 1, 2).setValues([[m, byMonth[m]]]);
    dash.getRange(r, 2).setNumberFormat('#,##0.00');
    r++;
  });
  r += 1;

  // ── สรุปตามแหล่งข้อมูล (ร้านค้า/สาขา) ───────────────────
  r = writeSectionTitle(dash, r, '🏪 สรุปตามแหล่งข้อมูล');
  dash.getRange(r, 1, 1, 3).setValues([['แหล่งข้อมูล', 'ยอดรวม (฿)', '% จากทั้งหมด']]);
  formatSubHeader(dash, r, 3);
  r++;

  var srcEntries = Object.keys(bySource).sort(function(a, b) {
    return bySource[b] - bySource[a];
  });
  srcEntries.forEach(function(src) {
    var amt = bySource[src];
    dash.getRange(r, 1, 1, 3).setValues([
      [src, amt, grandTotal > 0 ? amt / grandTotal : 0]
    ]);
    dash.getRange(r, 2).setNumberFormat('#,##0.00');
    dash.getRange(r, 3).setNumberFormat('0.00%');
    r++;
  });
  r += 1;

  // ── Top 10 รายการค่าใช้จ่ายสูงสุด ────────────────────────
  r = writeSectionTitle(dash, r, '🏆 Top 10 รายการสูงสุด');
  dash.getRange(r, 1, 1, 4).setValues([['รายการ', 'ร้านค้า/ผู้ขาย', 'หมวดหมู่', 'ยอดรวม (฿)']]);
  formatSubHeader(dash, r, 4);
  r++;

  var sortedRows = rows.slice().sort(function(a, b) {
    return (parseFloat(b[iTotal]) || 0) - (parseFloat(a[iTotal]) || 0);
  });
  var top10 = sortedRows.slice(0, 10);
  top10.forEach(function(row) {
    dash.getRange(r, 1, 1, 4).setValues([
      [row[headers.indexOf('รายการ')], row[iVendor], row[iCat], parseFloat(row[iTotal]) || 0]
    ]);
    dash.getRange(r, 4).setNumberFormat('#,##0.00');
    r++;
  });

  autoResizeSheet(dash);
  dash.setColumnWidth(1, 200);
  master.setActiveSheet(dash);
  SpreadsheetApp.getActive().toast('📈 Dashboard อัปเดตสำเร็จ!', 'เสร็จแล้ว', 5);
}


// ── ล้างข้อมูล Raw ───────────────────────────────────────────
function clearRawData() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert('⚠️ ยืนยันการล้างข้อมูล', 'ต้องการล้างข้อมูลใน AllExpenses ใช่หรือไม่?', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;

  var master = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = master.getSheetByName(CONFIG.RAW_SHEET_NAME);
  if (rawSheet) rawSheet.clearContents();
  ui.alert('✅ ล้างข้อมูลเรียบร้อย');
}


// ── Trigger: รัน sync อัตโนมัติทุกวัน ───────────────────────
function setupDailyTrigger() {
  // ลบ trigger เก่าก่อน
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'syncAndDashboard') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // สร้าง trigger ใหม่รันเวลา 06:00 ทุกวัน
  ScriptApp.newTrigger('syncAndDashboard')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  SpreadsheetApp.getUi().alert('✅ ตั้งค่า Auto-sync ทุกวันเวลา 06:00 เรียบร้อย');
}

function removeDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'syncAndDashboard') {
      ScriptApp.deleteTrigger(t);
    }
  });
  SpreadsheetApp.getUi().alert('🗑️ ลบ Auto-sync Trigger เรียบร้อย');
}


// ── บันทึก Log ───────────────────────────────────────────────
function writeLog(master, source, rowCount, error, startTime) {
  var logSheet = getOrCreateSheet(master, CONFIG.LOG_SHEET_NAME);
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(['เวลา', 'แหล่งข้อมูล', 'จำนวนแถว', 'สถานะ', 'ข้อผิดพลาด', 'ระยะเวลา (วินาที)']);
    formatHeaderRow(logSheet, 1);
  }
  var now = new Date();
  var elapsed = ((now - startTime) / 1000).toFixed(1);
  logSheet.appendRow([
    Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss'),
    source,
    rowCount,
    error ? '❌ Error' : '✅ สำเร็จ',
    error || '',
    elapsed
  ]);
}

function openLog() {
  var master = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = master.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (logSheet) master.setActiveSheet(logSheet);
  else SpreadsheetApp.getUi().alert('ยังไม่มี Sync Log');
}


// ── Utility Functions ────────────────────────────────────────
function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getMonthKey(dateVal) {
  try {
    var d = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal).substring(0, 7);
    return Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM');
  } catch (e) {
    return String(dateVal).substring(0, 7);
  }
}

function formatHeaderRow(sheet, row) {
  var lastCol = sheet.getLastColumn() || 1;
  var range = sheet.getRange(row, 1, 1, lastCol);
  range.setBackground('#1E3A5F')
       .setFontColor('#FFFFFF')
       .setFontWeight('bold')
       .setFontSize(11);
}

function writeSectionTitle(sheet, row, title) {
  sheet.getRange(row, 1).setValue(title);
  sheet.getRange(row, 1, 1, 5)
       .setBackground('#7C3AED')
       .setFontColor('#FFFFFF')
       .setFontWeight('bold')
       .setFontSize(12)
       .merge();
  return row + 1;
}

function formatSubHeader(sheet, row, numCols) {
  sheet.getRange(row, 1, 1, numCols)
       .setBackground('#EDE9FE')
       .setFontWeight('bold')
       .setFontColor('#4C1D95');
}

function autoResizeSheet(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol > 0) sheet.autoResizeColumns(1, lastCol);
}

function formatDateColumn(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var dateIdx = headers.indexOf('วันที่');
  if (dateIdx < 0 || data.length < 2) return;
  sheet.getRange(2, dateIdx + 1, sheet.getLastRow() - 1, 1)
       .setNumberFormat('dd/MM/yyyy');
}
