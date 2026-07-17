#!/bin/bash
# ติดตั้งและรันระบบเงินเดือนบนเครื่องตัวเอง (ออฟไลน์ ไม่แตะ Cloudflare)
# ใช้: curl -fsSL https://raw.githubusercontent.com/samart9669-spec/foodmarket-expense-ocr/claude/daily-payroll-system-ZEsNj/setup-local.sh | bash
set -e

BRANCH="claude/daily-payroll-system-ZEsNj"
DIR="$HOME/foodmarket-expense-ocr"

echo "==> ตรวจสอบ Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "❌ ไม่พบ Node.js ในเครื่อง"
  echo "   ติดตั้งก่อนจาก https://nodejs.org (เลือก LTS) แล้วรันคำสั่งนี้ใหม่"
  exit 1
fi
echo "   พบ Node.js $(node -v)"

if [ -d "$DIR/.git" ]; then
  echo "==> มีโปรเจคอยู่แล้ว อัปเดตโค้ดล่าสุด..."
  cd "$DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  echo "==> Clone โปรเจค..."
  git clone https://github.com/samart9669-spec/foodmarket-expense-ocr.git "$DIR"
  cd "$DIR"
  git checkout "$BRANCH"
fi

echo "==> ติดตั้ง dependencies (ครั้งแรกอาจใช้เวลา 2-3 นาที)..."
npm install --legacy-peer-deps

echo "==> สร้างฐานข้อมูลในเครื่อง..."
npx wrangler d1 execute payroll-db --local --file=schema.sql >/dev/null
npx wrangler d1 execute payroll-db --local --file=seed-dev.sql >/dev/null || true

echo "==> เปิด server..."
npm run dev &
DEV_PID=$!
trap "kill $DEV_PID 2>/dev/null" EXIT

# รอจน server พร้อม (สูงสุด 60 วินาที)
for i in $(seq 1 60); do
  if curl -sf http://localhost:3000 >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> สร้างตารางเพิ่มเติม (migrate)..."
curl -s -X POST http://localhost:3000/api/migrate >/dev/null

echo ""
echo "✅ เสร็จแล้ว! เปิดเบราว์เซอร์ให้เลย"
echo "   URL:      http://localhost:3000"
echo "   Login:    admin / admin1234"
echo ""
echo "   ปิด server: กด Ctrl+C ในหน้าต่างนี้"
command -v open >/dev/null && open http://localhost:3000

wait $DEV_PID
