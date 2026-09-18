'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getAuthHeaders, getTodayString } from '@/lib/utils'
import { thaiDate } from '@/lib/payslip'

interface Row {
  name: string; employee_type: string; daily_rate: number; ot_rate: number
  days: number; ot_hours: number; salary: number; ot_pay: number; diligence: number
  other_income: number; gross: number; absent_deduct: number; other_deduct: number
  total_deduct: number; note: string; before_tax: number; markup: number
  tax: number; net: number; diff: number
}

interface Totals extends Omit<Row, 'name' | 'employee_type' | 'daily_rate' | 'ot_rate' | 'note'> {}

interface Branch {
  sales_point_id: string | null
  sales_point_name: string
  rows: Row[]
  totals: Totals
}

interface Data {
  month: string; month_label: string
  period: number; period_label: string
  period_start: string; period_end: string
  branches: Branch[]
  all_branches: Array<{ id: string; name: string }>
  totals: Totals
}

const num = (n: number) => (n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })

function monthOptions(): string[] {
  const out: string[] = []
  const now = new Date(Date.now() + 7 * 3600 * 1000)
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export default function PayslipPage() {
  const months = useMemo(monthOptions, [])
  const [month, setMonth] = useState(months[0])
  const [period, setPeriod] = useState<'1' | '2'>('1')
  const [branchId, setBranchId] = useState('')
  const [payDate, setPayDate] = useState(getTodayString())
  const [view, setView] = useState<'transfer' | 'slip'>('transfer')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    const qs = new URLSearchParams({ month, period })
    if (branchId) qs.set('sales_point_id', branchId)
    fetch(`/api/payroll/payslip?${qs}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then((d: any) => { if (d?.error) setError(d.error); else setData(d) })
      .catch(() => setError('เชื่อมต่อไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [month, period, branchId])

  useEffect(() => { load() }, [load])

  /**
   * ดาวน์โหลดเป็นไฟล์ที่ Excel เปิดได้ โดยส่งเป็นตาราง HTML ที่ Excel อ่านออก
   * วิธีนี้ไม่ต้องพึ่งไลบรารีสร้าง .xlsx ซึ่งรันบน edge runtime ไม่ได้
   */
  const exportExcel = () => {
    const el = document.getElementById('print-area')
    if (!el || !data) return
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
<style>table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px;font-family:Arial;font-size:11pt}
.title{font-weight:bold;font-size:13pt;border:none}.sum{font-weight:bold;background:#f2f2f2}.noborder td{border:none}</style>
</head><body>${el.innerHTML}</body></html>`
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const suffix = view === 'transfer' ? 'ทำจ่าย' : 'ใบจ่ายเงินเดือน'
    a.href = url
    a.download = `${suffix}-${data.month}-รอบ${data.period}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const title = (b: Branch) =>
    `รายงานเงินเดือน ประจำเดือน ${data?.month_label} ${data?.period_label} (${b.sales_point_name})`

  return (
    <div className="space-y-5">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="text-2xl font-bold text-gray-900">ใบทำจ่าย / ใบจ่ายเงินเดือน</h1>
        <p className="text-sm text-gray-500 mt-1">
          ดึงผลจากรายการเงินเดือนที่คำนวณไว้แล้วในรอบที่เลือก จัดเป็นฟอร์มแยกตามสาขา
          พิมพ์ได้เลยหรือดาวน์โหลดเป็นไฟล์ Excel
        </p>
      </div>

      <div className="no-print bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">เดือน</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={month} onChange={e => setMonth(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">รอบจ่าย</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={period} onChange={e => setPeriod(e.target.value as '1' | '2')}>
            <option value="1">วันที่ 1 - 15</option>
            <option value="2">วันที่ 16 - สิ้นเดือน</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">สาขา</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[180px]"
            value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="">ทุกสาขา (แยกชุด)</option>
            {(data?.all_branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">วันที่ทำจ่าย</label>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={payDate} onChange={e => setPayDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">รูปแบบ</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={view} onChange={e => setView(e.target.value as 'transfer' | 'slip')}>
            <option value="transfer">ทำจ่าย (สรุปทั้งสาขา)</option>
            <option value="slip">ใบจ่ายเงินเดือน (รายคน)</option>
          </select>
        </div>
        <button onClick={() => window.print()}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          พิมพ์
        </button>
        <button onClick={exportExcel}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          ดาวน์โหลด Excel
        </button>
      </div>

      {error && <div className="no-print p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}
      {loading && <div className="no-print text-sm text-gray-500">กำลังโหลด...</div>}

      {data && !loading && data.branches.length === 0 && (
        <div className="no-print bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          ไม่พบรายการเงินเดือนของรอบนี้ — ต้องไปคำนวณและบันทึกเงินเดือนของงวด
          {' '}{data.period_start} ถึง {data.period_end} ที่หน้าเงินเดือนก่อน
        </div>
      )}

      <div id="print-area" className="space-y-8">
        {data?.branches.map((b, bi) => (
          <div key={b.sales_point_id || 'none'} className={bi < data.branches.length - 1 ? 'page-break' : ''}>
            {view === 'transfer' ? (
              <TransferTable branch={b} title={title(b)} />
            ) : (
              <Slips branch={b} data={data} payDate={payDate} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** ชีท "ทำจ่าย NEW" — สรุปทั้งสาขาในตารางเดียว */
function TransferTable({ branch, title }: { branch: Branch; title: string }) {
  const t = branch.totals
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 overflow-x-auto">
      <p className="title font-bold text-gray-900 mb-3">{title}</p>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100">
            {['พนักงาน', 'ประเภท', 'วันทำงาน', 'ชม.ล่วงเวลา', 'เงินเดือน', 'ค่าล่วงเวลา', 'เบี้ยขยัน',
              'รวมเงินได้', 'ขาด/ลา', 'หักอื่น ๆ', 'รวมเงินหัก', 'หมายเหตุ', 'ยอดจ่ายก่อนภาษี',
              'mark up', 'หักภาษี 3%', 'สุทธิ', 'diff'].map(h => (
              <th key={h} className="border border-gray-300 px-2 py-1.5 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {branch.rows.map((r, i) => (
            <tr key={i}>
              <td className="border border-gray-300 px-2 py-1 whitespace-nowrap">{r.name}</td>
              <td className="border border-gray-300 px-2 py-1 whitespace-nowrap">{r.employee_type === 'sales' ? 'พนักงานขาย' : 'ครัวกลาง'}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{num(r.days)}</td>
              <td className="border border-gray-300 px-2 py-1 text-center">{num(r.ot_hours)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{num(r.salary)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{num(r.ot_pay)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{num(r.diligence)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right font-medium">{num(r.gross)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{num(r.absent_deduct)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{num(r.other_deduct)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{num(r.total_deduct)}</td>
              <td className="border border-gray-300 px-2 py-1 text-[10px] text-gray-500">{r.note}</td>
              <td className="border border-gray-300 px-2 py-1 text-right font-medium">{num(r.before_tax)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{num(r.markup)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right">{num(r.tax)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right font-bold">{num(r.net)}</td>
              <td className="border border-gray-300 px-2 py-1 text-right text-gray-400">{num(r.diff)}</td>
            </tr>
          ))}
          <tr className="sum bg-gray-100 font-bold">
            <td className="border border-gray-300 px-2 py-1">รวมทั้งสิ้น</td>
            <td className="border border-gray-300 px-2 py-1"></td>
            <td className="border border-gray-300 px-2 py-1 text-center">{num(t.days)}</td>
            <td className="border border-gray-300 px-2 py-1 text-center">{num(t.ot_hours)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.salary)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.ot_pay)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.diligence)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.gross)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.absent_deduct)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.other_deduct)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.total_deduct)}</td>
            <td className="border border-gray-300 px-2 py-1"></td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.before_tax)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.markup)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.tax)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.net)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{num(t.diff)}</td>
          </tr>
        </tbody>
      </table>

      {/* บล็อกข้อมูลโอนเงิน ตามฟอร์มต้นฉบับ */}
      <table className="w-full text-xs border-collapse mt-5">
        <thead>
          <tr className="bg-gray-100">
            {['พนักงาน', 'ประเภท', 'เลขผู้เสียภาษี', 'ธนาคาร', 'เลขบัญชี', 'หมายเหตุ'].map(h => (
              <th key={h} className="border border-gray-300 px-2 py-1.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {branch.rows.map((r, i) => (
            <tr key={i}>
              <td className="border border-gray-300 px-2 py-1 whitespace-nowrap">{r.name}</td>
              <td className="border border-gray-300 px-2 py-1 whitespace-nowrap">{r.employee_type === 'sales' ? 'พนักงานขาย' : 'ครัวกลาง'}</td>
              <td className="border border-gray-300 px-2 py-4"></td>
              <td className="border border-gray-300 px-2 py-4"></td>
              <td className="border border-gray-300 px-2 py-4"></td>
              <td className="border border-gray-300 px-2 py-4"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** ชีท "ใบจ่ายเงินเดือน" — สลิปรายคน เรียง 2 ใบต่อแถว */
function Slips({ branch, data, payDate }: { branch: Branch; data: Data; payDate: string }) {
  const pairs: Row[][] = []
  for (let i = 0; i < branch.rows.length; i += 2) pairs.push(branch.rows.slice(i, i + 2))

  return (
    <div className="space-y-4">
      <p className="title font-bold text-gray-900">
        ใบจ่ายเงินเดือน {branch.sales_point_name} — {data.month_label} {data.period_label}
        {' '}· ทำจ่าย {thaiDate(payDate)}
      </p>
      {pairs.map((pair, i) => (
        <div key={i} className="grid grid-cols-2 gap-4">
          {pair.map((r, j) => <Slip key={j} row={r} data={data} branch={branch} payDate={payDate} />)}
        </div>
      ))}
    </div>
  )
}

function Slip({ row, data, branch, payDate }: { row: Row; data: Data; branch: Branch; payDate: string }) {
  // รวมเงินได้บนสลิป = เงินได้ + ภาษีที่บวกกลับ เพื่อให้สุทธิเท่ากับยอดก่อนภาษี
  const totalEarnings = row.salary + row.ot_pay + row.diligence + row.other_income + row.tax
  const totalDeduction = row.total_deduct + row.tax

  return (
    <div className="bg-white border border-gray-300 rounded p-3 text-xs">
      <p className="font-bold text-center mb-2">
        ใบจ่ายเงินเดือน ประจำเดือน {data.month_label} {data.period_label}
      </p>
      <div className="flex justify-between mb-2">
        <span><strong>Name:</strong> {row.name}</span>
        <span><strong>Dept:</strong> {branch.sales_point_name}</span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-1.5 py-1 text-left">รายได้<br />Earnings</th>
            <th className="border border-gray-300 px-1.5 py-1">จำนวน<br />Number</th>
            <th className="border border-gray-300 px-1.5 py-1">จำนวนเงิน<br />Amount</th>
            <th className="border border-gray-300 px-1.5 py-1 text-left">รายการหัก<br />Deductions</th>
            <th className="border border-gray-300 px-1.5 py-1">จำนวนเงิน<br />Amount</th>
            <th className="border border-gray-300 px-1.5 py-1">วันที่จ่าย<br />Payroll Date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-300 px-1.5 py-1">Rate</td>
            <td className="border border-gray-300 px-1.5 py-1"></td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(row.daily_rate)}</td>
            <td className="border border-gray-300 px-1.5 py-1">Absent ขาดงาน</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(row.absent_deduct)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{thaiDate(payDate)}</td>
          </tr>
          <tr>
            <td className="border border-gray-300 px-1.5 py-1">Salary</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{num(row.days)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(row.salary)}</td>
            <td className="border border-gray-300 px-1.5 py-1">Sick ป่วย</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">0</td>
            <td className="border border-gray-300 px-1.5 py-1"></td>
          </tr>
          <tr>
            <td className="border border-gray-300 px-1.5 py-1">ค่าล่วงเวลา</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">{num(row.ot_hours)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(row.ot_pay)}</td>
            <td className="border border-gray-300 px-1.5 py-1">Noshow ลา</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">0</td>
            <td className="border border-gray-300 px-1.5 py-1"></td>
          </tr>
          <tr>
            <td className="border border-gray-300 px-1.5 py-1">Attendance เบี้ยขยัน</td>
            <td className="border border-gray-300 px-1.5 py-1"></td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(row.diligence)}</td>
            <td className="border border-gray-300 px-1.5 py-1">Other Deduct หักอื่นๆ</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(row.other_deduct)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center font-medium">เงินรับสุทธิ</td>
          </tr>
          <tr>
            <td className="border border-gray-300 px-1.5 py-1">เงินได้อื่นๆ</td>
            <td className="border border-gray-300 px-1.5 py-1"></td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(row.other_income + row.tax)}</td>
            <td className="border border-gray-300 px-1.5 py-1">Tax หักภาษี 3%</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(row.tax)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-center">Net To Pay</td>
          </tr>
          <tr className="sum bg-gray-100 font-bold">
            <td className="border border-gray-300 px-1.5 py-1">รวมเงินได้<br />Total Earnings</td>
            <td className="border border-gray-300 px-1.5 py-1"></td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(totalEarnings)}</td>
            <td className="border border-gray-300 px-1.5 py-1">รวมรายการหัก<br />Total Deduction</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(totalDeduction)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right text-sm">{num(row.before_tax)}</td>
          </tr>
        </tbody>
      </table>
      {row.note && <p className="text-[10px] text-gray-500 mt-1">* {row.note}</p>}
    </div>
  )
}
