'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getAdminRole, getAuthHeaders } from '@/lib/utils'

interface Employee {
  id: string; name: string; employee_type: string; job_title: string | null; salary_type: string
  sales_point_id: string | null; daily_rate: number; monthly_salary: number
  ot_rate: number; commission_rate: number; phone: string | null
  is_active: number; qr_code: string | null; face_descriptor: string | null; created_at: string
}
interface SalesPoint { id: string; name: string }

const PRESET_POSITIONS = ['kitchen', 'sales', 'head_office']

export default function EmployeeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [positionPreset, setPositionPreset] = useState('kitchen')
  const [jobTitleCustom, setJobTitleCustom] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const role = typeof window !== 'undefined' ? getAdminRole() : ''
  const [form, setForm] = useState({
    name: '', job_title: 'kitchen', employee_type: 'kitchen', salary_type: 'daily',
    sales_point_id: '', daily_rate: 350, monthly_salary: 0, ot_rate: 50, commission_rate: 0, phone: '',
    work_start: '08:00', work_end: '18:00', work_days: [1, 2, 3, 4, 5] as number[],
  })

  useEffect(() => {
    const r = getAdminRole()
    if (!r || r === 'viewer' || r === 'admin') { router.replace('/employees'); return }
    Promise.all([
      fetch(`/api/employees/${id}`, { headers: getAuthHeaders() }).then(r => r.json()),
      fetch('/api/sales-points').then(r => r.json()),
    ]).then(([empData, spData]: [any, any]) => {
      if (empData.error === 'Forbidden') { setForbidden(true); setLoading(false); return }
      if (empData.employee) {
        const emp = empData.employee
        setEmployee(emp)
        const storedTitle = emp.job_title || emp.employee_type || 'kitchen'
        const preset = PRESET_POSITIONS.includes(storedTitle) ? storedTitle : 'other'
        setPositionPreset(preset)
        if (preset === 'other') setJobTitleCustom(storedTitle)
        setForm({
          name: emp.name,
          job_title: storedTitle,
          employee_type: emp.employee_type,
          salary_type: emp.salary_type || 'daily',
          sales_point_id: emp.sales_point_id || '',
          daily_rate: emp.daily_rate,
          monthly_salary: emp.monthly_salary || 0,
          ot_rate: emp.ot_rate,
          commission_rate: emp.commission_rate || 0,
          phone: emp.phone || '',
          work_start: emp.work_start || '08:00',
          work_end: emp.work_end || '18:00',
          work_days: emp.work_days
            ? String(emp.work_days).split(',').map(Number).filter((n: number) => !Number.isNaN(n))
            : [1, 2, 3, 4, 5],
        })
      }
      setSalesPoints(spData.salesPoints || [])
      setLoading(false)
    })
  }, [id])

  const isOfficePosition = positionPreset === 'head_office' || positionPreset === 'other'

  const handlePositionChange = (preset: string) => {
    setPositionPreset(preset)
    if (preset !== 'other') {
      const employeeType = preset === 'sales' ? 'sales' : 'kitchen'
      setForm(f => ({
        ...f,
        job_title: preset,
        employee_type: employeeType,
        ...(preset === 'head_office' ? { salary_type: 'monthly' } : {}),
      }))
    } else {
      setForm(f => ({ ...f, job_title: '', employee_type: 'kitchen' }))
    }
  }

  const toggleWorkDay = (day: number) => {
    setForm(f => ({
      ...f,
      work_days: f.work_days.includes(day)
        ? f.work_days.filter(d => d !== day)
        : [...f.work_days, day].sort(),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('')
    try {
      const actualJobTitle = positionPreset === 'other' ? jobTitleCustom.trim() : form.job_title
      const res = await fetch(`/api/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...form,
          job_title: actualJobTitle,
          sales_point_id: positionPreset === 'sales' ? form.sales_point_id : null,
          monthly_salary: form.salary_type === 'monthly' ? form.monthly_salary : 0,
          daily_rate: form.salary_type === 'monthly' ? 0 : form.daily_rate,
          work_start: isOfficePosition ? form.work_start : undefined,
          work_end: isOfficePosition ? form.work_end : undefined,
          work_days: isOfficePosition ? form.work_days.join(',') : undefined,
        }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return }
      setSuccess('บันทึกข้อมูลสำเร็จ'); setEmployee(data.employee)
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('เกิดข้อผิดพลาด') } finally { setSaving(false) }
  }

  const handleClearFace = async () => {
    if (!confirm('ต้องการลบข้อมูลใบหน้าใช่หรือไม่?')) return
    try {
      await fetch(`/api/employees/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ face_descriptor: '' }) })
      setEmployee(prev => prev ? { ...prev, face_descriptor: null } : null)
    } catch { setError('เกิดข้อผิดพลาด') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
  if (forbidden) return (
    <div className="text-center py-12">
      <p className="text-gray-500 font-medium">ไม่มีสิทธิ์เข้าถึงข้อมูลพนักงานคนนี้</p>
      <p className="text-sm text-gray-400 mt-1">บัญชีของคุณไม่มีสิทธิ์ดูข้อมูลพนักงาน Office</p>
      <button onClick={() => router.push('/employees')} className="btn-secondary mt-4">กลับ</button>
    </div>
  )
  if (!employee) return <div className="text-center py-12"><p className="text-gray-500">ไม่พบข้อมูลพนักงาน</p><button onClick={() => router.push('/employees')} className="btn-primary mt-4">กลับ</button></div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/employees')} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div><h1 className="text-2xl font-bold text-gray-900">แก้ไขข้อมูลพนักงาน</h1><p className="text-gray-500 text-sm">{employee.name}</p></div>
      </div>
      {success && <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">{success}</div>}
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">ข้อมูลพื้นฐาน</h2>
          <div>
            <label className="label">ชื่อ-นามสกุล *</label>
            <input type="text" className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label">ตำแหน่งงาน</label>
            <select className="input-field" value={positionPreset} onChange={e => handlePositionChange(e.target.value)}>
              <option value="kitchen">ครัวกลาง</option>
              <option value="sales">พนักงานขายหน้าร้าน</option>
              {role === 'superadmin' && <option value="head_office">Head Office</option>}
              {role === 'superadmin' && <option value="other">อื่นๆ ระบุเอง</option>}
            </select>
            {positionPreset === 'other' && (
              <input
                type="text"
                className="input-field mt-2"
                placeholder="ระบุตำแหน่งงาน เช่น ผู้จัดการ, บัญชี..."
                value={jobTitleCustom}
                onChange={e => setJobTitleCustom(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="label">ประเภทรายได้</label>
            <div className="grid grid-cols-2 gap-3">
              {(['daily', 'monthly'] as const).map(st => (
                <label key={st}
                  className={`flex items-center gap-3 border-2 rounded-xl p-3 cursor-pointer transition-colors ${form.salary_type === st ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="salary_type" value={st} checked={form.salary_type === st}
                    onChange={() => setForm({ ...form, salary_type: st })} className="accent-blue-600" />
                  <div>
                    <p className="font-medium text-sm">{st === 'daily' ? 'รายวัน' : 'รายเดือน'}</p>
                    <p className="text-xs text-gray-400">{st === 'daily' ? 'คิดตามวันที่มาทำงาน' : 'เงินเดือนคงที่ต่อเดือน'}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {positionPreset === 'sales' && (
            <div>
              <label className="label">จุดขายประจำ</label>
              <select className="input-field" value={form.sales_point_id} onChange={e => setForm({ ...form, sales_point_id: e.target.value })}>
                <option value="">-- เลือกจุดขาย --</option>
                {salesPoints.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
            </div>
          )}
          {isOfficePosition && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-purple-800">เวลาทำงาน (สังกัดสำนักงานใหญ่ — ไม่มีกะ)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">เวลาเข้างาน</label>
                  <input type="time" className="input-field" value={form.work_start}
                    onChange={e => setForm({ ...form, work_start: e.target.value })} />
                </div>
                <div>
                  <label className="label">เวลาเลิกงาน</label>
                  <input type="time" className="input-field" value={form.work_end}
                    onChange={e => setForm({ ...form, work_end: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">วันทำงาน</label>
                <div className="flex flex-wrap gap-2">
                  {[{ d: 1, l: 'จ' }, { d: 2, l: 'อ' }, { d: 3, l: 'พ' }, { d: 4, l: 'พฤ' }, { d: 5, l: 'ศ' }, { d: 6, l: 'ส' }, { d: 0, l: 'อา' }].map(({ d, l }) => (
                    <button key={d} type="button" onClick={() => toggleWorkDay(d)}
                      className={`w-11 h-11 rounded-lg text-sm font-medium transition-colors ${
                        form.work_days.includes(d) ? 'bg-purple-600 text-white' : 'bg-white border border-gray-300 text-gray-500 hover:border-purple-400'
                      }`}>
                      {l}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1.5">มาสายเมื่อเข้างานเกิน 15 นาที · ตรวจ GPS กับสำนักงานใหญ่</p>
              </div>
            </div>
          )}
          <div>
            <label className="label">เบอร์โทรศัพท์</label>
            <input type="tel" className="input-field" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">โครงสร้างรายได้</h2>
          {form.salary_type === 'monthly' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">เงินเดือน/เดือน (฿)</label>
                <input type="number" className="input-field" value={form.monthly_salary}
                  onChange={e => setForm({ ...form, monthly_salary: Number(e.target.value) })} min={0} step="any" />
              </div>
              <div>
                <label className="label">ค่า OT/ชั่วโมง (฿)</label>
                <input type="number" className="input-field" value={form.ot_rate}
                  onChange={e => setForm({ ...form, ot_rate: Number(e.target.value) })} min={0} step="any" />
              </div>
              <div className="col-span-2 bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700">
                รายได้ = เงินเดือน {form.monthly_salary.toLocaleString()} ฿/เดือน + (OT × ชั่วโมง OT)
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">ค่าแรงรายวัน (฿)</label>
                <input type="number" className="input-field" value={form.daily_rate}
                  onChange={e => setForm({ ...form, daily_rate: Number(e.target.value) })} min={0} step="any" />
              </div>
              <div>
                <label className="label">ค่า OT/ชั่วโมง (฿)</label>
                <input type="number" className="input-field" value={form.ot_rate}
                  onChange={e => setForm({ ...form, ot_rate: Number(e.target.value) })} min={0} step="any" />
              </div>
              <div>
                <label className="label">ค่าคอมมิชชั่น (%)</label>
                <input type="number" className="input-field" value={form.commission_rate}
                  onChange={e => setForm({ ...form, commission_rate: Number(e.target.value) })} min={0} max={100} step="any" />
              </div>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">ข้อมูลใบหน้า & QR Code</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Face ID</p>
              {employee.face_descriptor ? <p className="text-sm text-green-600">✓ ลงทะเบียนใบหน้าแล้ว</p> : <p className="text-sm text-gray-400">ยังไม่ได้ลงทะเบียนใบหน้า</p>}
            </div>
            {employee.face_descriptor && <button type="button" onClick={handleClearFace} className="text-sm text-red-500 hover:text-red-700">ลบข้อมูลใบหน้า</button>}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">QR Code</p>
            {employee.qr_code ? <span className="font-mono text-sm bg-gray-100 px-3 py-1 rounded">{employee.qr_code}</span> : <p className="text-sm text-gray-400">ไม่มี QR Code</p>}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => router.push('/employees')} className="btn-secondary flex-1">ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}</button>
        </div>
      </form>
    </div>
  )
}
