'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/lib/utils'
import { APP_VERSION, formatBuildTime } from '@/lib/version'

interface RecentRow {
  date: string
  check_in: string | null
  check_out: string | null
  employee_name: string | null
  tz_fixed: number
}

function hhmm(s: string | null): string {
  if (!s) return '-'
  const m = s.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : '-'
}

export default function FixTimePage() {
  const [pending, setPending] = useState<number | null>(null)
  const [appliedAt, setAppliedAt] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [health, setHealth] = useState<any>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/fix-timezone', { headers: getAuthHeaders() }).then(r => r.json()),
      fetch('/api/health').then(r => r.json()).catch(() => null),
    ]).then(([d, h]: any) => {
      if (d?.error) setToast({ msg: d.error, ok: false })
      else { setPending(d.pending_count); setAppliedAt(d.applied_at || null); setRecent(d.recent || []) }
      setHealth(h)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const runFix = async () => {
    if (!confirm('เลื่อนเวลาเข้า-ออกของรายการเก่า (+7 ชั่วโมง) ให้เป็นเวลากรุงเทพ?\n\nรายการที่แก้แล้วจะไม่ถูกแก้ซ้ำ')) return
    setRunning(true)
    try {
      const res = await fetch('/api/admin/fix-timezone', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await res.json() as any
      if (res.ok) {
        setToast({ msg: `แก้ไขเรียบร้อย ${d.fixed} รายการ`, ok: true })
        load()
      } else {
        setToast({ msg: d.error || 'เกิดข้อผิดพลาด', ok: false })
      }
    } catch {
      setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false })
    } finally {
      setRunning(false)
      setTimeout(() => setToast(null), 5000)
    }
  }

  const tzOk = health && health.server_utc_time && health.bangkok_time &&
    health.server_utc_time.slice(11, 13) !== health.bangkok_time.slice(11, 13)

  return (
    <div className="space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-100">แก้เวลาย้อนหลังเป็นเวลากรุงเทพ</h1>
        <p className="text-gray-400 text-sm mt-1">
          รายการที่สแกนไว้ก่อนอัปเดตระบบถูกบันทึกเป็นเวลา GMT (ช้ากว่าจริง 7 ชั่วโมง) — กดปุ่มด้านล่างเพื่อแก้ให้ถูกต้อง
        </p>
      </div>

      {/* Server clock check */}
      <div className={`rounded-xl p-4 border ${tzOk ? 'bg-green-900/30 border-green-700' : 'bg-yellow-900/30 border-yellow-700'}`}>
        <p className={`font-semibold text-sm ${tzOk ? 'text-green-300' : 'text-yellow-300'}`}>
          {tzOk ? '✓ ระบบบันทึกเวลาใหม่เป็นเวลากรุงเทพแล้ว' : 'กำลังตรวจสอบนาฬิกาของระบบ...'}
        </p>
        {health && (
          <div className="text-xs text-gray-400 mt-1.5 space-y-0.5 font-mono">
            <p>เวอร์ชัน: v{health.version} · อัปเดต {health.build_time_bangkok}</p>
            <p>นาฬิกาเซิร์ฟเวอร์ (GMT): {health.server_utc_time}</p>
            <p className="text-green-400">เวลาที่ใช้บันทึก (กรุงเทพ): {health.bangkok_time}</p>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="bg-gray-800 rounded-xl p-5 space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><div className="w-7 h-7 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {appliedAt ? (
              <p className="text-green-400 font-medium">
                ✓ แก้เวลาย้อนหลังเรียบร้อยแล้ว เมื่อ {new Date(appliedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
              </p>
            ) : (
              <p className="text-gray-200">
                รายการที่ยังไม่ได้แก้: <span className="font-bold text-xl text-yellow-400">{pending ?? 0}</span> รายการ
              </p>
            )}
            <button
              onClick={runFix}
              disabled={running || !!appliedAt || (pending ?? 0) === 0}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors">
              {running ? 'กำลังแก้ไข...' : appliedAt ? 'แก้ไขไปแล้ว' : (pending ?? 0) === 0 ? 'ไม่มีรายการที่ต้องแก้' : `แก้เวลา ${pending} รายการ (+7 ชม.)`}
            </button>
            <p className="text-xs text-gray-500">ทำได้ครั้งเดียวเท่านั้น — รายการที่สแกนหลังจากนี้เป็นเวลากรุงเทพอยู่แล้ว</p>
          </>
        )}
      </div>

      {/* Recent records */}
      <div className="bg-gray-800 rounded-xl p-5">
        <h2 className="font-semibold text-gray-100 mb-3">รายการล่าสุดในระบบ</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-3 py-2 text-left text-xs text-gray-400">วันที่</th>
                <th className="px-3 py-2 text-left text-xs text-gray-400">พนักงาน</th>
                <th className="px-3 py-2 text-center text-xs text-gray-400">เข้า</th>
                <th className="px-3 py-2 text-center text-xs text-gray-400">ออก</th>
                <th className="px-3 py-2 text-center text-xs text-gray-400">สถานะเวลา</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {recent.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-gray-300 font-mono text-xs">{r.date}</td>
                  <td className="px-3 py-2 text-gray-200">{r.employee_name || '-'}</td>
                  <td className="px-3 py-2 text-center font-mono text-gray-200">{hhmm(r.check_in)}</td>
                  <td className="px-3 py-2 text-center font-mono text-gray-200">{hhmm(r.check_out)}</td>
                  <td className="px-3 py-2 text-center">
                    {r.tz_fixed ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300">เวลากรุงเทพ</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900 text-yellow-300">ยังไม่ได้แก้</span>
                    )}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">ไม่มีข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center">v{APP_VERSION} · อัปเดต {formatBuildTime()}</p>
    </div>
  )
}
