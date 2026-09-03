/**
 * Incentive จากยอดขายของแต่ละสาขา — คิดแบบขั้นบันได
 *
 * แต่ละสาขามีขั้นของตัวเอง เช่น
 *   Fashion B   : >16,200 = 45 , >18,000 = 50
 *   T21 Rama3   : >3,600 = 30 , >4,200 = 35 , ... , >6,000 = 50
 *
 * ได้ขั้นสูงสุดที่ยอดขาย "เกิน" เกณฑ์ (มากกว่า ไม่ใช่เท่ากับ) ถ้ายอดขายไม่ถึง
 * ขั้นต่ำสุดจะไม่ได้ incentive เลย
 */
export interface IncentiveTier {
  id?: string
  sales_point_id: string
  /** null = ใช้กับทุกกะของสาขานี้ */
  shift_id: string | null
  min_sales: number
  amount: number
}

/** ฐานที่ใช้เทียบกับเกณฑ์: ยอดขายรายวัน หรือยอดขายทั้งรอบจ่าย */
export type IncentiveBasis = 'daily' | 'period'

export function normalizeBasis(value: string | null | undefined): IncentiveBasis {
  return value === 'period' ? 'period' : 'daily'
}

export const BASIS_LABELS: Record<IncentiveBasis, string> = {
  daily: 'ยอดขายรายวัน (จ่ายต่อวันทำงาน)',
  period: 'ยอดขายทั้งรอบจ่าย (จ่ายครั้งเดียว)',
}

/** จำนวนเงิน incentive ของยอดขายนี้ — 0 เมื่อยังไม่ถึงขั้นต่ำสุด */
export function incentiveForSales(tiers: IncentiveTier[], sales: number): number {
  let best = 0
  for (const t of tiers) {
    const min = Number(t.min_sales) || 0
    if (sales > min) best = Math.max(best, Number(t.amount) || 0)
  }
  return best
}

/** ขั้นที่ใช้จริงกับยอดขายนี้ — ไว้แสดงในรายละเอียดการคำนวณ */
export function matchedTier(tiers: IncentiveTier[], sales: number): IncentiveTier | null {
  let best: IncentiveTier | null = null
  for (const t of tiers) {
    if (sales > (Number(t.min_sales) || 0)) {
      if (!best || (Number(t.amount) || 0) > (Number(best.amount) || 0)) best = t
    }
  }
  return best
}

/**
 * เลือกชุดขั้นที่ใช้กับกะนั้น ๆ ถ้ามีขั้นที่ผูกกับกะไว้เฉพาะ (เช่น Fashion 3
 * ใช้กับคนที่เข้ากะ 09.00-18.00) จะใช้ชุดนั้น มิฉะนั้นใช้ชุดของทั้งสาขา
 */
export function tiersFor(
  all: IncentiveTier[],
  salesPointId: string | null,
  shiftId: string | null,
): IncentiveTier[] {
  if (!salesPointId) return []
  const branch = all.filter(t => t.sales_point_id === salesPointId)
  if (shiftId) {
    const forShift = branch.filter(t => t.shift_id === shiftId)
    if (forShift.length > 0) return forShift
  }
  return branch.filter(t => !t.shift_id)
}

/** เรียงจากเกณฑ์น้อยไปมาก สำหรับแสดงผล */
export function sortTiers(tiers: IncentiveTier[]): IncentiveTier[] {
  return [...tiers].sort((a, b) => (Number(a.min_sales) || 0) - (Number(b.min_sales) || 0))
}
