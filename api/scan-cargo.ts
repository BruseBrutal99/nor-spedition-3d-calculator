/**
 * Vercel serverless scan endpoint — keeps ANTHROPIC_API_KEY server-side.
 * Optimized for packing-list screenshots (Haiku + compact output).
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

/** Short prompt + compact rows = much faster generation than verbose JSON per package. */
const FAST_PROMPT = `Extract ALL cargo rows from packing list text/image. Be fast and complete.

Formats:
- Package|Gross kg|Net kg|Length cm|Wide cm|Height cm  (Wide=width, use GROSS)
- Pos|Koli|type|L(m)|B(m)|H(m)|Vægt kg
- 120x80x100 cm, 150/90/173 cms

Return ONLY a JSON array of compact objects (no markdown):
{"q":qty,"l":lengthMm,"w":widthMm,"h":heightMm,"kg":weightKgPerUnit}

Rules:
- cm→mm (*10), m→mm (*1000). Never put cm/m values in l/w/h.
- Group identical L×W×H+kg into one object with higher q.
- Skip blank/Total rows. allowRotation=true stackable=true implied.
- Example: 335×175×170 cm, 1190 kg → {"q":1,"l":3350,"w":1750,"h":1700,"kg":1190}`

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

function sanitizeMm(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  weightKg: number,
): [number, number, number] {
  let l = lengthMm
  let w = widthMm
  let h = heightMm
  const max = Math.max(l, w, h)
  const min = Math.min(l, w, h)
  const volM3 = (l * w * h) / 1e9
  const density = weightKg > 0 ? weightKg / Math.max(volM3, 1e-12) : 0
  if (
    max <= 450 &&
    min >= 10 &&
    (density > 2000 || (weightKg >= 20 && max <= 400) || (weightKg <= 0 && max <= 400))
  ) {
    l *= 10
    w *= 10
    h *= 10
  }
  return [l, w, h]
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
      .map((row, i) => {
        const r = row as Record<string, unknown>
        let lengthMm = Math.round(
          Number(r.l ?? r.lengthMm ?? r.lengthCm ?? r.length) || 0,
        )
        let widthMm = Math.round(
          Number(r.w ?? r.widthMm ?? r.widthCm ?? r.width ?? r.wideMm ?? r.wide) || 0,
        )
        let heightMm = Math.round(
          Number(r.h ?? r.heightMm ?? r.heightCm ?? r.height) || 0,
        )
        const weightKg = Number(r.kg ?? r.weightKg ?? r.grossWeightKg) || 0
        const quantity = Math.max(1, Math.round(Number(r.q ?? r.quantity) || 1))
        ;[lengthMm, widthMm, heightMm] = sanitizeMm(
          lengthMm,
          widthMm,
          heightMm,
          weightKg,
        )
        return {
          name: String(r.name ?? `Pakke ${i + 1}`),
          lengthMm,
          widthMm,
          heightMm,
          weightKg,
          quantity,
          allowRotation: r.allowRotation !== false,
          stackable: r.stackable !== false,
          confidence: Math.min(1, Number(r.confidence) || 0.9),
          sourceLine: String(r.sourceLine ?? '').slice(0, 160),
        } satisfies Draft
      })
      .filter((d) => d.lengthMm > 0 && d.widthMm > 0 && d.heightMm > 0)
  } catch {
    return []
  }
}

/** Parse plain "no gross net L W H" lines if the model returns OCR text instead of JSON. */
function parsePlainTable(content: string): Draft[] {
  const lines = content
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const drafts: Draft[] = []
  for (const line of lines) {
    if (/^total\b|^unit=|^package\b|^pos\b/i.test(line)) continue
    const nums = [...line.matchAll(/(\d+[.,]?\d*)/g)].map((m) =>
      Number(String(m[1]).replace(',', '.')),
    )
    if (nums.length < 5) continue
    // no, gross, net, L, W, H (cm)
    const [no, gross, , lCm, wCm, hCm] = nums
    if (![lCm, wCm, hCm].every((n) => n > 0 && n <= 450)) continue
    const lengthMm = Math.round(lCm! * 10)
    const widthMm = Math.round(wCm! * 10)
    const heightMm = Math.round(hCm! * 10)
    const weightKg = gross && gross > 0 ? gross : 0
    const existing = drafts.find(
      (d) =>
        d.lengthMm === lengthMm &&
        d.widthMm === widthMm &&
        d.heightMm === heightMm &&
        Math.abs(d.weightKg - weightKg) < 0.05,
    )
    if (existing) {
      existing.quantity += 1
      continue
    }
    drafts.push({
      name: `Pakke ${no || drafts.length + 1}`,
      lengthMm,
      widthMm,
      heightMm,
      weightKg,
      quantity: 1,
      allowRotation: true,
      stackable: true,
      confidence: 0.88,
      sourceLine: line.slice(0, 160),
    })
  }
  return drafts
}

async function callAnthropic(input: {
  apiKey: string
  workspaceId?: string
  text: string
  imageDataUrl: string | null
  model: string
  maxTokens: number
}): Promise<string> {
  const parts: unknown[] = []
  const parsed = input.imageDataUrl ? splitDataUrl(input.imageDataUrl) : null
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
      input.text ||
      'Extract ALL packages from this packing-list image into the compact JSON array.',
  })

  const headers: Record<string, string> = {
    'x-api-key': input.apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  }
  if (input.workspaceId) {
    headers['anthropic-workspace-id'] = input.workspaceId
  }

  const anthRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens,
      temperature: 0,
      system: FAST_PROMPT,
      messages: [
        {
          role: 'user',
          content: input.imageDataUrl ? parts : input.text.slice(0, 12000),
        },
      ],
    }),
  })

  if (!anthRes.ok) {
    const errBody = await anthRes.text().catch(() => '')
    const err = new Error(`Anthropic ${anthRes.status}`) as Error & {
      status: number
      body: string
    }
    err.status = anthRes.status
    err.body = errBody
    throw err
  }

  const data = (await anthRes.json()) as {
    content?: { type: string; text?: string }[]
  }
  return data.content?.find((c) => c.type === 'text')?.text ?? ''
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

  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim()

  try {
    // Haiku first — packing lists are structured; Sonnet is overkill and slow
    let textOut = await callAnthropic({
      apiKey,
      workspaceId,
      text,
      imageDataUrl,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: imageDataUrl ? 4000 : 2500,
    })
    let drafts = parseModelJson(textOut)
    if (!drafts.length) drafts = parsePlainTable(textOut)

    // One Sonnet fallback only if Haiku returned nothing usable
    if (!drafts.length && imageDataUrl) {
      textOut = await callAnthropic({
        apiKey,
        workspaceId,
        text,
        imageDataUrl,
        model: 'claude-sonnet-4-6',
        maxTokens: 5000,
      })
      drafts = parseModelJson(textOut)
      if (!drafts.length) drafts = parsePlainTable(textOut)
    }

    return res.status(200).json({ drafts, mode: 'anthropic' })
  } catch (e) {
    const err = e as Error & { status?: number; body?: string }
    const status = err.status ?? 502
    const errBody = err.body ?? err.message ?? ''
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
    // Haiku model name missing → retry Sonnet once
    if (status === 404 && /model/i.test(errBody)) {
      try {
        const textOut = await callAnthropic({
          apiKey,
          workspaceId,
          text,
          imageDataUrl,
          model: 'claude-sonnet-4-6',
          maxTokens: imageDataUrl ? 5000 : 2500,
        })
        let drafts = parseModelJson(textOut)
        if (!drafts.length) drafts = parsePlainTable(textOut)
        return res.status(200).json({ drafts, mode: 'anthropic' })
      } catch (e2) {
        const err2 = e2 as Error & { status?: number; body?: string }
        return res.status(502).json({
          error: `Anthropic ${err2.status ?? 502}`,
          detail: (err2.body ?? err2.message ?? '').slice(0, 200),
        })
      }
    }
    return res.status(502).json({
      error: `Anthropic ${status}`,
      detail: errBody.slice(0, 200),
    })
  }
}
