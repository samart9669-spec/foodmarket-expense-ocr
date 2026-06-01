'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'

interface Employee {
  id: string; name: string; employee_type: string; sales_point_id: string | null
  daily_rate: number; ot_rate: number; commission_rate: number; phone: string | null
  is_active: number; qr_code: string | null; face_descriptor: string | null; created_at: string
}
interface SalesPoint { id: string; name: string }

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
  const [form, setForm] = useState({ name: '', employee_type: 'kitchen', sales_point_id: '', daily_rate: 350, ot_rate: 50, commission_rate: 0, phone: '' })

  useEffect(() => {
    Promise.all([
      fetch(`/api/employees/${id}`).then((r) => r.json()),
      fetch('/api/sales-points').then((r) => r.json()),
    ]).then(([empData, spData]: [any, any]) => {
      if (empData.employee) {
        const emp = empData.employee
        setEmployee(emp)
        setForm({ name: emp.name, employee_type: emp.employee_type, sales_point_id: emp.sales_point_id || '', daily_rate: emp.daily_rate, ot_rate: emp.ot_rate, commission_rate: emp.commission_rate || 0, phone: emp.phone || '' })
      }
      setSalesPoints(spData.salesPoints || [])
      setLoading(false)
    })
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`/api/employees/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sales_point_id: form.employee_type === 'sales' ? form.sales_point_id : null }) })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return }
      setSuccess('บันทึกข้อมูลสำเร็จ'); setEmployee(data.employee); setTimeout(() => setSuccess(''), 3000)
    } catch { setError('เกิดข้อผิดพลาด') } finally { setSaving(false) }
  }

  const handleClearFace = async () => {
    if (!confirm('ต้องการลบข้อมูลใบหน้าใช่หรือไม่?')) return
    try {
      await fetch(`/api/employees/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ face_descriptor: '' }) })
      setEmployee((prev) => prev ? { ...prev, face_descriptor: null } : null)
    } catch { setError('เกิดข้อผิดพลาด') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
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
          <div><label className="label">ชื่อ-นามสกุล *</label><input type="text" className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><label className="label">ประเภทพนักงาน</label>
            <select className="input-field" value={form.employee_type} onChange={(e) => setForm({ ...form, employee_type: e.target.value })}>
              <option value="kitchen">ครัวกลาง</option><option value="sales">พนักงานขายหน้าร้าน</option>
            </select>
          </div>
          {form.employee_type === 'sales' && (
            <div><label className="label">จุดขายประจำ</label>
              <select className="input-field" value={form.sales_point_id} onChange={(e) => setForm({ ...form, sales_point_id: e.target.value })}>
                <option value="">-- เลือกจุดขาย --</option>
                {salesPoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
            </div>
          )}
          <div><label className="label">เบอร์โทรศัพท์</label><input type="tel" className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">โครงสร้างรายได้</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="label">ค่าแรงรายวัน (฿)</label><input type="number" className="input-field" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: Number(e.target.value) })} min={0} step={50} /></div>
            <div><label className="label">ค่า OT/ชั่วโมง (฿)</label><input type="number" className="input-field" value={form.ot_rate} onChange={(e) => setForm({ ...form, ot_rate: Number(e.target.value) })} min={0} step={10} /></div>
            <div><label className="label">ค่าคอมมิชชั่น (%)</label><input type="number" className="input-field" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: Number(e.target.value) })} min={0} max={100} step={0.5} /></div>
          </div>
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
          <div><p className="text-sm font-medium text-gray-700">QR Code</p>{employee.qr_code ? <span className="font-mono text-sm bg-gray-100 px-3 py-1 rounded">{employee.qr_code}</span> : <p className="text-sm text-gray-400">ไม่มี QR Code</p>}</div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => router.push('/employees')} className="btn-secondary flex-1">ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}</button>
        </div>
      </form>
    </div>
  )
}
