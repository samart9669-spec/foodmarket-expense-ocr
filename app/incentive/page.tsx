'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/lib/utils'
import { BASIS_LABELS, type IncentiveBasis } from '@/lib/incentive'

interface SalesPoint {
  id: string
  name: string
  incentive_rate: number
  incentive_basis: IncentiveBasis
}

interface Shift {
  id: string
  name: string
  start_time: string
  end_time: string
}

interface TierRow {
  key: string
  shift_id: string
  min_sales: string
  amount: string
}

let keySeq = 0
const newKey = () => `t${++keySeq}`

function emptyTier(): TierRow {
  return { key: newKey(), shift_id: '', min_sales: '', amount: '' }
}

export default function IncentivePage() {
  const [points, setPoints] = useState<SalesPoint[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [selected, setSelected] = useState('')
  const [basis, setBasis] = useState<IncentiveBasis>('daily')
  const [tiers, setTiers] = useState<TierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const load = useCallback((keepSelection?: string) => {
    setLoading(true)
    fetch('/api/incentive-tiers', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then((d: any) => {
        if (d?.error) { setToast({ msg: d.error, ok: false }); return }
        const pts: SalesPoint[] = d.sales_points || []
        setPoints(pts)
        setShifts(d.shifts || [])
        const pick = keepSelection || selected || pts[0]?.id || ''
        setSelected(pick)
        const point = pts.find(p => p.id === pick)
        setBasis(point?.incentive_basis || 'daily')
        setTiers(
          (d.tiers || [])
            .filter((t: any) => t.sales_point_id === pick)
            .map((t: any) => ({
              key: newKey(),
              shift_id: t.shift_id || '',
              min_sales: String(t.min_sales ?? ''),
              amount: String(t.amount ?? ''),
            }))
        )
      })
      .catch(() => setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false }))
      .finally(() => setLoading(false))
  // `selected` is read as a fallback only; re-running on it would fight the user
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  const pickBranch = (id: string) => {
    setSelected(id)
    setToast(null)
    load(id)
  }

  const patch = (key: string, field: keyof TierRow, value: string) => {
    setTiers(prev => prev.map(t => t.key === key ? { ...t, [field]: value } : t))
  }

  const save = async () => {
    if (!selected) return
    const payload = tiers
      .filter(t => t.min_sales !== '' && t.amount !== '')
      .map(t => ({
        shift_id: t.shift_id || null,
        min_sales: Number(t.min_sales),
        amount: Number(t.amount),
      }))
    setSaving(true)
    try {
      const res = await fetch('/api/incentive-tiers', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sales_point_id: selected, incentive_basis: basis, tiers: payload }),
      })
      const d = await res.json() as any
      if (res.ok) {
        setToast({ msg: `บันทึกเกณฑ์แล้ว ${d.saved} ขั้น`, ok: true })
        load(selected)
      } else {
        setToast({ msg: d.error || 'เกิดข้อผิดพลาด', ok: false })
      }
    } catch {
      setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const point = points.find(p => p.id === selected)
  const sorted = [...tiers].sort((a, b) => (Number(a.min_sales) || 0) - (Number(b.min_sales) || 0))

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">เกณฑ์ Incentive ยอดขาย</h1>
        <p className="text-sm text-gray-500 mt-1">
          ตั้งเกณฑ์แบบขั้นบันไดของแต่ละสาขา — ยอดขาย <strong>เกิน</strong> เกณฑ์ขั้นไหน ได้เงินขั้นนั้น
          ถ้าเกินหลายขั้นจะได้ขั้นที่สูงที่สุด ถ้ายอดขายไม่ถึงขั้นต่ำสุดจะไม่ได้ incentive
        </p>
        <p className="text-sm text-gray-500 mt-1">
          ตัวอย่าง Fashion B: เกิน 16,200 = 45 บาท, เกิน 18,000 = 50 บาท
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-gray-600">สาขา</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[220px]"
            value={selected}
            onChange={e => pickBranch(e.target.value)}
          >
            {points.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label className="text-sm font-medium text-gray-600 ml-2">คิดจาก</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={basis}
            onChange={e => setBasis(e.target.value as IncentiveBasis)}
          >
            {(Object.keys(BASIS_LABELS) as IncentiveBasis[]).map(b => (
              <option key={b} value={b}>{BASIS_LABELS[b]}</option>
            ))}
          </select>
        </div>

        {point && tiers.length === 0 && (point.incentive_rate || 0) > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
            สาขานี้ยังใช้แบบเปอร์เซ็นต์อยู่ ({point.incentive_rate}% ของยอดขาย)
            เมื่อบันทึกเกณฑ์ขั้นบันไดแล้ว ระบบจะใช้เกณฑ์ขั้นบันไดแทน
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left w-24">ยอดขายเกิน</th>
                <th className="px-3 py-2 text-left w-24">ได้ (฿)</th>
                <th className="px-3 py-2 text-left">ใช้กับกะ</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tiers.map(t => (
                <tr key={t.key}>
                  <td className="px-3 py-2">
                    <input
                      type="number" step="any" min={0}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1"
                      value={t.min_sales}
                      onChange={e => patch(t.key, 'min_sales', e.target.value)}
                      placeholder="16200"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number" step="any" min={0}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1"
                      value={t.amount}
                      onChange={e => patch(t.key, 'amount', e.target.value)}
                      placeholder="45"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
                      value={t.shift_id}
                      onChange={e => patch(t.key, 'shift_id', e.target.value)}
                    >
                      <option value="">ทุกกะของสาขานี้</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>เฉพาะ {s.name} ({s.start_time}-{s.end_time})</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setTiers(prev => prev.filter(x => x.key !== t.key))}
                      className="text-red-500 hover:underline text-xs"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
              {tiers.length === 0 && !loading && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">ยังไม่มีเกณฑ์ กด &quot;+ เพิ่มขั้น&quot; เพื่อเริ่ม</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setTiers(prev => [...prev, emptyTier()])}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            + เพิ่มขั้น
          </button>
          <button
            onClick={save}
            disabled={saving || !selected}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกเกณฑ์สาขานี้'}
          </button>
        </div>

        {toast && (
          <div className={`rounded-lg px-4 py-3 text-sm ${toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {toast.msg}
          </div>
        )}
      </div>

      {sorted.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">สรุปเกณฑ์ {point?.name}</h2>
          <ul className="text-sm text-gray-600 space-y-1">
            {sorted.filter(t => t.min_sales !== '' && t.amount !== '').map(t => {
              const sh = shifts.find(s => s.id === t.shift_id)
              return (
                <li key={t.key}>
                  ยอดขายเกิน <strong>{Number(t.min_sales).toLocaleString('th-TH')}</strong> ได้{' '}
                  <strong className="text-blue-700">{Number(t.amount).toLocaleString('th-TH')}</strong> บาท
                  {basis === 'daily' ? ' ต่อวันทำงาน' : ' ต่อรอบจ่าย'}
                  {sh && <span className="text-violet-600"> — เฉพาะ {sh.name} ({sh.start_time}-{sh.end_time})</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
