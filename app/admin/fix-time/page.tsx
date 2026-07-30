'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/lib/utils'
import { APP_VERSION, formatBuildTime } from '@/lib/version'

interface Rec {
  id: string
  date: string
  check_in: string | null
  check_out: string | null
  employee_name: string | null
  suspicious: boolean
}

function hhmm(s: string | null): string {
  if (!s) return '-'
  const m = s.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : '-'
}

function shifted(s: string | null, hours: number): string {
  if (!s) return '-'
  const m = s.match(/(\d{2}):(\d{2})/)
  if (!m) return '-'
  const total = (Number(m[1]) * 60 + Number(m[2]) + hours * 60 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function FixTimePage() {
  const [records, setRecords] = useState<Rec[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [health, setHealth] = useState<any>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/fix-timezone?days=30', { headers: getAuthHeaders() }).then(r => r.json()),
      fetch('/api/health').then(r => r.json()).catch(() => null),
    ]).then(([d, h]: any) => {
      if (d?.error) setToast({ msg: d.error, ok: false })
      else setRecords(d.records || [])
      setHealth(h)
      setSelected(new Set())
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectSuspicious = () => setSelected(new Set(records.filter(r => r.suspicious).map(r => r.id)))

  const apply = async (hours: number) => {
    if (selected.size === 0) return
    if (!confirm(`${hours > 0 ? 'บวก' : 'ลบ'} ${Math.abs(hours)} ชั่วโมง ให้ ${selected.size} รายการที่เลือก?`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/fix-timezone', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), hours }),
      })
      const d = await res.json() as any
      if (res.ok) { setToast({ msg: `แก้ไขแล้ว ${d.updated} รายการ`, ok: true }); load() }
      else setToast({ msg: d.error || 'เกิดข้อผิดพลาด', ok: false })
    } catch {
      setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 5000)
    }
  }

  const suspiciousCount = records.filter(r => r.suspicious).length

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-100">แก้เวลาย้อนหลัง</h1>
        <p className="text-gray-400 text-sm mt-1">
          เลือกเฉพาะรายการที่เวลาผิด แล้วกดปรับ +7 ชั่วโมง — รายการที่เวลาถูกอยู่แล้วอย่าเลือก
        </p>
      </div>

      {health && (
        <div className="rounded-xl p-4 border bg-green-900/30 border-green-700">
          <p className="font-semibold text-sm text-green-300">นาฬิกาเซิร์ฟเวอร์ที่ใช้บันทึกตอนนี้</p>
          <div className="text-xs text-gray-400 mt-1.5 space-y-0.5 font-mono">
            <p>เวอร์ชัน v{health.version} · อัปเดต {health.build_time_bangkok}</p>
            <p>GMT: {health.server_utc_time}</p>
            <p className="text-green-400">กรุงเทพ: {health.bangkok_time} ← เวลาที่บันทึกใหม่จะใช้ค่านี้</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-gray-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <span className="text-gray-300 text-sm">
          เลือกแล้ว <span className="font-bold text-blue-400">{selected.size}</span> รายการ
        </span>
        {suspiciousCount > 0 && (
          <button onClick={selectSuspicious}
            className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium">
            เลือกรายการที่น่าจะผิด ({suspiciousCount})
          </button>
        )}
        <button onClick={() => setSelected(new Set())}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">
          ล้างที่เลือก
        </button>
        <div className="flex-1" />
        <button onClick={() => apply(7)} disabled={saving || selected.size === 0}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg font-semibold text-sm">
          {saving ? 'กำลังบันทึก...' : '+7 ชั่วโมง'}
        </button>
        <button onClick={() => apply(-7)} disabled={saving || selected.size === 0}
          className="px-5 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded-lg font-semibold text-sm">
          −7 ชั่วโมง (ย้อนกลับ)
        </button>
      </div>

      {/* Records */}
      <div className="bg-gray-800 rounded-xl p-5">
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-500">ไม่มีข้อมูลการเข้างาน 30 วันล่าสุด</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400">วันที่</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-400">พนักงาน</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-400">เวลาปัจจุบัน</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-400">ถ้า +7 ชม. จะเป็น</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-400">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {records.map(r => (
                  <tr key={r.id} className={selected.has(r.id) ? 'bg-blue-900/30' : r.suspicious ? 'bg-yellow-900/20' : ''}>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" className="w-4 h-4 accent-blue-500"
                        checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                    <td className="px-3 py-2 text-gray-300 font-mono text-xs">{r.date}</td>
                    <td className="px-3 py-2 text-gray-200">{r.employee_name || '-'}</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-200">
                      {hhmm(r.check_in)} - {hhmm(r.check_out)}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-blue-300">
                      {shifted(r.check_in, 7)} - {shifted(r.check_out, 7)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.suspicious ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900 text-yellow-300">น่าจะเป็นเวลา GMT</span>
                      ) : (
                        <span className="text-xs text-gray-500">ดูปกติ</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">
          ระบบเดาว่า "น่าจะเป็นเวลา GMT" เมื่อเช็คอินก่อน 05:00 น. ซึ่งแทบไม่เกิดขึ้นจริง — แต่ควรตรวจดูก่อนกดทุกครั้ง
        </p>
      </div>

      <p className="text-xs text-gray-600 text-center">v{APP_VERSION} · อัปเดต {formatBuildTime()}</p>
    </div>
  )
}
