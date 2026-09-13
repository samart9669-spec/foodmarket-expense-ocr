'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/lib/utils'

interface LastSync {
  at: string
  via: string
  imported: number
  replaced: number
  skipped: number
  unmatched: Array<{ branch: string; rows: number }>
}

interface SyncResult {
  imported: number
  replaced: number
  unmatched: Array<{ branch: string; rows: number }>
  skipped: Array<{ line: number; reason: string; raw: string }>
}

function randomKey(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function SalesSyncPage() {
  const [csvUrl, setCsvUrl] = useState('')
  const [syncKey, setSyncKey] = useState('')
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([])
  const [last, setLast] = useState<LastSync | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [origin, setOrigin] = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/sales/sync', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then((d: any) => {
        if (d?.error) { setToast({ msg: d.error, ok: false }); return }
        setCsvUrl(d.csv_url || '')
        setSyncKey(d.sync_key || '')
        setBranches(d.branches || [])
        setLast(d.last_sync || null)
      })
      .catch(() => setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const saveSettings = async (patch: { csv_url?: string; sync_key?: string }) => {
    setBusy(true)
    try {
      const res = await fetch('/api/sales/sync', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: patch }),
      })
      const d = await res.json() as any
      if (res.ok) { setToast({ msg: 'บันทึกการตั้งค่าแล้ว', ok: true }); load() }
      else setToast({ msg: d.error || 'บันทึกไม่สำเร็จ', ok: false })
    } finally {
      setBusy(false)
    }
  }

  const syncNow = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/sales/sync', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await res.json() as any
      if (!res.ok) { setToast({ msg: d.error || 'ซิงก์ไม่สำเร็จ', ok: false }); return }
      setResult(d)
      setLast(d.last_sync)
      setToast({ msg: `ซิงก์สำเร็จ นำเข้า ${d.imported} รายการ`, ok: true })
    } catch {
      setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false })
    } finally {
      setBusy(false)
    }
  }

  const appsScript = `// วางใน Google Sheet: ส่วนขยาย > Apps Script แล้วตั้ง Trigger รายวัน
// ให้รันฟังก์ชัน syncSalesToPayroll
const PAYROLL_URL = '${origin || 'https://foodmarket-payroll.pages.dev'}/api/sales/sync'
const SYNC_KEY = '${syncKey || '<กดสร้างคีย์ในหน้าซิงก์ก่อน>'}'

function syncSalesToPayroll() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
  const values = sheet.getDataRange().getValues()
  const header = values[0].map(h => String(h).trim().toLowerCase())

  const iDate = header.findIndex(h => ['date','วันที่'].includes(h))
  const iBranch = header.findIndex(h => ['branch','สาขา','จุดขาย'].includes(h))
  const iAmount = header.findIndex(h => ['amount','ยอดขาย','ยอด'].includes(h))
  if (iDate < 0 || iBranch < 0 || iAmount < 0) throw new Error('ไม่พบคอลัมน์ วันที่ / สาขา / ยอดขาย')

  const rows = []
  for (let i = 1; i < values.length; i++) {
    const r = values[i]
    if (!r[iBranch] || r[iAmount] === '') continue
    const d = r[iDate]
    rows.push({
      date: d instanceof Date ? Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd') : String(d),
      branch: String(r[iBranch]),
      amount: r[iAmount],
    })
  }

  const res = UrlFetchApp.fetch(PAYROLL_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Sync-Key': SYNC_KEY },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  })
  Logger.log(res.getContentText())
}`

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ซิงก์ยอดขายจาก Google Sheet</h1>
        <p className="text-sm text-gray-500 mt-1">
          ดึงยอดขายรายสาขาจากชีทเข้าระบบ ใช้คำนวณ incentive ให้อัตโนมัติ
          ซิงก์ซ้ำได้ไม่ซ้ำซ้อน — รายการของ &quot;สาขา + วันที่&quot; เดิมที่มาจากชีทจะถูกแทนที่
          ส่วนรายการที่คีย์เองในระบบจะไม่ถูกแตะ
        </p>
      </div>

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.msg}
        </div>
      )}

      {/* วิธีที่ 1 — ระบบไปดึงเอง */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-900">วิธีที่ 1 — ระบบไปดึงจากลิงก์ชีท</h2>
        <p className="text-xs text-gray-500">
          ในชีทเลือก ไฟล์ &gt; แชร์ &gt; เผยแพร่ทางเว็บ &gt; เลือกชีทที่ต้องการ และเลือกรูปแบบ
          <strong> CSV</strong> แล้วนำลิงก์มาวางที่นี่ (วางลิงก์ชีทปกติก็ได้ ระบบจะแปลงให้)
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            className="flex-1 min-w-[280px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
            value={csvUrl}
            onChange={e => setCsvUrl(e.target.value)}
          />
          <button
            onClick={() => saveSettings({ csv_url: csvUrl })}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
          >
            บันทึกลิงก์
          </button>
          <button
            onClick={syncNow}
            disabled={busy || !csvUrl}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {busy ? 'กำลังซิงก์...' : 'ซิงก์เดี๋ยวนี้'}
          </button>
        </div>
      </div>

      {/* วิธีที่ 2 — ชีทส่งมาเอง */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-900">วิธีที่ 2 — ให้ชีทส่งมาเองทุกวัน (แนะนำ)</h2>
        <p className="text-xs text-gray-500">
          สร้างคีย์แล้วนำสคริปต์ด้านล่างไปวางใน Apps Script ของชีท
          จากนั้นตั้ง Trigger แบบ Time-driven &gt; Day timer เลือกช่วงเวลาที่ต้องการ
          ข้อมูลจะส่งเข้าระบบเองทุกวันโดยไม่ต้องเผยแพร่ชีทให้คนนอกเห็น
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            readOnly
            className="flex-1 min-w-[280px] border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50"
            value={syncKey || '(ยังไม่มีคีย์)'}
          />
          <button
            onClick={() => { const k = randomKey(); setSyncKey(k); saveSettings({ sync_key: k }) }}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
          >
            {syncKey ? 'สร้างคีย์ใหม่' : 'สร้างคีย์'}
          </button>
          <button
            onClick={() => navigator.clipboard?.writeText(appsScript)}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            คัดลอกสคริปต์
          </button>
        </div>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-[11px] leading-relaxed overflow-x-auto">
{appsScript}
        </pre>
      </div>

      {/* สถานะและผลล่าสุด */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-900">สถานะการซิงก์</h2>
        {loading ? (
          <p className="text-sm text-gray-500">กำลังโหลด...</p>
        ) : last ? (
          <div className="text-sm text-gray-700 space-y-1">
            <p>
              ล่าสุด {last.at} ({last.via === 'auto' ? 'อัตโนมัติจากชีท' : 'กดเอง'}) ·
              นำเข้า <strong>{last.imported}</strong> รายการ ·
              แทนที่ของเดิม {last.replaced} · ข้าม {last.skipped}
            </p>
            {last.unmatched?.length > 0 && (
              <p className="text-amber-700">
                จับคู่สาขาไม่ได้: {last.unmatched.map(u => `${u.branch} (${u.rows})`).join(', ')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">ยังไม่เคยซิงก์</p>
        )}

        {result && result.unmatched.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">ชื่อสาขาในชีทที่จับคู่ไม่ได้</p>
            <ul className="mt-1 list-disc list-inside">
              {result.unmatched.map(u => <li key={u.branch}>{u.branch} — {u.rows} แถว</li>)}
            </ul>
            <p className="mt-2 text-xs">
              แก้ชื่อในชีทให้ตรงกับสาขาในระบบ หรือเปลี่ยนชื่อสาขาที่หน้าจัดการสาขา
            </p>
          </div>
        )}

        {result && result.skipped.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-600">
            <p className="font-medium text-gray-700">แถวที่ข้าม ({result.skipped.length})</p>
            <ul className="mt-1 space-y-0.5">
              {result.skipped.slice(0, 10).map(s => (
                <li key={s.line}>บรรทัด {s.line}: {s.reason} — {s.raw}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-xs text-gray-500">
          <p className="font-medium text-gray-700 mb-1">สาขาในระบบ (ชื่อในชีทต้องตรงหรือใกล้เคียง)</p>
          <p>{branches.map(b => b.name).join(' · ') || '-'}</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <p className="font-medium">รูปแบบชีทที่รองรับ</p>
        <p className="mt-1">
          ต้องมีหัวคอลัมน์ <strong>วันที่</strong> (หรือ date), <strong>สาขา</strong> (หรือ branch/จุดขาย)
          และ <strong>ยอดขาย</strong> (หรือ amount) จะมีคอลัมน์อื่นเพิ่มก็ได้
        </p>
        <p className="mt-1">
          วันที่รองรับ 2026-09-13, 13/09/2026 และ 13/09/2569 (พ.ศ.) · ยอดขายใส่คอมมาได้
        </p>
      </div>
    </div>
  )
}
