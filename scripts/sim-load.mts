/**
 * Packing clarity simulations — 2D top / side / iso views.
 * Run: npx tsx scripts/sim-load.mts
 */
import fs from 'fs'
import path from 'path'
import { createCanvas } from 'canvas'
import { packLoad, loadingSequence } from '../src/lib/packer.ts'
import { EQUIPMENT_PRESETS, CARGO_COLORS } from '../src/data/equipment.ts'
import {
  scanEmailCargoLocal,
  draftsToCargoItems,
} from '../src/lib/ai/scanEmailCargo.ts'
import type { Equipment, PlacedBox } from '../src/types.ts'

const TEXT = `Total Pieces  : 12
Total Gross Wt: 1,875.0 kg
Total Volume  : 19.365 cbm
Dimensions
1 pcs 150/90/173 cms
1 pcs 125/93/170 cms
1 pcs 120/80/209 cms
1 pcs 190/90/210 cms
1 pcs 120/100/97 cms
1 pcs 125/90/158 cms
1 pcs 120/80/117 cms
2 pcs 153/93/6 cms
1 pcs 133/80/93 cms
1 pcs 220/90/149 cms
1 pcs 80/200/80 cms`

const OUT = path.resolve('tmp-sim')
fs.mkdirSync(OUT, { recursive: true })

const items = draftsToCargoItems(scanEmailCargoLocal(TEXT))
const letterOf = new Map(items.map((it, i) => [it.id, String.fromCharCode(65 + i)]))

type Variant = {
  id: string
  label: string
  equipment: Equipment
  allowStacking: boolean
}

const variants: Variant[] = [
  {
    id: 'trailer-stack',
    label: 'Sættevogn 13,6 m · stabling ON',
    equipment: EQUIPMENT_PRESETS[1],
    allowStacking: true,
  },
  {
    id: 'trailer-floor',
    label: 'Sættevogn 13,6 m · kun gulv',
    equipment: EQUIPMENT_PRESETS[1],
    allowStacking: false,
  },
  {
    id: 'truck-stack',
    label: 'Lastbil 12 m · stabling ON',
    equipment: EQUIPMENT_PRESETS[0],
    allowStacking: true,
  },
  {
    id: 'c20-stack',
    label: "Container 20' · stabling ON",
    equipment: EQUIPMENT_PRESETS[3],
    allowStacking: true,
  },
]

function mm(n: number) {
  return Math.round(n)
}

function drawTop(
  placed: PlacedBox[],
  eq: Equipment,
  title: string,
  file: string,
  opts: { cropToLoad?: boolean } = {},
) {
  const maxX = placed.length
    ? Math.max(...placed.map((p) => p.x + p.lengthMm))
    : eq.lengthMm
  const viewL = opts.cropToLoad
    ? Math.min(eq.lengthMm, Math.max(maxX * 1.15, 5000))
    : eq.lengthMm
  const pad = 60
  const W = 1400
  const scale = (W - pad * 2) / viewL
  const H = Math.ceil(eq.widthMm * scale) + pad * 2 + 70
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#F8FAFC'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText(title, pad, 36)
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#64748B'
  ctx.fillText(
    `Top (plan) · dør ← · kabine → · skala 1:${Math.round(1 / scale)}`,
    pad,
    56,
  )

  const ox = pad
  const oy = pad + 50
  // Floor
  ctx.fillStyle = '#E2E8F0'
  ctx.fillRect(ox, oy, viewL * scale, eq.widthMm * scale)
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 2
  ctx.strokeRect(ox, oy, viewL * scale, eq.widthMm * scale)

  // Sort by z so higher draws later (outline only for top - draw by area)
  const sorted = [...placed].sort((a, b) => a.z - b.z)
  for (const p of sorted) {
    if (p.x > viewL) continue
    const x = ox + p.x * scale
    // y=0 is left wall visually at top of canvas
    const y = oy + p.y * scale
    const w = p.lengthMm * scale
    const h = p.widthMm * scale
    ctx.globalAlpha = p.z > 0.5 ? 0.85 : 1
    ctx.fillStyle = p.color
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1
    ctx.strokeStyle = p.z > 0.5 ? '#FFFFFF' : '#0F172A'
    ctx.lineWidth = p.z > 0.5 ? 2.5 : 1.5
    ctx.strokeRect(x, y, w, h)
    const letter = letterOf.get(p.cargoId) ?? '?'
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // dark disc
    ctx.beginPath()
    ctx.arc(x + w / 2, y + h / 2, 12, 0, Math.PI * 2)
    ctx.fillStyle = '#0F172A'
    ctx.fill()
    ctx.fillStyle = '#FFF'
    ctx.fillText(letter, x + w / 2, y + h / 2 + 1)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('← DØR', ox + 8, oy + eq.widthMm * scale + 28)
  ctx.fillText('KABINE →', ox + viewL * scale - 90, oy + eq.widthMm * scale + 28)

  fs.writeFileSync(path.join(OUT, file), canvas.toBuffer('image/png'))
}

function drawSide(
  placed: PlacedBox[],
  eq: Equipment,
  title: string,
  file: string,
  opts: { cropToLoad?: boolean } = {},
) {
  const maxX = placed.length
    ? Math.max(...placed.map((p) => p.x + p.lengthMm))
    : eq.lengthMm
  const viewL = opts.cropToLoad
    ? Math.min(eq.lengthMm, Math.max(maxX * 1.15, 5000))
    : eq.lengthMm
  const pad = 60
  const W = 1400
  const scale = (W - pad * 2) / viewL
  const H = Math.ceil(eq.heightMm * scale) + pad * 2 + 80
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#F8FAFC'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText(title, pad, 36)
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#64748B'
  ctx.fillText('Side (elevation) · viser stabling tydeligt', pad, 56)

  const ox = pad
  const oy = pad + 50
  const floorY = oy + eq.heightMm * scale

  ctx.fillStyle = '#E2E8F0'
  ctx.fillRect(ox, oy, viewL * scale, eq.heightMm * scale)
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 2
  ctx.strokeRect(ox, oy, viewL * scale, eq.heightMm * scale)

  // Draw by Y then Z so left-right depth is approximate (all y collapsed)
  const sorted = [...placed].sort((a, b) => a.y - b.y || a.z - b.z)
  for (const p of sorted) {
    if (p.x > viewL) continue
    const x = ox + p.x * scale
    const h = p.heightMm * scale
    const w = p.lengthMm * scale
    const y = floorY - (p.z + p.heightMm) * scale
    ctx.globalAlpha = 0.9
    ctx.fillStyle = p.color
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#0F172A'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, w, h)
    const letter = letterOf.get(p.cargoId) ?? '?'
    if (w > 18 && h > 18) {
      ctx.beginPath()
      ctx.arc(x + w / 2, y + h / 2, 11, 0, Math.PI * 2)
      ctx.fillStyle = '#0F172A'
      ctx.fill()
      ctx.fillStyle = '#FFF'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letter, x + w / 2, y + h / 2 + 1)
    }
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('← DØR', ox + 8, floorY + 24)
  ctx.fillText('KABINE →', ox + viewL * scale - 90, floorY + 24)

  fs.writeFileSync(path.join(OUT, file), canvas.toBuffer('image/png'))
}

function drawIso(
  placed: PlacedBox[],
  eq: Equipment,
  title: string,
  file: string,
  crop: boolean,
) {
  const maxX = placed.length
    ? Math.max(...placed.map((p) => p.x + p.lengthMm))
    : eq.lengthMm
  const viewL = crop ? Math.min(eq.lengthMm, Math.max(maxX * 1.2, 4500)) : eq.lengthMm
  const W = 1400
  const H = 900
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#F1F5F9'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText(title, 40, 36)
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#64748B'
  ctx.fillText(
    crop ? 'Isometrisk · zoomet til lastet zone' : 'Isometrisk · fuld trailer',
    40,
    56,
  )

  const cos = Math.sqrt(3) / 2
  const sin = 0.5
  // Fit iso into canvas
  const spanX = (viewL + eq.widthMm) * cos
  const spanY = (viewL + eq.widthMm) * sin + eq.heightMm
  const scale = Math.min((W - 120) / spanX, (H - 140) / spanY) * 0.92
  const ox = 80
  const oy = H - 80

  const project = (x: number, y: number, z: number) => {
    const along = viewL - Math.min(x, viewL)
    return {
      x: ox + (along - y) * cos * scale,
      y: oy + (along + y) * sin * scale - z * scale,
    }
  }

  // Floor
  const f = [
    project(0, 0, 0),
    project(viewL, 0, 0),
    project(viewL, eq.widthMm, 0),
    project(0, eq.widthMm, 0),
  ]
  ctx.beginPath()
  ctx.moveTo(f[0].x, f[0].y)
  f.slice(1).forEach((p) => ctx.lineTo(p.x, p.y))
  ctx.closePath()
  ctx.fillStyle = '#CBD5E1'
  ctx.fill()
  ctx.strokeStyle = '#334155'
  ctx.stroke()

  // Wire height at corners
  const corners = [
    [0, 0],
    [viewL, 0],
    [viewL, eq.widthMm],
    [0, eq.widthMm],
  ] as const
  ctx.strokeStyle = '#64748B'
  ctx.setLineDash([4, 4])
  for (const [cx, cy] of corners) {
    const a = project(cx, cy, 0)
    const b = project(cx, cy, eq.heightMm)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.setLineDash([])

  const sorted = [...placed]
    .filter((p) => p.x < viewL)
    .sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z))

  for (const box of sorted) {
    const x0 = box.x
    const y0 = box.y
    const z0 = box.z
    const x1 = Math.min(box.x + box.lengthMm, viewL)
    const y1 = box.y + box.widthMm
    const z1 = box.z + box.heightMm
    const shade = (f: number) => {
      const h = box.color.replace('#', '')
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
      const r = Math.min(255, Math.round(((n >> 16) & 255) * f))
      const g = Math.min(255, Math.round(((n >> 8) & 255) * f))
      const b = Math.min(255, Math.round((n & 255) * f))
      return `rgb(${r},${g},${b})`
    }
    const poly = (pts: { x: number; y: number }[], fill: string) => {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = 'rgba(15,23,42,0.55)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    poly(
      [project(x0, y0, z1), project(x1, y0, z1), project(x1, y1, z1), project(x0, y1, z1)],
      shade(1.05),
    )
    poly(
      [project(x0, y0, z0), project(x1, y0, z0), project(x1, y0, z1), project(x0, y0, z1)],
      shade(0.85),
    )
    poly(
      [project(x1, y0, z0), project(x1, y1, z0), project(x1, y1, z1), project(x1, y0, z1)],
      shade(0.7),
    )
    const c = project((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    const letter = letterOf.get(box.cargoId) ?? '?'
    ctx.beginPath()
    ctx.arc(c.x, c.y, 12, 0, Math.PI * 2)
    ctx.fillStyle = '#0F172A'
    ctx.fill()
    ctx.fillStyle = '#FFF'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(letter, c.x, c.y + 1)
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText('← DØR', 40, H - 24)
  ctx.fillText('KABINE →', W - 140, H - 24)

  fs.writeFileSync(path.join(OUT, file), canvas.toBuffer('image/png'))
}

const summary: Record<string, unknown>[] = []

for (const v of variants) {
  const result = packLoad(items, v.equipment, { allowStacking: v.allowStacking })
  const seq = loadingSequence(result.placed)
  const stacked = result.placed.filter((p) => p.z > 0.5).length
  const maxX = result.placed.length
    ? Math.max(...result.placed.map((p) => p.x + p.lengthMm))
    : 0
  const row = {
    id: v.id,
    label: v.label,
    placed: result.placed.length,
    unplaced: result.unplaced.length,
    stacked,
    floorCm: Math.round(maxX / 10),
    fillPct: +result.fillPercent.toFixed(1),
    weightKg: Math.round(result.totalWeightKg),
    unplacedReasons: result.unplaced.map((u) => u.reason),
  }
  summary.push(row)

  drawTop(seq, v.equipment, `${v.label} — TOP`, `${v.id}-top-full.png`, {
    cropToLoad: false,
  })
  drawTop(seq, v.equipment, `${v.label} — TOP (zoomet)`, `${v.id}-top-crop.png`, {
    cropToLoad: true,
  })
  drawSide(seq, v.equipment, `${v.label} — SIDE`, `${v.id}-side-crop.png`, {
    cropToLoad: true,
  })
  drawIso(seq, v.equipment, `${v.label} — ISO fuld`, `${v.id}-iso-full.png`, false)
  drawIso(seq, v.equipment, `${v.label} — ISO zoomet`, `${v.id}-iso-crop.png`, true)

  // Step strip: first 4 steps as small tops
  const stepW = 320
  const stepH = 220
  const strip = createCanvas(stepW * 4 + 40, stepH + 50)
  const sctx = strip.getContext('2d')
  sctx.fillStyle = '#F8FAFC'
  sctx.fillRect(0, 0, strip.width, strip.height)
  sctx.fillStyle = '#0F172A'
  sctx.font = 'bold 16px sans-serif'
  sctx.fillText(`${v.label} — lasteorden trin 1–4 (top)`, 16, 28)
  for (let i = 0; i < Math.min(4, seq.length); i++) {
    const upTo = seq.slice(0, i + 1)
    const cur = seq[i]
    const tile = createCanvas(stepW, stepH)
    // reuse via writing temp — simple inline draw
    const tctx = tile.getContext('2d')
    tctx.fillStyle = '#FFF'
    tctx.fillRect(0, 0, stepW, stepH)
    const viewL = Math.max(maxX * 1.15, 5000)
    const scale = (stepW - 30) / viewL
    const ox = 15
    const oy = 35
    tctx.fillStyle = '#E2E8F0'
    tctx.fillRect(ox, oy, viewL * scale, v.equipment.widthMm * scale)
    tctx.strokeStyle = '#334155'
    tctx.strokeRect(ox, oy, viewL * scale, v.equipment.widthMm * scale)
    for (const p of upTo) {
      const isHi = p === cur
      tctx.globalAlpha = isHi ? 1 : 0.35
      tctx.fillStyle = isHi ? p.color : '#94A3B8'
      tctx.fillRect(
        ox + p.x * scale,
        oy + p.y * scale,
        p.lengthMm * scale,
        p.widthMm * scale,
      )
      tctx.globalAlpha = 1
      if (isHi) {
        tctx.strokeStyle = '#0F172A'
        tctx.lineWidth = 2
        tctx.strokeRect(
          ox + p.x * scale,
          oy + p.y * scale,
          p.lengthMm * scale,
          p.widthMm * scale,
        )
      }
    }
    tctx.fillStyle = '#0F172A'
    tctx.font = 'bold 13px sans-serif'
    tctx.fillText(
      `Trin ${i + 1}: ${letterOf.get(cur.cargoId)} · ${cur.z > 0 ? 'stablet' : 'gulv'}`,
      12,
      20,
    )
    sctx.drawImage(tile, 10 + i * stepW, 40)
  }
  fs.writeFileSync(path.join(OUT, `${v.id}-steps-top.png`), strip.toBuffer('image/png'))
}

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ items: items.map((it, i) => ({
  letter: String.fromCharCode(65 + i),
  name: it.name,
  L: it.lengthMm / 10,
  W: it.widthMm / 10,
  H: it.heightMm / 10,
  kg: it.weightKg,
  qty: it.quantity,
  color: it.color,
})), variants: summary, colors: CARGO_COLORS }, null, 2))

console.log(JSON.stringify(summary, null, 2))
console.log('Wrote images to', OUT)
