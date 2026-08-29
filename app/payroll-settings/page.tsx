'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'

interface PayrollSetting {
  key: string
  value: string
  label: string
  category: string
  unit: string
}

const categoryMeta: Record<string, { label: string; note: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  allowance: {
    label: 'เบี้ยเลี้ยง',
    note: 'จำนวนเงินที่จะนำไปใช้เป็นค่าเริ่มต้นเมื่อคำนวณเงินเดือน',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: (
      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  daytype: {
    label: 'ตัวคูณค่าแรงตามประเภทวัน',
    note: 'ตัวคูณที่ใช้คิดค่าแรงตามประเภทของวัน เช่น วันหยุดนักขัตฤกษ์ หรือวันเสาร์-อาทิตย์',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: (
      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  ot: {
    label: 'ตัวคูณ OT',
    note: 'ตัวคูณที่ใช้คำนวณค่าล่วงเวลา (OT) ตามประเภทของวันที่ทำงาน',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: (
      <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  deduction: {
    label: 'อัตราการหัก',
    note: 'อัตราที่ใช้คำนวณการหักเงินจากเงินเดือน เช่น ประกันสังคม ภาษี และค่ามัดจำ',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: (
      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  diligence: {
    label: 'เบี้ยขยัน & เกณฑ์มาสาย',
    note: 'กำหนดว่าเข้างานช้ากี่นาทีถือว่าสาย (แยกตามแผนก) และหักเบี้ยขยันเท่าไร ต่อรอบจ่ายหรือทุกครั้งที่สาย',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: (
      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
}

const categoryOrder = ['allowance', 'daytype', 'ot', 'deduction', 'diligence']

export default function PayrollSettingsPage() {
  const [settings, setSettings] = useState<PayrollSetting[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/payroll-settings')
      .then((r) => r.json() as Promise<{ settings: PayrollSetting[] }>)
      .then((data) => {
        setSettings(data.settings || [])
        const init: Record<string, string> = {}
        for (const s of data.settings || []) init[s.key] = s.value
        setValues(init)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/payroll-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) { setError('บันทึกไม่สำเร็จ'); return }
      setSuccess('บันทึกการตั้งค่าเรียบร้อยแล้ว')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  const grouped: Record<string, PayrollSetting[]> = {}
  for (const s of settings) {
    if (!grouped[s.category]) grouped[s.category] = []
    grouped[s.category].push(s)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ตั้งค่าเงินเดือน</h1>
        <p className="text-gray-500 text-sm mt-1">กำหนดค่าเริ่มต้นสำหรับการคำนวณเงินเดือน</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <>
          {categoryOrder.map((cat) => {
            const meta = categoryMeta[cat]
            const items = grouped[cat] || []
            if (!items.length) return null
            return (
              <div key={cat} className={`card border ${meta.border} space-y-4`}>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 ${meta.bg} rounded-lg flex items-center justify-center`}>
                    {meta.icon}
                  </div>
                  <div>
                    <h2 className={`font-semibold ${meta.color}`}>{meta.label}</h2>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{meta.note}</p>
                <div className="space-y-3">
                  {items.map((s) => (
                    <div key={s.key} className="flex items-center gap-3">
                      <label className="flex-1 text-sm text-gray-700">{s.label}</label>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${meta.bg} ${meta.color} border ${meta.border}`}>
                        {s.unit}
                      </span>
                      <input
                        type="number"
                        className="input-field w-28 text-right"
                        value={values[s.key] ?? s.value}
                        onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                        step="any"
                        min={0}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
          )}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}
          </button>
        </>
      )}
    </div>
  )
}
