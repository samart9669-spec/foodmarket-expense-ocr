'use client'

// Extracts the face descriptor (the numeric encoding used for recognition)
// from a photo, in the browser. Registering a photo without this leaves the
// employee unrecognised by the scanners, so both employee forms run it at
// save time instead of leaving it to the first scanner session.

let modelsLoaded = false

async function loadFaceApi() {
  const faceapi = await import('face-api.js')
  if (!modelsLoaded && !faceapi.nets.tinyFaceDetector.isLoaded) {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ])
  }
  modelsLoaded = true
  return faceapi
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    setTimeout(() => reject(new Error('timeout')), 15000)
    img.src = src
  })
}

/**
 * Returns the descriptor as a JSON string ready to store, or null when no
 * face could be detected in the photo.
 */
export async function extractFaceDescriptor(photoDataUrl: string): Promise<string | null> {
  try {
    const faceapi = await loadFaceApi()
    const img = await loadImage(photoDataUrl)
    // Larger inputSize than the live scanner: a still photo is worth the
    // extra accuracy, and this runs once.
    const det = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
      .withFaceLandmarks(true)
      .withFaceDescriptor()
    if (!det) return null
    return JSON.stringify(Array.from(det.descriptor))
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────
// กรอบใบหน้า — ใช้ร่วมกันทั้งตอนลงทะเบียนและตอนสแกนเข้างาน
//
// ใบหน้าที่เล็กเกินไปในเฟรมทำให้ได้ descriptor คุณภาพต่ำ ทั้งตอนลงทะเบียน
// (จดจำผิด) และตอนสแกน (จับคู่ไม่ติดหรือติดผิดคน) จึงบังคับให้ใบหน้าอยู่ใน
// กรอบ ขนาดพอดี และอยู่กลางภาพก่อนจะถ่ายหรือนับว่าสแกน
// ─────────────────────────────────────────────────────────────────────

/** สัดส่วนภาพที่แสดงกล้อง (กว้าง:สูง) ทั้งหน้าลงทะเบียนและหน้าสแกน */
export const FACE_VIEW_ASPECT = 4 / 3
/** ความสูงของกรอบวงรีเทียบกับความสูงภาพ */
export const FACE_GUIDE_HEIGHT = 0.78
/** ใบหน้าในรูปที่อัปโหลด ต้องกว้างอย่างน้อยกี่พิกเซล ถึงจะได้ข้อมูลที่ใช้จำได้ */
export const MIN_FACE_PX = 110

export interface FaceBox { x: number; y: number; width: number; height: number }

export interface FaceFit {
  ok: boolean
  level: 'none' | 'far' | 'close' | 'off' | 'ok'
  hint: string
  /** ความสูงใบหน้าเทียบความสูงภาพที่มองเห็น */
  ratio: number
}

/**
 * ส่วนของเฟรมวิดีโอที่ผู้ใช้เห็นจริง เมื่อแสดงแบบ object-cover ในกรอบ 4:3
 * (กล้องบางตัวให้ภาพ 16:9 ซึ่งถูกตัดด้านข้าง) — ต้องตรวจตำแหน่งใบหน้าเทียบกับ
 * ส่วนที่เห็น ไม่ใช่ทั้งเฟรม ไม่งั้นกรอบบนจอกับที่ตรวจจะไม่ตรงกัน
 */
export function visibleRect(videoW: number, videoH: number) {
  const aspect = videoW / videoH
  if (aspect > FACE_VIEW_ASPECT) {
    const w = videoH * FACE_VIEW_ASPECT
    return { x: (videoW - w) / 2, y: 0, width: w, height: videoH }
  }
  const h = videoW / FACE_VIEW_ASPECT
  return { x: 0, y: (videoH - h) / 2, width: videoW, height: h }
}

/** ตรวจว่าใบหน้าพอดีกรอบหรือยัง และบอกว่าต้องขยับอย่างไร */
export function evaluateFaceFit(
  box: FaceBox | null,
  videoW: number,
  videoH: number,
  opts: { minRatio?: number; maxRatio?: number } = {},
): FaceFit {
  if (!box) return { ok: false, level: 'none', hint: 'ไม่พบใบหน้า — หันหน้าเข้ากล้อง', ratio: 0 }
  const minRatio = opts.minRatio ?? 0.42
  const maxRatio = opts.maxRatio ?? 0.82

  const vis = visibleRect(videoW, videoH)
  const ratio = box.height / vis.height
  const cx = box.x + box.width / 2 - vis.x
  const cy = box.y + box.height / 2 - vis.y
  const dx = (cx - vis.width / 2) / vis.width
  const dy = (cy - vis.height / 2) / vis.height

  if (ratio < minRatio) return { ok: false, level: 'far', hint: 'เข้าใกล้กล้องอีกนิด ให้ใบหน้าเต็มกรอบ', ratio }
  if (ratio > maxRatio) return { ok: false, level: 'close', hint: 'ถอยออกเล็กน้อย ใบหน้าใหญ่เกินกรอบ', ratio }
  if (Math.abs(dx) > 0.14 || Math.abs(dy) > 0.16) {
    return { ok: false, level: 'off', hint: 'ขยับใบหน้าให้อยู่กลางกรอบ', ratio }
  }
  return { ok: true, level: 'ok', hint: 'ตำแหน่งพอดี — อยู่นิ่ง ๆ', ratio }
}

export interface FaceAnalysis {
  ok: boolean
  /** ข้อความบอกผู้ใช้เมื่อไม่ผ่าน */
  reason?: string
  /** รูปที่ครอปให้เห็นใบหน้าขนาดพอดีแล้ว พร้อมเก็บลงระบบ */
  photo?: string
  descriptor?: string
  /** ความกว้างใบหน้าในรูปต้นฉบับ (พิกเซล) */
  facePx?: number
}

/**
 * ตรวจรูปใบหน้า แล้วครอปให้ใบหน้าอยู่กลางภาพในขนาดมาตรฐาน
 *  - ใบหน้าเล็กเกินไป (ต่ำกว่า MIN_FACE_PX) ปฏิเสธ — ขยายรูปไม่ได้ข้อมูลเพิ่ม
 *  - ผ่านแล้วครอปเป็นสี่เหลี่ยมจัตุรัสรอบใบหน้า เก็บเป็นรูปประจำตัวและใช้สร้าง descriptor
 */
export async function analyzeFacePhoto(src: string): Promise<FaceAnalysis> {
  try {
    const faceapi = await loadFaceApi()
    const img = await loadImage(src)
    const det = await faceapi.detectSingleFace(
      img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }),
    )
    if (!det) {
      return { ok: false, reason: 'ไม่พบใบหน้าในรูป — ถ่ายให้เห็นหน้าชัด ตรงกล้อง และมีแสงเพียงพอ' }
    }

    const box = det.box
    const facePx = Math.round(Math.min(box.width, box.height))
    if (facePx < MIN_FACE_PX) {
      return {
        ok: false, facePx,
        reason: `ใบหน้าในรูปเล็กเกินไป (กว้างเพียง ${facePx} พิกเซล ต้องอย่างน้อย ${MIN_FACE_PX}) — ถ่ายใหม่ให้ใบหน้าเต็มกรอบ หรือใช้รูปที่ใกล้ใบหน้ากว่านี้`,
      }
    }

    // ครอปสี่เหลี่ยมจัตุรัสรอบใบหน้า ให้ใบหน้าครอบครองราวครึ่งหนึ่งของภาพ
    const natW = img.naturalWidth, natH = img.naturalHeight
    let side = Math.max(box.width, box.height) * 1.9
    side = Math.min(side, natW, natH)
    let sx = box.x + box.width / 2 - side / 2
    let sy = box.y + box.height / 2 - side / 2
    sx = Math.max(0, Math.min(sx, natW - side))
    sy = Math.max(0, Math.min(sy, natH - side))

    const OUT = 320
    const canvas = document.createElement('canvas')
    canvas.width = OUT; canvas.height = OUT
    canvas.getContext('2d')!.drawImage(img, sx, sy, side, side, 0, 0, OUT, OUT)
    const photo = canvas.toDataURL('image/jpeg', 0.85)

    // descriptor จากรูปที่ครอปแล้ว เพื่อให้ตรงกับรูปที่เก็บไว้
    const descriptor = await extractFaceDescriptor(photo)
    if (!descriptor) {
      return { ok: false, facePx, reason: 'ประมวลผลใบหน้าไม่สำเร็จ — ลองถ่ายใหม่ให้หน้าตรงและแสงสว่างขึ้น' }
    }
    return { ok: true, photo, descriptor, facePx }
  } catch {
    return { ok: false, reason: 'ตรวจจับใบหน้าไม่สำเร็จ กรุณาลองใหม่' }
  }
}

export { loadFaceApi }

// ─────────────────────────────────────────────────────────────────────
// ตัดสินผลการจับคู่ใบหน้า — ไม่เดาเมื่อกำกวม
//
// เดิมเลือกคนที่ใกล้ที่สุดแล้วผ่านเลยถ้าใกล้พอ โดยไม่ดูว่ามีอีกคนใกล้พอกัน
// สองคนที่หน้าคล้ายกันจึงสลับกันไปมาตามแสงและมุมของแต่ละวัน ตอนนี้ถ้าคนอันดับ 1
// กับอันดับ 2 ห่างกันน้อยเกินไป จะไม่ลงเวลาให้เอง แต่ให้เจ้าตัวเลือกชื่อ
// ─────────────────────────────────────────────────────────────────────

/** ระยะห่างสูงสุดที่ยอมรับว่าเป็นคนเดียวกัน (ยิ่งน้อยยิ่งเข้มงวด) */
export const MATCH_THRESHOLD = 0.45
/**
 * คนอันดับ 1 ต้องใกล้กว่าอันดับ 2 อย่างน้อยเท่านี้ ถึงถือว่าชัดเจน
 * คนละคนปกติห่างกัน 0.6 ขึ้นไป ส่วนคู่ที่หน้าคล้ายกันมักอยู่ราว 0.4-0.55
 */
export const AMBIGUITY_MARGIN = 0.10

export interface MatchCandidate { id: string; distance: number }

export type MatchVerdict =
  | { kind: 'unknown' }
  | { kind: 'clear'; id: string; distance: number }
  | { kind: 'ambiguous'; ids: [string, string] }

export function classifyMatch(
  candidates: MatchCandidate[],
  threshold = MATCH_THRESHOLD,
  margin = AMBIGUITY_MARGIN,
): MatchVerdict {
  const sorted = [...candidates].sort((a, b) => a.distance - b.distance)
  const best = sorted[0]
  if (!best || best.distance >= threshold) return { kind: 'unknown' }
  const second = sorted[1]
  if (second && second.distance - best.distance < margin) {
    return { kind: 'ambiguous', ids: [best.id, second.id] }
  }
  return { kind: 'clear', id: best.id, distance: best.distance }
}

export type TrackerAction =
  | { type: 'none' }
  | { type: 'progress'; id: string; count: number }
  | { type: 'confirm'; id: string }
  | { type: 'choose'; ids: string[] }

/**
 * นับผลทีละเฟรม:
 *  - คนเดิมชัดเจนต่อเนื่อง `required` รอบ  -> confirm
 *  - กำกวมต่อเนื่อง `ambiguousFrames` รอบ -> choose (ให้เลือกชื่อเอง)
 *  - ผลสลับไปมาระหว่างสองคน `maxFlips` ครั้ง -> choose ด้วย (กรณีสลับกันทีละเฟรม
 *    ซึ่งไม่เคยครบรอบยืนยัน และผู้ใช้จะเห็นแต่แถบที่ค้างอยู่)
 */
export class MatchTracker {
  private candidate: { id: string; count: number } | null = null
  private flips = 0
  private flipIds: string[] = []
  private ambiguousStreak = 0
  private ambiguousIds: string[] = []

  constructor(
    private required = 4,
    private ambiguousFrames = 3,
    private maxFlips = 2,
  ) {}

  reset() {
    this.candidate = null
    this.flips = 0
    this.flipIds = []
    this.ambiguousStreak = 0
    this.ambiguousIds = []
  }

  /** verdict = null เมื่อไม่มีใบหน้าที่ใช้ได้ในเฟรมนั้น */
  push(verdict: MatchVerdict | null): TrackerAction {
    if (!verdict || verdict.kind === 'unknown') {
      this.reset()
      return { type: 'none' }
    }

    if (verdict.kind === 'ambiguous') {
      this.candidate = null
      this.ambiguousStreak++
      this.ambiguousIds = verdict.ids
      if (this.ambiguousStreak >= this.ambiguousFrames) {
        const ids = this.ambiguousIds
        this.reset()
        return { type: 'choose', ids }
      }
      return { type: 'none' }
    }

    // clear
    this.ambiguousStreak = 0
    if (this.candidate && this.candidate.id === verdict.id) {
      this.candidate.count++
    } else {
      if (this.candidate) {
        this.flips++
        this.flipIds = [this.candidate.id, verdict.id]
      }
      this.candidate = { id: verdict.id, count: 1 }
    }
    if (this.flips >= this.maxFlips) {
      const ids = Array.from(new Set(this.flipIds))
      this.reset()
      return { type: 'choose', ids }
    }
    if (this.candidate.count >= this.required) {
      const id = this.candidate.id
      this.reset()
      return { type: 'confirm', id }
    }
    return { type: 'progress', id: verdict.id, count: this.candidate.count }
  }
}
