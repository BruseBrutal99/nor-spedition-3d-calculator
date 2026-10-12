/**
 * Vercel serverless scan endpoint — keeps ANTHROPIC_API_KEY server-side.
 * Client POSTs { text, imageDataUrl } and receives { drafts }.
 */

type VercelRequest = {
  method?: string
  body?: unknown
}
type VercelResponse = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
  end: () => void
}

const EXTRACT_PROMPT = `Du er en logistik-assistent for NOR Spedition.
Udtræk ALLE colli/paller/pakker/units fra mailteksten og/eller skærmklip (packing list, tabel, AWB).
Spring ALDRIG rækker over midt i en tabel — læs fra første til sidste datarække.

Understøt formater som:
- "1 pcs 150/90/173 cms"
- "2x 120x80x100 cm"
- Packing list: Package No. | Gross weight kg | Net. Weight kg | Length cm | Wide cm | Height cm
  (Wide = width). gross weight. Eksempel: "1 1190 1180 335 175 170" → lengthMm=3350, widthMm=1750, heightMm=1700, weightKg=1190.
- Dansk TMS: Pos | Koli | Koli type | L(m) | B(m) | H(m) | Vægt (kg)
  Eksempel: "1 2 Palle 1,20 0,80 1,00 450" → quantity=2, lengthMm=1200, widthMm=800, heightMm=1000, weightKg=450.

KRITISK: cm → mm (*10). m → mm (*1000). Returnér ALDRIG cm/m-tal i lengthMm-felterne.
Returnér KUN valid JSON-array (ingen markdown) med objekter:
{"name":string,"lengthMm":number,"widthMm":number,"heightMm":number,"weightKg":number,"quantity":number,"allowRotation":boolean,"stackable":boolean,"confidence":number,"sourceLine":string}`

type Draft = {
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

function splitDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!m) return null
  return { mediaType: m[1], base64: m[2] }
}

function parseModelJson(content: string): Draft[] {
  const cleaned = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < 0) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .map((row) => {
        const r = row as Record<string, unknown>
        let lengthMm = Math.round(Number(r.lengthMm ?? r.lengthCm ?? r.length) || 0)
        let widthMm = Math.round(
          Number(r.widthMm ?? r.widthCm ?? r.width ?? r.wideMm ?? r.wide) || 0,
        )
        let heightMm = Math.round(Number(r.heightMm ?? r.heightCm ?? r.height) || 0)
        const weightKg = Number(r.weightKg ?? r.grossWeightKg) || 0
        const max = Math.max(lengthMm, widthMm, heightMm)
        const min = Math.min(lengthMm, widthMm, heightMm)
        const volM3 = (lengthMm * widthMm * heightMm) / 1e9
        const density = weightKg > 0 ? weightKg / Math.max(volM3, 1e-12) : 0
        if (
          max <= 450 &&
          min >= 10 &&
          (density > 2000 || (weightKg >= 20 && max <= 400) || (weightKg <= 0 && max <= 400))
        ) {
          lengthMm *= 10
          widthMm *= 10
          heightMm *= 10
        }
        return {
          name: String(r.name ?? 'Gods'),
          lengthMm,
          widthMm,
          heightMm,
          weightKg,
          quantity: Math.max(1, Math.round(Number(r.quantity) || 1)),
          allowRotation: r.allowRotation !== false,
          stackable: r.stackable !== false,
          confidence: Math.min(1, Number(r.confidence) || 0.85),
          sourceLine: String(r.sourceLine ?? '').slice(0, 160),
        } satisfies Draft
      })
      .filter((d) => d.lengthMm > 0 && d.widthMm > 0 && d.heightMm > 0)
  } catch {
    return []
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY mangler i deployment',
    })
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    text?: string
    imageDataUrl?: string | null
  }
  const text = String(body.text ?? '').trim()
  const imageDataUrl = body.imageDataUrl?.trim() || null
  if (!text && !imageDataUrl) {
    return res.status(400).json({ error: 'Mangler tekst eller billede' })
  }

  const parts: unknown[] = []
  const parsed = imageDataUrl ? splitDataUrl(imageDataUrl) : null
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
      text ||
      'Udtræk ALLE pakker fra skærmklippet. Understøt Length/Wide/Height i cm og dansk TMS Pos|Koli|L(m)|B(m)|H(m)|Vægt. Meter→mm (*1000). Returnér JSON-array.',
  })

  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  const anthHeaders: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  }
  if (workspaceId) {
    anthHeaders['anthropic-workspace-id'] = workspaceId
  }

  const anthRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthHeaders,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: imageDataUrl ? 16000 : 4000,
      temperature: 0,
      system: EXTRACT_PROMPT,
      messages: [{ role: 'user', content: imageDataUrl ? parts : text.slice(0, 12000) }],
    }),
  })

  if (!anthRes.ok) {
    const errBody = await anthRes.text().catch(() => '')
    const status = anthRes.status
    if (status === 429 || status === 529) {
      return res.status(429).json({ error: 'AI rate limit — prøv igen om lidt' })
    }
    if (/workspace-id|not scoped to a workspace/i.test(errBody)) {
      return res.status(502).json({
        error:
          'Anthropic-nøglen kræver ANTHROPIC_WORKSPACE_ID (console.anthropic.com → Settings → Workspaces).',
        detail: errBody.slice(0, 200),
      })
    }
    return res.status(502).json({
      error: `Anthropic ${status}`,
      detail: errBody.slice(0, 200),
    })
  }

  const data = (await anthRes.json()) as {
    content?: { type: string; text?: string }[]
  }
  const textOut = data.content?.find((c) => c.type === 'text')?.text ?? ''
  const drafts = parseModelJson(textOut)
  return res.status(200).json({ drafts, mode: 'anthropic' })
}
