import { CARGO_COLORS } from '../../data/equipment'
import type { CargoItem } from '../../types'

export type ScannedCargoDraft = {
  name: string
  lengthMm: number
  widthMm: number
  heightMm: number
  weightKg: number
  quantity: number
  allowRotation: boolean
  stackable: boolean
  confidence: number
  sourceLine: string
}

/** Handles 1875 / 1,875.0 / 1.875,0 / 10,5 / 186.000 (decimal, not thousands) */
function parseNum(raw: string): number {
  const s = raw.replace(/\s/g, '')
  if (!s) return NaN
  // US thousands: 1,875.0
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    return Number(s.replace(/,/g, ''))
  }
  // EU thousands with 2+ dot groups: 1.875.000 or 1.875,50
  if (/^\d{1,3}(\.\d{3}){2,}(,\d+)?$/.test(s)) {
    return Number(s.replace(/\./g, '').replace(',', '.'))
  }
  if (/^\d{1,3}(\.\d{3})+,(\d+)$/.test(s)) {
    return Number(s.replace(/\./g, '').replace(',', '.'))
  }
  // Plain decimal: 186.000 KG, 1.536 M3, 10,5
  return Number(s.replace(',', '.'))
}

function normalizeUnit(unit: string | undefined): string | undefined {
  if (!unit) return undefined
  const u = unit.toLowerCase().replace(/\.$/, '')
  if (u === 'cms' || u === 'centimeter' || u === 'centimetre' || u === 'centimeters')
    return 'cm'
  if (u === 'mms' || u === 'millimeter' || u === 'millimetre') return 'mm'
  if (u === 'meters' || u === 'metres' || u === 'meter' || u === 'metre') return 'm'
  return u
}

function toMm(value: number, unit: string | undefined): number {
  const u = normalizeUnit(unit) ?? 'mm'
  if (u === 'm') return Math.round(value * 1000)
  if (u === 'cm') return Math.round(value * 10)
  return Math.round(value)
}

function inferName(line: string, index: number): string {
  // "Hub sektion: 2 units" / "Propel: 20 units" / "Propel:"
  const labeled = line.match(
    /^([A-Za-zÆØÅæøå][A-Za-zÆØÅæøå0-9 ./\-_]{0,48}?)\s*:\s*(?:\d+\s*(?:units?|pcs|stk|styk|pieces?))?/i,
  )
  if (labeled) {
    const name = labeled[1].trim()
    if (
      name.length >= 2 &&
      !/^(each|unit|units|dimensions?|total|cargo|length|width|height)$/i.test(
        name,
      )
    ) {
      return name
    }
  }

  const lower = line.toLowerCase()
  if (/\bpall(?:e|er|es)?\b|\beur\b|\bepal\b/.test(lower)) return `Palle ${index + 1}`
  if (/\bcolli\b|\bkolli\b|\bcollies\b/.test(lower)) return `Colli ${index + 1}`
  if (/\bpkg\b|\bpack(?:s|ages)?\b/.test(lower)) return `Pakke ${index + 1}`
  if (/\bpakke?r?\b|\bkarton|\bbox/.test(lower)) return `Pakke ${index + 1}`
  if (/\bkasse?r?\b/.test(lower)) return `Kasse ${index + 1}`
  if (/\bpcs\b|\bstk\b|\bunits?\b/.test(lower)) return `Colli ${index + 1}`
  return `Colli ${index + 1}`
}

function extractQuantity(line: string): number {
  const patterns = [
    // "3 Pall – 120X80X127" / "17 Pall – 120X80X125" / "1 PKG …"
    /^(\d+)\s*(?:x\s*)?(?:pkg|pack(?:s|ages)?|pall(?:e|er|es)?|collies|colli|kolli|pcs|stk|pieces?|units?|boxes|karton|pakke(?:r)?)\b/i,
    /(\d+)\s*(?:units?|pcs|stk|styk|pieces?|collies|colli|kolli|pkg|pall(?:e|er)?|st\b)\b/i,
    /antal[:\s]+(\d+)/i,
    /qty[:\s]+(\d+)/i,
  ]
  for (const re of patterns) {
    const m = line.match(re)
    if (m) {
      const n = Number(m[1])
      if (n > 0 && n < 10000) return n
    }
  }

  // "2x 120x80x100" — qty before dimensions, not the first dim itself
  const dimLike = line.match(
    /(\d+)\s*[x×]\s*(\d+[.,]?\d*)\s*[x×]\s*(\d+[.,]?\d*)\s*[x×/]/i,
  )
  if (dimLike && dimLike.index != null && dimLike.index > 0) {
    const before = line.slice(0, dimLike.index)
    const qx = before.match(/(\d+)\s*[x×]\s*$/i)
    if (qx) {
      const n = Number(qx[1])
      if (n > 0 && n < 10000) return n
    }
  }

  return 1
}

function extractWeight(line: string): number {
  // Skip total/header weight lines — those are handled separately
  if (
    /^(?:total\s+)?gross\s*(?:wt|weight)\b/i.test(line.trim()) ||
    /^total\s*(gross\s*)?(wt|weight|vægt)/i.test(line.trim())
  ) {
    return 0
  }
  const patterns = [
    // "/ 7200kg" or "/ 1500kg each" after dimensions
    /\/\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kg(?:\s*(?:each|ea|pr\.?|per\s*(?:unit|stk|pcs)))?/i,
    /(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kg(?:\s*(?:each|ea|pr\.?|per\s*(?:unit|stk|pcs)|\/\s*(?:stk|pcs|palle|colli|unit)))?/i,
    /(?:vægt|weight|gross\s*wt)\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)/i,
  ]
  for (const re of patterns) {
    const m = line.match(re)
    if (m) {
      const n = parseNum(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return 0
}

function extractTotalGrossWeightKg(text: string): number | null {
  const patterns = [
    /total\s*gross\s*wt\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kg/i,
    /total\s*(?:gross\s*)?(?:weight|vægt)\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kg/i,
    // Packing list header: "Gross Weight 9900 kg" / "Gross Weight\t9900 kg"
    /(?:^|\n)\s*gross\s*weight\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kg/im,
    /samlet\s*vægt\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kg/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const n = parseNum(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

type DimHit = {
  l: number
  w: number
  h: number
  unit: string
  index: number
  length: number
}

const UNIT_GROUP = '(?:mm|cms?|m|millimeters?|centimeters?|meters?)'

function findDimensions(line: string): DimHit | null {
  type Hit = {
    l: number
    w: number
    h: number
    unitRaw?: string
    unitL?: string
    unitW?: string
    unitH?: string
    index: number
    length: number
    perAxis: boolean
  }

  const candidates: Hit[] = []

  // Packing list: "120 80 160 CM" (shared unit after three dims)
  {
    const re =
      /\b(\d{2,4}(?:[.,]\d+)?)\s+(\d{2,4}(?:[.,]\d+)?)\s+(\d{2,4}(?:[.,]\d+)?)\s*(cm|cms|mm)\b/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      candidates.push({
        l: parseNum(m[1]),
        w: parseNum(m[2]),
        h: parseNum(m[3]),
        unitRaw: m[4],
        index: m.index,
        length: m[0].length,
        perAxis: false,
      })
    }
  }

  // Packing list columns: 120.00 cm  80.00 cm  160.00 cm
  {
    const re = new RegExp(
      `(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})\\s+(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})\\s+(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})`,
      'gi',
    )
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      candidates.push({
        l: parseNum(m[1]),
        w: parseNum(m[3]),
        h: parseNum(m[5]),
        unitL: m[2],
        unitW: m[4],
        unitH: m[6],
        unitRaw: m[6],
        index: m.index,
        length: m[0].length,
        perAxis: true,
      })
    }
  }

  const simplePatterns: RegExp[] = [
    // Each unit: 1550 x 1720 x 860 mm (LWH)
    new RegExp(
      `(\\d+[.,]?\\d*)\\s*[x×*]\\s*(\\d+[.,]?\\d*)\\s*[x×*]\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})?(?:\\s*\\(\\s*L\\s*W\\s*H\\s*\\))?`,
      'i',
    ),
    // Freight AWB style: 150/90/173 cms
    new RegExp(
      `(\\d+[.,]?\\d*)\\s*/\\s*(\\d+[.,]?\\d*)\\s*/\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})?`,
      'i',
    ),
    // 120-80-100 cm
    new RegExp(
      `(\\d+[.,]?\\d*)\\s*-\\s*(\\d+[.,]?\\d*)\\s*-\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})?`,
      'i',
    ),
    /l\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*[,;\s]+b\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*[,;\s]+h\s*[:=]?\s*(\d+[.,]?\d*)\s*(mm|cms?|m)?/i,
    /længde\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*.{0,24}?bredde\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*.{0,24}?højde\s*[:=]?\s*(\d+[.,]?\d*)\s*(mm|cms?|m)?/i,
  ]

  for (const re of simplePatterns) {
    const m = line.match(re)
    if (!m) continue
    candidates.push({
      l: parseNum(m[1]),
      w: parseNum(m[2]),
      h: parseNum(m[3]),
      unitRaw: m[4],
      index: m.index ?? 0,
      length: m[0].length,
      perAxis: false,
    })
  }

  // Prefer the rightmost / longest match (dims usually at end of packing rows)
  candidates.sort((a, b) => b.index - a.index || b.length - a.length)

  for (const c of candidates) {
    let l = c.l
    let w = c.w
    let h = c.h
    if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) continue

    const inferredUnit =
      normalizeUnit(c.unitRaw) ??
      (l >= 500 || w >= 500 || h >= 500
        ? 'mm'
        : l <= 20 && w <= 20 && h <= 20
          ? 'm'
          : l <= 400 && w <= 400 && h <= 400
            ? 'cm'
            : 'mm')

    if (c.perAxis) {
      l = toMm(c.l, normalizeUnit(c.unitL) ?? inferredUnit)
      w = toMm(c.w, normalizeUnit(c.unitW) ?? inferredUnit)
      h = toMm(c.h, normalizeUnit(c.unitH) ?? inferredUnit)
    } else {
      l = toMm(l, inferredUnit)
      w = toMm(w, inferredUnit)
      h = toMm(h, inferredUnit)
    }

    if (l > 0 && w > 0 && h > 0 && l < 20000 && w < 8000 && h < 8000) {
      return {
        l,
        w,
        h,
        unit: inferredUnit,
        index: c.index,
        length: c.length,
      }
    }
  }
  return null
}

function lineLooksLikeCargo(line: string): boolean {
  if (!/\d/.test(line)) return false
  // Skip pure totals / headers
  if (/^total\s+(pieces|packages|packs|gross|volume|wt)/i.test(line)) return false
  if (/^(?:quantity|gross\s*weight|volume)\b/i.test(line)) return false
  if (/^pieces?\s+piece\s*type/i.test(line)) return false
  if (/^packages?\s+type\s+weight/i.test(line)) return false
  if (/^packs?\s*\(cont/i.test(line)) return false
  if (/^dimensions?\s*$/i.test(line)) return false
  if (/med venlig hilsen|best regards/i.test(line)) return false

  return (
    /\b\d{2,4}(?:[.,]\d+)?\s+\d{2,4}(?:[.,]\d+)?\s+\d{2,4}(?:[.,]\d+)?\s*(?:cm|cms|mm)\b/i.test(
      line,
    ) ||
    /\d+[.,]?\d*\s*(?:mm|cms?|m)\s+\d+[.,]?\d*\s*(?:mm|cms?|m)\s+\d+[.,]?\d*\s*(?:mm|cms?|m)/i.test(
      line,
    ) ||
    /\d+[.,]?\d*\s*\/\s*\d+[.,]?\d*\s*\/\s*\d+/i.test(line) ||
    /\d+[.,]?\d*\s*[x×*]\s*\d+[.,]?\d*\s*[x×*]\s*\d+/i.test(line) ||
    /\d+[.,]?\d*\s*-\s*\d+[.,]?\d*\s*-\s*\d+/i.test(line) ||
    /\bl\s*[:=]?\s*\d/i.test(line) ||
    /længde/i.test(line) ||
    /each\s+unit/i.test(line) ||
    /\b(pall(?:e|er|es)?|collies|colli|kolli|pakke|karton|kasse|gods|pcs|stk|units?|pkg|pack(?:s|ages)?)\b/i.test(
      line,
    )
  )
}

/**
 * Join "Hub sektion: 2 units" + "Each unit: 1550 x … mm / 7200kg" into one block.
 */
function mergeUnitBlocks(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const next = lines[i + 1] ?? ''
    const hasQty =
      /\d+\s*(?:units?|pcs|stk|styk|pieces?)\b/i.test(line) ||
      /^[A-Za-zÆØÅæøå].{0,48}:\s*$/i.test(line)
    const nextIsUnitDim =
      /^(?:each\s+)?units?\s*:/i.test(next) ||
      (/each\s+unit/i.test(next) &&
        /\d+[.,]?\d*\s*[x×*/-]\s*\d+[.,]?\d*\s*[x×*/-]\s*\d+/i.test(next))

    if (hasQty && nextIsUnitDim) {
      out.push(`${line} | ${next}`)
      i += 1
      continue
    }
    out.push(line)
  }
  return out
}

function distributeTotalWeight(
  drafts: ScannedCargoDraft[],
  totalKg: number,
): ScannedCargoDraft[] {
  const known = drafts.map((d) =>
    d.weightKg > 0 && !isGuessedWeight(d) ? d.weightKg * d.quantity : 0,
  )
  const knownSum = known.reduce((a, b) => a + b, 0)
  const missingIdx = drafts
    .map((_, i) => (known[i] > 0 ? -1 : i))
    .filter((i) => i >= 0)

  // All rows have explicit weight — keep as-is
  if (missingIdx.length === 0) return drafts

  // No explicit weights at all — share full total by volume
  if (knownSum <= 0) {
    const volumes = drafts.map(
      (d) => (d.lengthMm * d.widthMm * d.heightMm * d.quantity) / 1e9,
    )
    const sumVol = volumes.reduce((a, b) => a + b, 0)
    if (sumVol <= 0) return drafts
    return drafts.map((d, i) => {
      const lineTotal = totalKg * (volumes[i] / sumVol)
      return {
        ...d,
        weightKg: Math.round((lineTotal / d.quantity) * 10) / 10,
        confidence: Math.min(0.98, d.confidence + 0.05),
      }
    })
  }

  // Some rows missing weight ("… kg" without number) — assign remainder by volume
  const remainder = Math.max(0, totalKg - knownSum)
  if (remainder <= 0) return drafts

  const missVol = missingIdx.map((i) => {
    const d = drafts[i]
    return (d.lengthMm * d.widthMm * d.heightMm * d.quantity) / 1e9
  })
  const sumMissVol = missVol.reduce((a, b) => a + b, 0)
  if (sumMissVol <= 0) return drafts

  return drafts.map((d, i) => {
    const mi = missingIdx.indexOf(i)
    if (mi < 0) return d
    const lineTotal = remainder * (missVol[mi] / sumMissVol)
    return {
      ...d,
      weightKg: Math.round((lineTotal / d.quantity) * 10) / 10,
      confidence: Math.min(0.98, d.confidence + 0.05),
    }
  })
}

function isGuessedWeight(d: ScannedCargoDraft): boolean {
  // Local heuristic weights are always overwritten when total exists;
  // treat all as redistributable unless source line had kg.
  return !/\d[.,\d]*\s*kg/i.test(d.sourceLine)
}

/**
 * Local extractor for logistics emails (DA/EN), incl. AWB "pcs L/W/H cms"
 * and "Name: N units / Each unit: L x W x H mm (LWH) / kg".
 */
export function scanEmailCargoLocal(text: string): ScannedCargoDraft[] {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[–—]/g, '-')

  const rawLines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const lines = mergeUnitBlocks(rawLines)

  const expanded: string[] = []
  for (const line of lines) {
    const slashHits =
      line.match(/\d+[.,]?\d*\s*\/\s*\d+[.,]?\d*\s*\/\s*\d+[.,]?\d*/gi) ?? []
    const xHits =
      line.match(/\d+[.,]?\d*\s*[x×]\s*\d+[.,]?\d*\s*[x×]\s*\d+[.,]?\d*/gi) ??
      []
    if (slashHits.length > 1 || xHits.length > 1) {
      expanded.push(
        ...line
          .split(
            /(?:;|•|·|(?=\d+\s*(?:pcs|stk|units?)?\s*\d+[.,]?\d*\s*[x×/]\s*\d))/gi,
          )
          .map((s) => s.trim())
          .filter(Boolean),
      )
    } else {
      expanded.push(line)
    }
  }

  const drafts: ScannedCargoDraft[] = []
  const seen = new Set<string>()

  for (const line of expanded) {
    if (!lineLooksLikeCargo(line)) continue
    const dim = findDimensions(line)
    if (!dim) continue

    // Prefer qty from header ("20 units"), not from "Each unit"
    const headerPart = line.includes('|') ? line.split('|')[0]! : line
    const qtyFromHeader = extractQuantity(headerPart)
    const qty =
      qtyFromHeader > 1 || /\d+\s*units?\b/i.test(headerPart)
        ? Math.max(1, qtyFromHeader)
        : extractQuantity(line)

    const weightKg = extractWeight(line)
    const name = inferName(headerPart, drafts.length)
    // Include weight so identical dims with different kg stay separate rows
    const key = `${dim.l}x${dim.w}x${dim.h}|${Math.round(weightKg * 10) / 10}|${name}`
    const existing = drafts.find(
      (d) =>
        d.lengthMm === dim.l &&
        d.widthMm === dim.w &&
        d.heightMm === dim.h &&
        Math.abs(d.weightKg - (weightKg || d.weightKg)) < 0.05 &&
        d.name.replace(/\s+\d+$/, '') === name.replace(/\s+\d+$/, ''),
    )
    if (existing && weightKg > 0) {
      existing.quantity += qty
      continue
    }
    if (seen.has(key) && weightKg > 0) {
      // same dims+weight already added
      const hit = drafts.find(
        (d) =>
          d.lengthMm === dim.l &&
          d.widthMm === dim.w &&
          d.heightMm === dim.h &&
          Math.abs(d.weightKg - weightKg) < 0.05,
      )
      if (hit) {
        hit.quantity += qty
        continue
      }
    }
    seen.add(key)

    let confidence = 0.75
    if (/\b(mm|cms?|m)\b/i.test(line)) confidence += 0.1
    if (/each\s+unit/i.test(line) || /\bunits?\b/i.test(line)) confidence += 0.1
    if (/\//.test(line) && /\bpcs\b/i.test(line)) confidence += 0.08
    if (weightKg > 0) confidence += 0.07
    confidence = Math.min(0.98, confidence)

    const lineNonStack =
      /ikke\s*stabl|no\s*stack|non[\s-]?stack|ej\s*stabel|not\s*stackable|unstackable/i.test(
        line,
      ) ||
      /\bstackable\s*[:=]?\s*no\b/i.test(line) ||
      /\bno\s*$/i.test(line.trim())

    drafts.push({
      name,
      lengthMm: dim.l,
      widthMm: dim.w,
      heightMm: dim.h,
      weightKg: weightKg || guessDefaultWeight(dim.l, dim.w, dim.h, name),
      quantity: qty,
      allowRotation: true,
      stackable: !lineNonStack,
      confidence,
      sourceLine: line.slice(0, 160),
    })
  }

  // Global note e.g. "Det hele er non stack"
  const globalNonStack =
    /(?:det\s+hele\s+er\s+)?non[\s-]?stack|all\s+non[\s-]?stack|ikke\s*stabelbart|nothing\s+stackable|no\s+stacking/i.test(
      normalized,
    )
  if (globalNonStack) {
    for (const d of drafts) d.stackable = false
  }

  const totalKg = extractTotalGrossWeightKg(normalized)
  if (totalKg && drafts.length) {
    return distributeTotalWeight(drafts, totalKg)
  }

  return drafts
}

function guessDefaultWeight(
  l: number,
  w: number,
  h: number,
  name: string,
): number {
  const m3 = (l * w * h) / 1e9
  if (/palle/i.test(name)) return Math.max(50, Math.round(m3 * 250))
  return Math.max(5, Math.round(m3 * 150))
}

export function draftsToCargoItems(drafts: ScannedCargoDraft[]): CargoItem[] {
  return drafts.map((d, i) => ({
    id: crypto.randomUUID(),
    name: d.name,
    lengthMm: d.lengthMm,
    widthMm: d.widthMm,
    heightMm: d.heightMm,
    weightKg: d.weightKg,
    quantity: d.quantity,
    allowRotation: d.allowRotation,
    stackable: d.stackable,
    color: CARGO_COLORS[i % CARGO_COLORS.length],
  }))
}

export type ScanImageInput = {
  /** data:image/...;base64,... */
  dataUrl: string
}

export type ScanEmailOptions = {
  image?: ScanImageInput | null
}

function splitDataUrl(dataUrl: string): {
  mediaType: string
  base64: string
} | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!m) return null
  return { mediaType: m[1], base64: m[2] }
}

export async function scanEmailCargo(
  text: string,
  options: ScanEmailOptions = {},
): Promise<{
  drafts: ScannedCargoDraft[]
  mode: 'local' | 'openai' | 'anthropic'
}> {
  const trimmed = text.trim()
  const image = options.image?.dataUrl ? options.image : null

  if (!trimmed && !image) return { drafts: [], mode: 'local' }

  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY?.trim()

  if (image && !anthropicKey && !openaiKey) {
    throw new Error(
      'Skærmklip kræver VITE_OPENAI_API_KEY eller VITE_ANTHROPIC_API_KEY i .env',
    )
  }

  if (anthropicKey) {
    try {
      const drafts = await scanWithAnthropic(trimmed, anthropicKey, image)
      if (drafts.length) return { drafts, mode: 'anthropic' }
    } catch (err) {
      if (image && !openaiKey) throw err
      // fall through
    }
  }

  if (openaiKey) {
    try {
      const drafts = await scanWithOpenAI(trimmed, openaiKey, image)
      if (drafts.length) return { drafts, mode: 'openai' }
    } catch (err) {
      if (image) throw err
      // fall through
    }
  }

  if (image) {
    throw new Error('Kunne ikke læse skærmklippet via AI')
  }

  return { drafts: scanEmailCargoLocal(trimmed), mode: 'local' }
}

const EXTRACT_PROMPT = `Du er en logistik-assistent for NOR Spedition.
Udtræk ALLE colli/paller/pakker/units fra mailteksten og/eller skærmklip (packing list, tabel, AWB).
Understøt formater som:
- "1 pcs 150/90/173 cms"
- "2x 120x80x100 cm"
- "L1200 B800 H1000"
- "Hub sektion: 2 units" + "Each unit: 1550 x 1720 x 860 mm (LWH) / 7200kg"
- "Propel: 20 units" + "Each unit: 1425 x 1100 x 600 mm (LWH) / 1500kg each"
- Tabeller: Pieces | Piece type | Length | Width | Height | Volume | Weight | Stackable
- Rækker: "1 PKG 186.000 KG 1.536 M3 120 80 160 CM" (L B H + fælles CM)
quantity = antal units/pcs. weightKg = vægt PR. unit (ikke linje-total, medmindre qty=1).
"non stack" / "Stackable No" → stackable: false. "Stackable Yes" → stackable: true.
Hvis "Gross Weight" / "Total Gross Wt" findes og linjer mangler vægt, fordel resten proportionelt efter rumfang.
Læs tal fra billedet omhyggeligt (cm → mm *10).
Returnér KUN valid JSON-array (ingen markdown) med objekter:
{
  "name": string,
  "lengthMm": number,
  "widthMm": number,
  "heightMm": number,
  "weightKg": number,
  "quantity": number,
  "allowRotation": boolean,
  "stackable": boolean,
  "confidence": number,
  "sourceLine": string
}
Konvertér altid mål til millimeter. cms/cm → mm (*10). Behold navne som "Hub sektion" / "Propel" / "Collies".`

function parseModelJson(content: string): ScannedCargoDraft[] {
  const cleaned = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < 0) return []
  const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown
  if (!Array.isArray(arr)) return []
  return arr
    .map((row) => {
      const r = row as Record<string, unknown>
      return {
        name: String(r.name ?? 'Gods'),
        lengthMm: Math.round(Number(r.lengthMm) || 0),
        widthMm: Math.round(Number(r.widthMm) || 0),
        heightMm: Math.round(Number(r.heightMm) || 0),
        weightKg: Number(r.weightKg) || 0,
        quantity: Math.max(1, Math.round(Number(r.quantity) || 1)),
        allowRotation: r.allowRotation !== false,
        stackable: r.stackable !== false,
        confidence: Math.min(1, Number(r.confidence) || 0.85),
        sourceLine: String(r.sourceLine ?? '').slice(0, 160),
      } satisfies ScannedCargoDraft
    })
    .filter((d) => d.lengthMm > 0 && d.widthMm > 0 && d.heightMm > 0)
}

async function scanWithOpenAI(
  text: string,
  apiKey: string,
  image?: ScanImageInput | null,
): Promise<ScannedCargoDraft[]> {
  const userContent: unknown[] = [
    {
      type: 'text',
      text:
        text.trim() ||
        'Udtræk alle colli fra skærmklippet (packing list / tabel).',
    },
  ]
  if (image?.dataUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: image.dataUrl },
    })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: image ? 'gpt-4o-mini' : 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: EXTRACT_PROMPT },
        { role: 'user', content: image ? userContent : text.slice(0, 12000) },
      ],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return parseModelJson(data.choices?.[0]?.message?.content ?? '')
}

async function scanWithAnthropic(
  text: string,
  apiKey: string,
  image?: ScanImageInput | null,
): Promise<ScannedCargoDraft[]> {
  const parts: unknown[] = []
  const parsed = image?.dataUrl ? splitDataUrl(image.dataUrl) : null
  if (parsed) {
    parts.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: parsed.mediaType,
        data: parsed.base64,
      },
    })
  }
  parts.push({
    type: 'text',
    text:
      text.trim() ||
      'Udtræk alle colli fra skærmklippet (packing list / tabel).',
  })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0,
      system: EXTRACT_PROMPT,
      messages: [
        {
          role: 'user',
          content: image ? parts : text.slice(0, 12000),
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[]
  }
  const textOut = data.content?.find((c) => c.type === 'text')?.text ?? ''
  return parseModelJson(textOut)
}

/** Resize/compress screenshot for vision APIs (max edge 1600px, JPEG). */
export async function prepareScanImage(file: Blob): Promise<ScanImageInput> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Filen er ikke et billede')
  }

  const bitmap = await createImageBitmap(file)
  const maxEdge = 1600
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Kunne ikke læse billedet')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { dataUrl }
}
