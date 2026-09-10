/**
 * เงื่อนไขการจ่ายรายบุคคล
 *
 * พนักงานบางคนตกลงเป็นยอดคงที่ต่อรอบจ่าย ไม่ใช่ค่าแรงรายวัน และบางคนมีข้อยกเว้น
 * เช่น ไม่คิด OT ไม่มีเบี้ยขยัน หรือมีบริษัทคู่สัญญาร่วมจ่ายบางส่วน
 */

/** รอบการจ่ายเงิน */
export type PayCycle = 'monthly' | 'semimonthly' | 'weekly' | 'daily'

export const PAY_CYCLE_LABELS: Record<PayCycle, string> = {
  monthly: 'รายเดือน (1 งวด/เดือน)',
  semimonthly: 'ครึ่งเดือน (2 งวด/เดือน)',
  weekly: 'รายสัปดาห์ (4 งวด/เดือน)',
  daily: 'รายวัน (ตามวันที่มาทำงาน)',
}

/** จำนวนงวดต่อเดือนของแต่ละรอบจ่าย */
export const CYCLES_PER_MONTH: Record<PayCycle, number> = {
  monthly: 1,
  semimonthly: 2,
  weekly: 4,
  daily: 0, // ไม่ใช้ยอดคงที่
}

export function normalizePayCycle(value: string | null | undefined): PayCycle {
  if (value === 'semimonthly' || value === 'weekly' || value === 'daily') return value
  return 'monthly'
}

export interface PayTerms {
  /** 'monthly' = ยอดคงที่ต่อรอบ, 'daily' = ค่าแรงรายวัน */
  salary_type: string
  monthly_salary: number
  pay_cycle: PayCycle
  /** ไม่คิด OT ให้คนนี้ (เช่น บริษัทคู่สัญญาเป็นผู้จ่าย OT) */
  no_ot: boolean
  /** ไม่มีเบี้ยขยัน ทั้งยอดจ่ายและยอดหัก */
  no_diligence: boolean
  /** ได้รับ incentive จากยอดขายสาขาหรือไม่ */
  incentive_eligible: boolean
  /** ชื่อบริษัทคู่สัญญาที่ร่วมจ่าย */
  partner_name: string | null
  /** ยอดที่คู่สัญญาจ่ายต่อ 1 งวด */
  partner_share: number
}

export function payTermsOf(employee: any): PayTerms {
  return {
    salary_type: employee?.salary_type || 'daily',
    monthly_salary: Number(employee?.monthly_salary) || 0,
    pay_cycle: normalizePayCycle(employee?.pay_cycle),
    no_ot: Number(employee?.no_ot) === 1,
    no_diligence: Number(employee?.no_diligence) === 1,
    // ค่าเริ่มต้นคือได้ เพื่อไม่เปลี่ยนพฤติกรรมของข้อมูลเดิม
    incentive_eligible: Number(employee?.incentive_eligible ?? 1) !== 0,
    partner_name: employee?.partner_name || null,
    partner_share: Number(employee?.partner_share) || 0,
  }
}

/** ยอดเงินเดือนคงที่ต่อ 1 งวดจ่าย — 0 เมื่อเป็นพนักงานรายวัน */
export function amountPerCycle(terms: PayTerms): number {
  if (terms.salary_type !== 'monthly') return 0
  const per = CYCLES_PER_MONTH[terms.pay_cycle]
  if (!per) return terms.monthly_salary
  return Math.round((terms.monthly_salary / per) * 100) / 100
}

/** ส่วนที่บริษัทเราจ่ายจริงต่อ 1 งวด หลังหักส่วนของคู่สัญญา */
export function ownSharePerCycle(terms: PayTerms): number {
  return Math.max(0, amountPerCycle(terms) - Math.max(0, terms.partner_share))
}

/** พนักงานคนนี้ได้ OT หรือไม่ — รายเดือนไม่ได้อยู่แล้ว และธงนี้ปิดเพิ่มได้ */
export function earnsOT(terms: PayTerms): boolean {
  if (terms.no_ot) return false
  return terms.salary_type !== 'monthly'
}
