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

/** Handles 1875 / 1,875.0 / 1.875,0 / 10,5 */
function parseNum(raw: string): number {
  const s = raw.replace(/\s/g, '')
  if (!s) return NaN
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    return Number(s.replace(/,/g, ''))
  }
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return Number(s.replace(/\./g, '').replace(',', '.'))
  }
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
  if (/\bpall?e?r?\b|\beur\b|\bepal\b/.test(lower)) return `Palle ${index + 1}`
  if (/\bcolli\b|\bkolli\b|\bcollies\b/.test(lower)) return `Colli ${index + 1}`
  if (/\bpakke?r?\b|\bkarton|\bbox/.test(lower)) return `Pakke ${index + 1}`
  if (/\bkasse?r?\b/.test(lower)) return `Kasse ${index + 1}`
  if (/\bpcs\b|\bstk\b|\bunits?\b/.test(lower)) return `Colli ${index + 1}`
  return `Colli ${index + 1}`
}

function extractQuantity(line: string): number {
  const patterns = [
    /(\d+)\s*(?:units?|pcs|stk|styk|pieces?|st\b)\b/i,
    /(\d+)\s*[x×]\s*(?=\d+[.,]?\d*\s*[x×/])/i,
    /antal[:\s]+(\d+)/i,
    /qty[:\s]+(\d+)/i,
  ]
  for (const re of patterns) {
    const m = line.match(re)
    if (m) {
      const n = Number(m[1])
      // Ignore "1" from phrases like "Each unit:" when a larger qty exists elsewhere
      if (n > 0 && n < 10000) return n
    }
  }
  return 1
}

function extractWeight(line: string): number {
  // Skip total/header weight lines — those are handled separately
  if (/total\s*(gross\s*)?(wt|weight|vægt)/i.test(line)) return 0
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
  const patterns: RegExp[] = [
    // Each unit: 1550 x 1720 x 860 mm (LWH)
    new RegExp(
      `(\\d+[.,]?\\d*)\\s*[x×*]\\s*(\\d+[.,]?\\d*)\\s*[x×*]\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})?(?:\\s*\\(\\s*L\\s*W\\s*H\\s*\\))?`,
      'i',
    ),
    // Freight AWB style: 150/90/173 cms  OR  150 / 90 / 173 cm
    new RegExp(
      `(\\d+[.,]?\\d*)\\s*/\\s*(\\d+[.,]?\\d*)\\s*/\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})?`,
      'i',
    ),
    // 120-80-100 cm
    new RegExp(
      `(\\d+[.,]?\\d*)\\s*-\\s*(\\d+[.,]?\\d*)\\s*-\\s*(\\d+[.,]?\\d*)\\s*(${UNIT_GROUP})?`,
      'i',
    ),
    // L1200 B800 H1400
    /l\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*[,;\s]+b\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*[,;\s]+h\s*[:=]?\s*(\d+[.,]?\d*)\s*(mm|cms?|m)?/i,
    // længde … bredde … højde
    /længde\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*.{0,24}?bredde\s*[:=]?\s*(\d+[.,]?\d*)\s*(?:mm|cms?|m)?\s*.{0,24}?højde\s*[:=]?\s*(\d+[.,]?\d*)\s*(mm|cms?|m)?/i,
  ]

  for (const re of patterns) {
    const m = line.match(re)
    if (!m) continue
    const unitRaw = m[4]
    let l = parseNum(m[1])
    let w = parseNum(m[2])
    let h = parseNum(m[3])
    if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) continue

    // Prefer explicit unit; avoid treating mm values as cm
    const inferredUnit =
      normalizeUnit(unitRaw) ??
      (l >= 500 || w >= 500 || h >= 500
        ? 'mm'
        : l <= 20 && w <= 20 && h <= 20
          ? 'm'
          : l <= 400 && w <= 400 && h <= 400
            ? 'cm'
            : 'mm')

    l = toMm(l, inferredUnit)
    w = toMm(w, inferredUnit)
    h = toMm(h, inferredUnit)

    // Flat packs like 153/93/6 cm are valid (h=60mm)
    if (l > 0 && w > 0 && h > 0 && l < 20000 && w < 8000 && h < 8000) {
      return {
        l,
        w,
        h,
        unit: inferredUnit,
        index: m.index ?? 0,
        length: m[0].length,
      }
    }
  }
  return null
}

function lineLooksLikeCargo(line: string): boolean {
  if (!/\d/.test(line)) return false
  // Skip pure totals / headers
  if (/^total\s+(pieces|gross|volume|wt)/i.test(line)) return false
  if (/^dimensions?\s*$/i.test(line)) return false

  return (
    /\d+[.,]?\d*\s*\/\s*\d+[.,]?\d*\s*\/\s*\d+/i.test(line) ||
    /\d+[.,]?\d*\s*[x×*]\s*\d+[.,]?\d*\s*[x×*]\s*\d+/i.test(line) ||
    /\d+[.,]?\d*\s*-\s*\d+[.,]?\d*\s*-\s*\d+/i.test(line) ||
    /\bl\s*[:=]?\s*\d/i.test(line) ||
    /længde/i.test(line) ||
    /each\s+unit/i.test(line) ||
    /\b(palle|colli|kolli|pakke|karton|kasse|gods|pcs|stk|units?)\b/i.test(line)
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
  const hasOwnWeight = drafts.some(
    (d) => d.weightKg > 0 && !isGuessedWeight(d),
  )
  // If any line had explicit per-piece weight, don't redistribute
  if (hasOwnWeight) return drafts

  const volumes = drafts.map(
    (d) => (d.lengthMm * d.widthMm * d.heightMm * d.quantity) / 1e9,
  )
  const sumVol = volumes.reduce((a, b) => a + b, 0)
  if (sumVol <= 0) return drafts

  return drafts.map((d, i) => {
    const share = volumes[i] / sumVol
    const lineTotal = totalKg * share
    const perPiece = lineTotal / d.quantity
    return {
      ...d,
      weightKg: Math.round(perPiece * 10) / 10,
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
    const key = `${dim.l}x${dim.w}x${dim.h}|${qty}|${name}`
    if (seen.has(key)) continue
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
      )

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

export async function scanEmailCargo(text: string): Promise<{
  drafts: ScannedCargoDraft[]
  mode: 'local' | 'openai' | 'anthropic'
}> {
  const trimmed = text.trim()
  if (!trimmed) return { drafts: [], mode: 'local' }

  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY?.trim()

  if (anthropicKey) {
    try {
      const drafts = await scanWithAnthropic(trimmed, anthropicKey)
      if (drafts.length) return { drafts, mode: 'anthropic' }
    } catch {
      // fall through
    }
  }

  if (openaiKey) {
    try {
      const drafts = await scanWithOpenAI(trimmed, openaiKey)
      if (drafts.length) return { drafts, mode: 'openai' }
    } catch {
      // fall through
    }
  }

  return { drafts: scanEmailCargoLocal(trimmed), mode: 'local' }
}

const EXTRACT_PROMPT = `Du er en logistik-assistent for NOR Spedition.
Udtræk ALLE colli/paller/pakker/units fra mailteksten.
Understøt formater som:
- "1 pcs 150/90/173 cms"
- "2x 120x80x100 cm"
- "L1200 B800 H1000"
- "Hub sektion: 2 units" + "Each unit: 1550 x 1720 x 860 mm (LWH) / 7200kg"
- "Propel: 20 units" + "Each unit: 1425 x 1100 x 600 mm (LWH) / 1500kg each"
quantity = antal units/pcs. weightKg = vægt PR. unit (ikke total).
"non stack" / "non-stackable" / "Det hele er non stack" → stackable: false.
Hvis "Total Gross Wt" findes og linjer mangler vægt, fordel totalvægten proportionelt efter rumfang.
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
Konvertér altid mål til millimeter. cms/cm → mm (*10). Behold navne som "Hub sektion" / "Propel".`

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
): Promise<ScannedCargoDraft[]> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: EXTRACT_PROMPT },
        { role: 'user', content: text.slice(0, 12000) },
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
): Promise<ScannedCargoDraft[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0,
      system: EXTRACT_PROMPT,
      messages: [{ role: 'user', content: text.slice(0, 12000) }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[]
  }
  const textOut = data.content?.find((c) => c.type === 'text')?.text ?? ''
  return parseModelJson(textOut)
}
