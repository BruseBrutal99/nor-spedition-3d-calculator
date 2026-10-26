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

/**
 * Danish/EU packing weights: "1.057 kg" / "4.608 kg" / "19.129 kg" use
 * '.' as thousands separator (→ 1057 / 4608 / 19129), not decimals.
 */
function parseKgNum(raw: string): number {
  const s = raw.replace(/\s/g, '')
  if (!s) return NaN
  // 10.079,00 / 1.875,5
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    return Number(s.replace(/\./g, '').replace(',', '.'))
  }
  // 1.057 / 4.608 / 19.129 — exactly 3 digits after dot → thousands
  if (/^\d{1,3}\.\d{3}$/.test(s)) {
    return Number(s.replace(/\./g, ''))
  }
  // 1.057.000
  if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    return Number(s.replace(/\./g, ''))
  }
  return parseNum(s)
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
      !/^(each|unit|units|dimensions?|total|cargo|length|width|wide|height)$/i.test(
        name,
      )
    ) {
      return name
    }
  }

  const lower = line.toLowerCase()
  if (/\bpallets?\b|\bpall(?:e|er|es)?\b|\beur\b|\bepal\b/.test(lower))
    return `Palle ${index + 1}`
  if (/\bcolli\b|\bkolli\b|\bcollies\b/.test(lower)) return `Colli ${index + 1}`
  if (/\bpkg\b|\bpack(?:s|ages)?\b/.test(lower)) return `Pakke ${index + 1}`
  if (/\bpakke?r?\b|\bkarton|\bbox/.test(lower)) return `Pakke ${index + 1}`
  if (/\bkasse?r?\b/.test(lower)) return `Kasse ${index + 1}`
  if (/\bpcs\b|\bstk\b|\bunits?\b/.test(lower)) return `Colli ${index + 1}`
  if (/\bpackage\b/.test(lower)) return `Pakke ${index + 1}`
  return `Colli ${index + 1}`
}

/** Detect L/W/H unit from packing-list headers (Length / Wide / Height + cm). */
function detectTableDimUnit(text: string): 'cm' | 'mm' | 'm' | null {
  const head = text.slice(0, 1600)
  // Danish TMS / NOR: Pos | Koli | Koli type | L(m) | B(m) | H(m) | Vægt
  if (
    /L\s*\(\s*m\s*\)/i.test(head) &&
    /B\s*\(\s*m\s*\)/i.test(head) &&
    /H\s*\(\s*m\s*\)/i.test(head)
  ) {
    return 'm'
  }
  if (
    /\bkoli\b/i.test(head) &&
    /vægt/i.test(head) &&
    /(?:L\s*\(\s*m\s*\)|længde)/i.test(head)
  ) {
    return 'm'
  }

  const hasLwH =
    /(?:length|længde|læng)\b/i.test(head) &&
    /(?:wide|width|bredde|bred)\b/i.test(head) &&
    /(?:height|højde|høj)\b/i.test(head)
  const hasPackageTable =
    /\bpackage\b/i.test(head) &&
    /(?:gross|net\.?\s*weight|vægt)/i.test(head) &&
    /(?:length|wide|width|height)/i.test(head)

  if (!hasLwH && !hasPackageTable) return null

  if (/\bmm\b/i.test(head) && !/\bcm\b/i.test(head)) return 'mm'
  if (/\bm\b(?!\w)/i.test(head) && !/\bcm\b/i.test(head) && !/\bmm\b/i.test(head))
    return 'm'
  // Default for freight packing lists: cm (this format uses "Wide" + cm)
  return 'cm'
}

type TableRowHit = {
  packageNo: number
  quantity: number
  grossKg: number
  netKg: number
  l: number
  w: number
  h: number
  sourceLine: string
}

function extractLineNumbers(line: string): number[] {
  return [...line.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+[.,]?\d*)/g)].map(
    (m) => parseNum(m[1]),
  )
}

/**
 * Danish TMS rows: Pos | Koli | type | L(m) | B(m) | H(m) | Vægt
 * e.g. "1  2  EUR  1,20  0,80  1,00  450"
 */
function parseMeterCargoRows(text: string): TableRowHit[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) =>
      l
        .replace(/\|/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)

  const rows: TableRowHit[] = []

  for (const line of lines) {
    if (/^total\b|^pos\b|^koli\b/i.test(line) && !/^\d/.test(line)) continue
    if (/^total\b/i.test(line)) continue

    const nums = extractLineNumbers(line)
    if (nums.length < 3) continue

    // Find L B H as three values in meter range (truck cargo).
    // Avoid treating Pos/Koli (e.g. 1 2 …) as dimensions — prefer fractional meters.
    let dimAt = -1
    let bestScore = -1
    for (let i = 0; i <= nums.length - 3; i++) {
      const l = nums[i]!
      const w = nums[i + 1]!
      const h = nums[i + 2]!
      if (
        !(
          l >= 0.05 &&
          l <= 16 &&
          w >= 0.05 &&
          w <= 3.5 &&
          h >= 0.05 &&
          h <= 4.5
        )
      ) {
        continue
      }
      const frac =
        (!Number.isInteger(l) ? 1 : 0) +
        (!Number.isInteger(w) ? 1 : 0) +
        (!Number.isInteger(h) ? 1 : 0)
      const after = nums[i + 3]
      let score = frac * 5 + i
      if (after != null && after >= 1 && after <= 50000) score += 3
      // Integer triples at the start are almost always Pos/Koli/…
      if (i === 0 && frac === 0) score -= 8
      if (w > l * 1.5 && l < 3) score -= 2
      if (score > bestScore) {
        bestScore = score
        dimAt = i
      }
    }
    if (dimAt < 0) continue

    const l = nums[dimAt]!
    const w = nums[dimAt + 1]!
    const h = nums[dimAt + 2]!
    const before = nums.slice(0, dimAt)
    const after = nums.slice(dimAt + 3)

    let packageNo = rows.length + 1
    let quantity = 1
    if (before.length >= 2 && Number.isInteger(before[0]) && Number.isInteger(before[1])) {
      packageNo = before[0]!
      quantity = Math.max(1, before[1]!)
    } else if (before.length === 1 && Number.isInteger(before[0])) {
      packageNo = before[0]!
    }

    let grossKg = 0
    for (const n of after) {
      if (n >= 1 && n <= 50000) {
        grossKg = n
        break
      }
    }
    // Weight sometimes sits before dims: Pos Koli Weight L B H
    if (!grossKg && before.length >= 3) {
      const maybeWt = before[before.length - 1]!
      if (maybeWt >= 5 && maybeWt <= 50000 && !Number.isInteger(l)) {
        grossKg = maybeWt
      }
    }

    const lMm = toMm(l, 'm')
    const wMm = toMm(w, 'm')
    const hMm = toMm(h, 'm')
    if (lMm < 50 || wMm < 50 || hMm < 50) continue
    if (lMm > 20000 || wMm > 8000 || hMm > 8000) continue

    rows.push({
      packageNo,
      quantity,
      grossKg,
      netKg: 0,
      l: lMm,
      w: wMm,
      h: hMm,
      sourceLine: line.slice(0, 160),
    })
  }

  return rows
}

/**
 * Parse rows like:
 *   1  1190  1180  335  175  170
 *   1 | 1190 | 1180 | 335 | 175 | 170
 * Package | Gross | Net | Length | Wide | Height (cm)
 */
function parsePackingListTableRows(
  text: string,
  unit: 'cm' | 'mm' | 'm',
): TableRowHit[] {
  if (unit === 'm') {
    const meterRows = parseMeterCargoRows(text)
    if (meterRows.length) return meterRows
  }

  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) =>
      l
        .replace(/\|/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)

  const rows: TableRowHit[] = []

  for (const line of lines) {
    if (/^total\b/i.test(line)) continue
    if (/^(?:package|no\.?|gross|net\.?|length|wide|width|height|kg|cm|mm|pos|koli)\b/i.test(
      line,
    ) && !/^\d/.test(line))
      continue
    // Pure unit row: "kg kg cm cm cm"
    if (/^(?:kg|cm|mm|m)(?:\s+(?:kg|cm|mm|m))+$/i.test(line)) continue

    // no, gross, net, L, W, H  OR  no, gross, L, W, H  OR  L, W, H with leading no
    const nums = extractLineNumbers(line)
    if (nums.length < 4) continue

    let packageNo = 0
    let grossKg = 0
    let netKg = 0
    let l = 0
    let w = 0
    let h = 0

    if (nums.length >= 6) {
      // Prefer last 5 as: gross net L W H when first looks like package index
      const [a, b, c, d, e, f] = nums.slice(0, 6)
      if (a >= 1 && a <= 500 && Number.isInteger(a)) {
        packageNo = a
        grossKg = b
        netKg = c
        l = d
        w = e
        h = f
      } else {
        // gross net L W H (+ maybe extra)
        grossKg = a
        netKg = b
        l = c
        w = d
        h = e
      }
    } else if (nums.length === 5) {
      const [a, b, c, d, e] = nums
      if (a >= 1 && a <= 500 && Number.isInteger(a) && b >= 1) {
        packageNo = a
        grossKg = b
        l = c
        w = d
        h = e
      } else {
        grossKg = a
        l = b
        w = c
        h = d
        // e unused / maybe weight trailing
      }
    } else if (nums.length === 4) {
      const [a, b, c, d] = nums
      if (a >= 1 && a <= 500 && Number.isInteger(a)) {
        packageNo = a
        l = b
        w = c
        h = d
      } else {
        l = a
        w = b
        h = c
        grossKg = d
      }
    }

    if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) continue

    // Sanity: dims in declared unit
    const lMm = toMm(l, unit)
    const wMm = toMm(w, unit)
    const hMm = toMm(h, unit)
    if (lMm < 50 || wMm < 50 || hMm < 50) continue
    if (lMm > 20000 || wMm > 8000 || hMm > 8000) continue
    // Package index shouldn't be confused with a dimension row
    if (packageNo > 0 && packageNo === l && w < 10) continue

    rows.push({
      packageNo: packageNo || rows.length + 1,
      quantity: 1,
      grossKg: grossKg > 0 ? grossKg : 0,
      netKg: netKg > 0 ? netKg : 0,
      l: lMm,
      w: wMm,
      h: hMm,
      sourceLine: line.slice(0, 160),
    })
  }

  return rows
}

function packingListRowsToDrafts(rows: TableRowHit[]): ScannedCargoDraft[] {
  const drafts: ScannedCargoDraft[] = []
  for (const row of rows) {
    const weightKg = row.grossKg || row.netKg || 0
    const qty = Math.max(1, row.quantity || 1)
    const existing = drafts.find(
      (d) =>
        d.lengthMm === row.l &&
        d.widthMm === row.w &&
        d.heightMm === row.h &&
        Math.abs(d.weightKg - (weightKg || d.weightKg)) < 0.05,
    )
    if (existing) {
      existing.quantity += qty
      continue
    }
    drafts.push({
      name: `Pakke ${row.packageNo}`,
      lengthMm: row.l,
      widthMm: row.w,
      heightMm: row.h,
      weightKg:
        weightKg || guessDefaultWeight(row.l, row.w, row.h, `Pakke ${row.packageNo}`),
      quantity: qty,
      allowRotation: true,
      stackable: true,
      confidence: 0.92,
      sourceLine: row.sourceLine,
    })
  }
  // Rename grouped lines more cleanly
  return drafts.map((d, i) => ({
    ...d,
    name: d.quantity > 1 ? `Pakke (${d.quantity} ens)` : `Pakke ${i + 1}`,
  }))
}

/**
 * AI often returns cm values in *Mm fields (335 instead of 3350).
 * Fix via density / magnitude heuristics.
 */
function sanitizeDraftDims(d: ScannedCargoDraft): ScannedCargoDraft {
  let { lengthMm: l, widthMm: w, heightMm: h, weightKg } = d
  if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) return d

  const max = Math.max(l, w, h)
  const min = Math.min(l, w, h)
  const volM3 = (l * w * h) / 1e9
  const density = weightKg > 0 ? weightKg / Math.max(volM3, 1e-12) : 0

  // Classic mistake: cm written as mm (20–450 range, absurd density if kg present)
  const looksLikeCm =
    max <= 450 &&
    min >= 10 &&
    (density > 2000 || (weightKg >= 20 && max <= 400) || (weightKg <= 0 && max <= 400))

  if (looksLikeCm) {
    l = Math.round(l * 10)
    w = Math.round(w * 10)
    h = Math.round(h * 10)
  }

  // Opposite rare: meters as mm (1.2, 0.8, 1.0) — skip; parseNum already handles

  if (l > 20000 || w > 8000 || h > 8000) return d
  return { ...d, lengthMm: l, widthMm: w, heightMm: h }
}

const QTY_UNIT =
  'pkg|pack(?:s|ages)?|pallets?|pall(?:e|er|es)?|collies|colli|kolli|pcs|stk|pieces?|units?|boxes|karton|pakke(?:r)?'

function extractQuantity(line: string): number {
  const patterns = [
    // "3x 120 x 80 x 105 cm" / "2x120x80x100" — qty then dimensions
    /^(\d+)\s*[x×]\s*\d/i,
    // "2 pallets:" / "4x paller" / "3 Pall – 120X80X127" / "1 PKG …"
    new RegExp(`^(\\d+)\\s*[x×]\\s*(?:${QTY_UNIT})\\b`, 'i'),
    new RegExp(`^(\\d+)\\s*(?:${QTY_UNIT})\\b`, 'i'),
    new RegExp(`(\\d+)\\s*[x×]\\s*(?:${QTY_UNIT})\\b`, 'i'),
    new RegExp(
      `(\\d+)\\s*(?:units?|pcs|stk|styk|pieces?|collies|colli|kolli|pkg|pallets?|pall(?:e|er)?|st\\b)\\b`,
      'i',
    ),
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

  // "… 2x 120x80x100" — qty immediately before a dim triple
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

/** Extract weight from a cargo line. Returns { kg, perUnit }. */
function extractWeightInfo(line: string): { kg: number; perUnit: boolean } {
  // Skip total/header weight lines — those are handled separately
  if (
    /^(?:total\s+)?gross\s*(?:wt|weight)\b/i.test(line.trim()) ||
    /^total\s*(gross\s*)?(wt|weight|vægt)/i.test(line.trim()) ||
    /^total\b/i.test(line.trim())
  ) {
    return { kg: 0, perUnit: false }
  }
  const perUnitHint =
    /\b(?:each|ea|pr\.?|per\s*(?:unit|stk|pcs|colli|palle|pallet))\b/i.test(
      line,
    )
  const kgNum =
    '(\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d+)?|\\d+[.,]\\d+|\\d+)'
  const patterns = [
    // "– 1.057 kg" / "/ 7200kg" after dimensions
    new RegExp(`(?:[–—\\-\\/]|brutto)?\\s*${kgNum}\\s*kgs?\\b`, 'i'),
    new RegExp(
      `${kgNum}\\s*kgs?(?:\\s*(?:each|ea|pr\\.?|per\\s*(?:unit|stk|pcs)|\\/\\s*(?:stk|pcs|palle|colli|unit)))?`,
      'i',
    ),
    new RegExp(
      `(?:vægt|weight|gross\\s*wt|bruttovægt)\\s*[:=]?\\s*${kgNum}`,
      'i',
    ),
  ]
  for (const re of patterns) {
    const m = line.match(re)
    if (m) {
      const n = parseKgNum(m[1])
      if (Number.isFinite(n) && n > 0) return { kg: n, perUnit: perUnitHint }
    }
  }
  return { kg: 0, perUnit: false }
}

function extractTotalGrossWeightKg(text: string): number | null {
  const patterns = [
    /total\s*gross\s*wt\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kgs?\b/i,
    /total\s*(?:gross\s*)?(?:weight|vægt)\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kgs?\b/i,
    // Packing list header: "Gross Weight 9900 kg" / "Gross Weight\t9900 kg"
    /(?:^|\n)\s*gross\s*weight\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kgs?\b/im,
    /samlet\s*vægt\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+[.,]?\d*)\s*kgs?\b/i,
    // Standalone total line: "10.079,00 kgs" / "10079 kg"
    /(?:^|\n)\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d{4,}(?:[.,]\d+)?)\s*kgs?\s*(?:\n|$)/im,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const n = parseKgNum(m[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  // "Total bruttovægt 19.129 kg" / "Total bruttovægt: 19.129 kg"
  const brutto = text.match(
    /total\s*bruttovægt\s*[:=]?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+[.,]?\d*)\s*kgs?\b/i,
  )
  if (brutto) {
    const n = parseKgNum(brutto[1])
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function axisFromLabel(label: string): 'l' | 'w' | 'h' | null {
  const t = label.toLowerCase()
  if (/^(?:long|length|længde|lengte|depth|dybde|l)$/.test(t)) return 'l'
  if (/^(?:wide|width|bredde|bred|w|b)$/.test(t)) return 'w'
  if (/^(?:high|height|højde|h)$/.test(t)) return 'h'
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

  // Spoken / typed: "300cm x 95cm x 150 cm" / "120 cm x 80 cm x 150cm"
  {
    const re = new RegExp(
      `(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})\\s*[x×*]\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})\\s*[x×*]\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})`,
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

  // English packing notes: "1.40m high x 1.20m wide x 1.65m long"
  // Axis order varies — map labels to L/W/H.
  {
    const axis =
      'high|height|højde|wide|width|bredde|long|length|længde|depth|dybde|h|w|b|l'
    const re = new RegExp(
      `(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})?\\s*(${axis})\\s*[x×*]\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})?\\s*(${axis})\\s*[x×*]\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})?\\s*(${axis})\\b`,
      'gi',
    )
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      const parts = [
        { v: parseNum(m[1]), u: m[2], a: axisFromLabel(m[3]!) },
        { v: parseNum(m[4]), u: m[5], a: axisFromLabel(m[6]!) },
        { v: parseNum(m[7]), u: m[8], a: axisFromLabel(m[9]!) },
      ]
      if (parts.some((p) => !p.a || !Number.isFinite(p.v) || p.v <= 0)) continue
      const by: Record<'l' | 'w' | 'h', { v: number; u?: string }> = {
        l: { v: 0 },
        w: { v: 0 },
        h: { v: 0 },
      }
      for (const p of parts) {
        by[p.a!] = { v: p.v, u: p.u }
      }
      if (!by.l.v || !by.w.v || !by.h.v) continue
      candidates.push({
        l: by.l.v,
        w: by.w.v,
        h: by.h.v,
        unitL: by.l.u,
        unitW: by.w.u,
        unitH: by.h.u,
        unitRaw: by.l.u ?? by.w.u ?? by.h.u,
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
    /(?:length|længde)\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*.{0,28}?(?:wide|width|bredde)\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*.{0,28}?(?:height|højde)\s*[:=]?\s*(\d+[.,]?\d*)\s*(mm|cms?|m)?/i,
  ]

  // Trailing L W H without separators: "... 1190 1180 335 175 170" → last three are dims
  {
    const trailing = line.match(
      /(?:^|\s)(\d{2,4}(?:[.,]\d+)?)\s+(\d{2,4}(?:[.,]\d+)?)\s+(\d{2,4}(?:[.,]\d+)?)\s*$/,
    )
    if (trailing && trailing.index != null) {
      const before = line.slice(0, trailing.index)
      const hasWeightContext =
        /\d/.test(before) ||
        /(?:kg|gross|net|package|pakke|colli)/i.test(line)
      if (hasWeightContext) {
        candidates.push({
          l: parseNum(trailing[1]),
          w: parseNum(trailing[2]),
          h: parseNum(trailing[3]),
          unitRaw: /\bmm\b/i.test(line)
            ? 'mm'
            : /\bcm\b/i.test(line)
              ? 'cm'
              : undefined,
          index: trailing.index,
          length: trailing[0].length,
          perAxis: false,
        })
      }
    }
  }

  for (const re of simplePatterns) {
    // Collect all matches — prefer rightmost (dims after "3x …")
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
    const globalRe = new RegExp(re.source, flags)
    let m: RegExpExecArray | null
    while ((m = globalRe.exec(line)) !== null) {
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
  if (/^total\b/i.test(line.trim())) return false
  if (/^ordre\b/i.test(line.trim())) return false
  if (/^antal\s*colli\b/i.test(line.trim())) return false
  if (/^total\s+(pieces|packages|packs|gross|volume|wt|cbm|brutto)/i.test(line))
    return false
  if (/^(?:quantity|gross\s*weight|volume)\b/i.test(line)) return false
  if (/^pieces?\s+piece\s*type/i.test(line)) return false
  if (/^packages?\s+type\s+weight/i.test(line)) return false
  if (/^packs?\s*\(cont/i.test(line)) return false
  if (/^dimensions?\s*$/i.test(line)) return false
  if (/med venlig hilsen|best regards/i.test(line)) return false
  // Standalone total weight only: "10.079,00 kgs"
  if (/^\s*[\d.,\s]+\s*kgs?\s*$/i.test(line)) return false

  return (
    /\b\d{2,4}(?:[.,]\d+)?\s+\d{2,4}(?:[.,]\d+)?\s+\d{2,4}(?:[.,]\d+)?\s*(?:cm|cms|mm)\b/i.test(
      line,
    ) ||
    /\d+[.,]?\d*\s*(?:mm|cms?|m)\s+\d+[.,]?\d*\s*(?:mm|cms?|m)\s+\d+[.,]?\d*\s*(?:mm|cms?|m)/i.test(
      line,
    ) ||
    /\d+[.,]?\d*\s*\/\s*\d+[.,]?\d*\s*\/\s*\d+/i.test(line) ||
    /\d+[.,]?\d*\s*[x×*]\s*\d+[.,]?\d*\s*[x×*]\s*\d+/i.test(line) ||
    /\d+[.,]?\d*\s*(?:mm|cms?|m)\s*[x×*]\s*\d+[.,]?\d*\s*(?:mm|cms?|m)\s*[x×*]\s*\d+/i.test(
      line,
    ) ||
    /\d+[.,]?\d*\s*(?:mm|cms?|m)?\s*(?:high|height|højde|wide|width|long|length|længde)\b/i.test(
      line,
    ) ||
    /\d+[.,]?\d*\s*-\s*\d+[.,]?\d*\s*-\s*\d+/i.test(line) ||
    /\bl\s*[:=]?\s*\d/i.test(line) ||
    /længde/i.test(line) ||
    /each\s+unit/i.test(line) ||
    /\b(pallets?|pall(?:e|er|es)?|collies|colli|kolli|pakke|karton|kasse|gods|pcs|stk|units?|pkg|pack(?:s|ages)?)\b/i.test(
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

  // Dedicated packing-list table: Package | Gross | Net | Length | Wide | Height
  const tableUnit = detectTableDimUnit(normalized)
  if (tableUnit) {
    const tableRows = parsePackingListTableRows(normalized, tableUnit)
    if (tableRows.length >= 2) {
      const fromTable = packingListRowsToDrafts(tableRows)
      if (fromTable.length) {
        const totalKg = extractTotalGrossWeightKg(normalized)
        if (totalKg && fromTable.some((d) => !/\d[.,\d]*\s*kg/i.test(d.sourceLine) && d.weightKg <= 0)) {
          return distributeTotalWeight(fromTable, totalKg)
        }
        return fromTable.map(sanitizeDraftDims)
      }
    }
  }

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

    // Prefer qty from header ("20 units"), not from "Each unit"
    const headerPart = line.includes('|') ? line.split('|')[0]! : line
    const qtyFromHeader = extractQuantity(headerPart)
    const qty =
      qtyFromHeader > 1 || /\d+\s*units?\b/i.test(headerPart)
        ? Math.max(1, qtyFromHeader)
        : extractQuantity(line)

    // Strip leading "3x " so dims are not read as 3×120×80
    let dimLine = line
    const qtyStrip = line.match(/^(\d+)\s*[x×]\s*(?=\d)/i)
    if (qtyStrip && qty > 1) {
      dimLine = line.slice(qtyStrip[0].length).trim()
    }
    const dim = findDimensions(dimLine) ?? findDimensions(line)
    if (!dim) continue

    const wInfo = extractWeightInfo(line)
    // Packing lists often give LINE total ("3x … – 1.057 kg"), not per colli.
    // Do not divide when the line says each/unit, or weight is after "/".
    let weightKg = wInfo.kg
    const lineTotalHint =
      /[–—\-]\s*[\d.,]+\s*kgs?\b/i.test(line) ||
      /\bbrutto\b/i.test(line)
    if (weightKg > 0 && !wInfo.perUnit && qty > 1 && lineTotalHint) {
      weightKg = Math.round((weightKg / qty) * 10) / 10
    }
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
  const cleaned = drafts.map(sanitizeDraftDims)
  if (totalKg && cleaned.length) {
    return distributeTotalWeight(cleaned, totalKg)
  }

  return cleaned
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
    shape: 'box' as const,
    arrangement: 'linear' as const,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /429|rate.?limit|overloaded|529|too many requests/i.test(msg)
}

function friendlyScanError(err: unknown, provider: string): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (isRateLimitError(err)) {
    return new Error(
      'AI er midlertidigt overbelastet (rate limit). Vent 20–30 sekunder og prøv igen.',
    )
  }
  if (/401|403|invalid.+api.+key|authentication/i.test(msg)) {
    return new Error(
      `API-nøgle fejl (${provider}). Tjek VITE_OPENAI_API_KEY / VITE_ANTHROPIC_API_KEY.`,
    )
  }
  if (/^OpenAI\s+\d+$/i.test(msg) || /^Anthropic\s+\d+$/i.test(msg)) {
    return new Error(`Kunne ikke scanne via ${provider} (${msg}). Prøv igen om lidt.`)
  }
  return err instanceof Error ? err : new Error(msg)
}

async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      if (!isRateLimitError(err) || i === attempts - 1) throw err
      await sleep(1200 * 2 ** i + Math.random() * 400)
    }
  }
  throw last
}

/** Smaller JPEG for rate-limit retries (fewer tokens / lighter request). */
async function compressScanImage(
  image: ScanImageInput,
  maxEdge = 1400,
  quality = 0.72,
): Promise<ScanImageInput> {
  try {
    const res = await fetch(image.dataUrl)
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return image
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    return { dataUrl: canvas.toDataURL('image/jpeg', quality) }
  } catch {
    return image
  }
}

/** Prefer same-origin /api/scan-cargo (server-side Anthropic) when deployed. */
async function scanViaBackend(
  text: string,
  image: ScanImageInput | null,
): Promise<{ drafts: ScannedCargoDraft[]; mode: 'anthropic' } | null> {
  try {
    const res = await fetch('/api/scan-cargo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        imageDataUrl: image?.dataUrl ?? null,
      }),
    })
    if (res.status === 404 || res.status === 405) return null
    if (res.status === 503) return null // API key not configured on host
    const contentType = res.headers.get('content-type') ?? ''
    // Local Vite SPA often serves index.html for unknown paths
    if (!contentType.includes('application/json')) return null
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error || `Scan API ${res.status}`)
    }
    const data = (await res.json()) as { drafts?: ScannedCargoDraft[] }
    const drafts = Array.isArray(data.drafts)
      ? data.drafts.map(sanitizeDraftDims).filter(
          (d) => d.lengthMm > 0 && d.widthMm > 0 && d.heightMm > 0,
        )
      : []
    if (!drafts.length) return null
    return { drafts, mode: 'anthropic' }
  } catch (err) {
    // Network / local vite without api — fall through to client keys
    if (err instanceof TypeError) return null
    throw err
  }
}

export async function scanEmailCargo(
  text: string,
  options: ScanEmailOptions = {},
): Promise<{
  drafts: ScannedCargoDraft[]
  mode: 'local' | 'openai' | 'anthropic'
}> {
  const trimmed = text.trim()
  let image = options.image?.dataUrl ? options.image : null

  if (!trimmed && !image) return { drafts: [], mode: 'local' }

  // Deployed Vercel/TMS host: server-side Anthropic (avoids browser OpenAI 429)
  if (image || trimmed) {
    try {
      const viaApi = await scanViaBackend(trimmed, image)
      if (viaApi?.drafts.length) return viaApi
    } catch (err) {
      // If API exists but rate-limited / failed, keep going to client keys
      if (image && !import.meta.env.VITE_ANTHROPIC_API_KEY && !import.meta.env.VITE_OPENAI_API_KEY) {
        throw friendlyScanError(err, 'Anthropic')
      }
    }
  }

  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY?.trim()

  if (image && !anthropicKey && !openaiKey) {
    throw new Error(
      'Skærmklip kræver ANTHROPIC_API_KEY i deployment (eller VITE_ANTHROPIC_API_KEY lokalt).',
    )
  }

  let lastImageError: unknown = null

  // Prefer Anthropic for screenshots — OpenAI hits 429 often in shared TMS embeds
  if (anthropicKey) {
    try {
      const drafts = await withRateLimitRetry(() =>
        scanWithAnthropic(trimmed, anthropicKey, image),
      )
      if (drafts.length) return { drafts, mode: 'anthropic' }
    } catch (err) {
      lastImageError = err
      if (image && !openaiKey) throw friendlyScanError(err, 'Anthropic')
    }
  }

  if (openaiKey) {
    try {
      const drafts = await withRateLimitRetry(() =>
        scanWithOpenAI(trimmed, openaiKey, image),
      )
      if (drafts.length) return { drafts, mode: 'openai' }
    } catch (err) {
      lastImageError = err
      if (image && isRateLimitError(err)) {
        // Rate limited: wait, shrink image, try again (and Anthropic if available)
        await sleep(2500)
        const lighter = await compressScanImage(image, 1280, 0.65)
        if (anthropicKey) {
          try {
            const drafts = await scanWithAnthropic(trimmed, anthropicKey, lighter)
            if (drafts.length) return { drafts, mode: 'anthropic' }
          } catch {
            // continue
          }
        }
        try {
          const drafts = await scanWithOpenAI(trimmed, openaiKey, lighter)
          if (drafts.length) return { drafts, mode: 'openai' }
        } catch (retryErr) {
          lastImageError = retryErr
        }
      }
      if (image) throw friendlyScanError(lastImageError ?? err, 'OpenAI')
    }
  }

  if (image) {
    throw friendlyScanError(
      lastImageError ?? new Error('Kunne ikke læse skærmklippet via AI'),
      anthropicKey ? 'Anthropic' : 'OpenAI',
    )
  }

  return { drafts: scanEmailCargoLocal(trimmed), mode: 'local' }
}

const EXTRACT_PROMPT = `Extract ALL cargo from packing list text/image. Be fast and complete.

Formats: 120x80x100 cm; 150/90/173 cms; Package|Gross|Net|Length cm|Wide cm|Height cm (Wide=width, use GROSS);
Pos|Koli|L(m)|B(m)|H(m)|Vægt; Hub sektion units + Each unit LxWxH mm.

Return ONLY JSON array (no markdown), prefer compact keys:
{"q":qty,"l":lengthMm,"w":widthMm,"h":heightMm,"kg":weightKg}
(or full lengthMm/widthMm/heightMm/quantity/weightKg/name fields).

cm→mm (*10), m→mm (*1000). Group identical dims+kg (higher q). Skip Total/blank.
Example: 335×175×170 cm @1190kg → {"q":1,"l":3350,"w":1750,"h":1700,"kg":1190}`

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
    .map((row, i) => {
      const r = row as Record<string, unknown>
      // Compact keys (q/l/w/h/kg) or full field names
      const lengthMm = Number(r.l ?? r.lengthMm ?? r.lengthCm ?? r.length)
      const widthMm = Number(
        r.w ?? r.widthMm ?? r.widthCm ?? r.width ?? r.wideMm ?? r.wide,
      )
      const heightMm = Number(r.h ?? r.heightMm ?? r.heightCm ?? r.height)
      const lengthIsCm =
        r.lengthCm != null ||
        (r.lengthMm == null &&
          r.l == null &&
          (r.length != null || r.length_cm != null))
      const raw: ScannedCargoDraft = {
        name: String(r.name ?? `Pakke ${i + 1}`),
        lengthMm: Math.round(lengthMm || 0),
        widthMm: Math.round(widthMm || 0),
        heightMm: Math.round(heightMm || 0),
        weightKg: Number(r.kg ?? r.weightKg ?? r.grossWeightKg ?? r.gross_kg) || 0,
        quantity: Math.max(1, Math.round(Number(r.q ?? r.quantity) || 1)),
        allowRotation: r.allowRotation !== false,
        stackable: r.stackable !== false,
        confidence: Math.min(1, Number(r.confidence) || 0.85),
        sourceLine: String(r.sourceLine ?? '').slice(0, 160),
      }
      if (lengthIsCm && raw.lengthMm > 0 && raw.lengthMm <= 450) {
        raw.lengthMm *= 10
        raw.widthMm *= 10
        raw.heightMm *= 10
      }
      return sanitizeDraftDims(raw)
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
        'Udtræk ALLE pakker fra skærmklippet. Understøt både Length/Wide/Height i cm og dansk TMS: Pos | Koli | Koli type | L(m) | B(m) | H(m) | Vægt (kg). Meter → mm (*1000). Koli = quantity. Spring Total/blanke over.',
    },
  ]
  if (image?.dataUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: image.dataUrl, detail: 'high' },
    })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // mini is far less rate-limited; sufficient for packing-list grids
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: image ? 4000 : 2500,
      messages: [
        { role: 'system', content: EXTRACT_PROMPT },
        { role: 'user', content: image ? userContent : text.slice(0, 12000) },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 429 || /rate.?limit/i.test(body)) {
      throw new Error('OpenAI 429')
    }
    throw new Error(`OpenAI ${res.status}`)
  }
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
      'Udtræk ALLE pakker fra skærmklippet. Understøt både (1) Length/Wide/Height i cm og (2) dansk TMS: Pos | Koli | Koli type | L(m) | B(m) | H(m) | Vægt (kg). L/B/H i meter → mm (*1000). Koli = quantity. Spring Total/blanke over. Returnér én JSON-array med alle datarækker.',
  })

  const workspaceId = import.meta.env.VITE_ANTHROPIC_WORKSPACE_ID?.trim()
  const anthHeaders: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'Content-Type': 'application/json',
  }
  if (workspaceId) {
    anthHeaders['anthropic-workspace-id'] = workspaceId
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthHeaders,
    body: JSON.stringify({
      model: image ? 'claude-haiku-4-5-20251001' : 'claude-haiku-4-5-20251001',
      max_tokens: image ? 4000 : 2500,
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
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Fallback to Sonnet if Haiku model id is unavailable
    if (res.status === 404 && /model/i.test(body)) {
      const retry = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: anthHeaders,
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: image ? 5000 : 2500,
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
      if (!retry.ok) throw new Error(`Anthropic ${retry.status}`)
      const retryData = (await retry.json()) as {
        content?: { type: string; text?: string }[]
      }
      return parseModelJson(
        retryData.content?.find((c) => c.type === 'text')?.text ?? '',
      )
    }
    if (res.status === 429 || res.status === 529 || /rate.?limit|overloaded/i.test(body)) {
      throw new Error(`Anthropic ${res.status}`)
    }
    throw new Error(`Anthropic ${res.status}`)
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[]
  }
  const textOut = data.content?.find((c) => c.type === 'text')?.text ?? ''
  return parseModelJson(textOut)
}

/** Resize/compress screenshot for vision — keep small for speed (clear tables ~1200px). */
export async function prepareScanImage(file: Blob): Promise<ScanImageInput> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Filen er ikke et billede')
  }

  const bitmap = await createImageBitmap(file)
  // Smaller uploads = much faster Anthropic vision (1–2 min → few seconds)
  const maxEdge = 1280
  const minEdge = 900
  const longest = Math.max(bitmap.width, bitmap.height)
  const shortest = Math.min(bitmap.width, bitmap.height)
  let scale = Math.min(1, maxEdge / longest)
  if (shortest < minEdge) {
    scale = Math.max(scale, Math.min(1.5, minEdge / shortest))
    scale = Math.min(scale, maxEdge / longest)
  }
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Kunne ikke læse billedet')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
  return { dataUrl }
}
