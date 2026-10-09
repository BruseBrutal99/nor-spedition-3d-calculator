import type { Equipment, PlacedBox } from '../../types'
import { NOR_BRAND } from '../../data/brand'

type Pt = { x: number; y: number }

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n)) return { r: 100, g: 116, b: 139 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function shade(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex)
  const rr = Math.max(0, Math.min(255, Math.round(r * factor)))
  const gg = Math.max(0, Math.min(255, Math.round(g * factor)))
  const bb = Math.max(0, Math.min(255, Math.round(b * factor)))
  return `rgb(${rr},${gg},${bb})`
}

/**
 * Pier2Pier-style isometric: door LEFT, cab/inderst RIGHT.
 */
function makeProject(L: number, scale: number, ox: number, oy: number) {
  const cos = Math.sqrt(3) / 2
  const sin = 0.5
  return (x: number, y: number, z: number): Pt => {
    const along = L - x
    return {
      x: ox + (along - y) * cos * scale,
      y: oy + (along + y) * sin * scale - z * scale,
    }
  }
}

function fillPoly(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  fill: string,
  stroke: string,
  lineWidth: number,
) {
  if (pts.length < 3) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

function drawSolidBox(
  ctx: CanvasRenderingContext2D,
  project: (x: number, y: number, z: number) => Pt,
  box: PlacedBox,
  opts: { highlight: boolean; faded: boolean },
) {
  const x0 = box.x
  const y0 = box.y
  const z0 = box.z
  const x1 = box.x + box.lengthMm
  const y1 = box.y + box.widthMm
  const z1 = box.z + box.heightMm
  const color = opts.faded ? '#A8B2C1' : box.color
  const edge = opts.highlight
    ? '#0F172A'
    : opts.faded
      ? 'rgba(71,85,105,0.55)'
      : 'rgba(15,23,42,0.75)'
  const lw = opts.highlight ? 2.6 : 1.35

  // Pier2Pier-style solid cube: strong face contrast
  const topF = opts.faded ? 1.02 : 1.18
  const sideF = opts.faded ? 0.88 : 0.82
  const endF = opts.faded ? 0.72 : 0.58
  const backF = opts.faded ? 0.8 : 0.7

  if (opts.faded) ctx.globalAlpha = 0.5

  // Paint far faces first (cab end / far side), then near faces, then top
  fillPoly(
    ctx,
    [
      project(x0, y0, z0),
      project(x0, y1, z0),
      project(x0, y1, z1),
      project(x0, y0, z1),
    ],
    shade(color, backF),
    edge,
    lw,
  )
  fillPoly(
    ctx,
    [
      project(x0, y1, z0),
      project(x1, y1, z0),
      project(x1, y1, z1),
      project(x0, y1, z1),
    ],
    shade(color, sideF * 0.92),
    edge,
    lw,
  )
  fillPoly(
    ctx,
    [
      project(x0, y0, z0),
      project(x1, y0, z0),
      project(x1, y0, z1),
      project(x0, y0, z1),
    ],
    shade(color, sideF),
    edge,
    lw,
  )
  fillPoly(
    ctx,
    [
      project(x1, y0, z0),
      project(x1, y1, z0),
      project(x1, y1, z1),
      project(x1, y0, z1),
    ],
    shade(color, endF),
    edge,
    lw,
  )
  fillPoly(
    ctx,
    [
      project(x0, y0, z1),
      project(x1, y0, z1),
      project(x1, y1, z1),
      project(x0, y1, z1),
    ],
    shade(color, topF),
    edge,
    lw,
  )

  ctx.globalAlpha = 1
}

function fitScale(equipment: Equipment, w: number, h: number) {
  const L = equipment.lengthMm
  const W = equipment.widthMm
  const H = equipment.heightMm
  const cos = Math.sqrt(3) / 2
  const sin = 0.5
  const corners: [number, number, number][] = [
    [0, 0, 0],
    [L, 0, 0],
    [0, W, 0],
    [L, W, 0],
    [0, 0, H],
    [L, 0, H],
    [0, W, H],
    [L, W, H],
  ]
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y, z] of corners) {
    const along = L - x
    const px = (along - y) * cos
    const py = (along + y) * sin - z
    minX = Math.min(minX, px)
    maxX = Math.max(maxX, px)
    minY = Math.min(minY, py)
    maxY = Math.max(maxY, py)
  }
  const pad = 36
  const scale = Math.min(
    (w - pad * 2) / Math.max(1, maxX - minX),
    (h - pad * 2) / Math.max(1, maxY - minY),
  )
  return {
    scale,
    ox: pad - minX * scale,
    oy: pad - minY * scale,
  }
}

export type IsoRenderOpts = {
  title?: string
  stepLabel?: string
  highlight?: PlacedBox | null
  fadeOthers?: boolean
  /** Letter per cargoId */
  labels?: Map<string, string>
  /** Only label the highlighted box */
  labelHighlightOnly?: boolean
  /**
   * 3DLoadCalculator-style: short name on the box top face.
   * Defaults on for overview (no highlight), off for step panels.
   */
  faceLabels?: boolean
  width?: number
  height?: number
}

function truncateLabel(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1))}…`
}

/**
 * Pier2Pier-style solid isometric packing view (canvas 2D — clear side read).
 * Returns JPEG data URL for smaller PDFs.
 */
export function renderIsometricDataUrl(
  equipment: Equipment,
  placed: PlacedBox[],
  opts: IsoRenderOpts = {},
): string {
  const width = opts.width ?? 1400
  const height = opts.height ?? 900
  const fadeOthers = opts.fadeOthers ?? Boolean(opts.highlight)
  const labelHighlightOnly =
    opts.labelHighlightOnly ?? Boolean(opts.highlight && fadeOthers)
  const faceLabels =
    opts.faceLabels ?? (!opts.highlight && !labelHighlightOnly)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas ikke understøttet')

  // Pier2Pier: light paper background
  ctx.fillStyle = '#F7F7F7'
  ctx.fillRect(0, 0, width, height)

  // Title: undefined → equipment name; empty string → hide (step panels)
  const titleText =
    opts.title === undefined ? equipment.name : opts.title.trim()
  const hasTitle = titleText.length > 0
  const hasStep = Boolean(opts.stepLabel)

  if (hasTitle) {
    ctx.fillStyle = '#111827'
    ctx.font = '700 22px system-ui,Segoe UI,sans-serif'
    ctx.fillText(titleText, 18, 32)
  }
  if (opts.stepLabel) {
    ctx.font = '700 18px system-ui,Segoe UI,sans-serif'
    ctx.fillStyle = '#374151'
    const tw = ctx.measureText(opts.stepLabel).width
    ctx.fillText(opts.stepLabel, width - 18 - tw, hasTitle ? 32 : 28)
  }

  const areaY = hasTitle || hasStep ? 44 : 12
  const areaH = height - areaY - 12
  const fit = fitScale(equipment, width, areaH)
  const project = makeProject(
    equipment.lengthMm,
    fit.scale,
    fit.ox,
    areaY + fit.oy,
  )

  const L = equipment.lengthMm
  const W = equipment.widthMm
  const H = equipment.heightMm

  // Floor
  fillPoly(
    ctx,
    [
      project(0, 0, 0),
      project(L, 0, 0),
      project(L, W, 0),
      project(0, W, 0),
    ],
    'rgba(209,213,219,0.55)',
    'rgba(156,163,175,0.5)',
    1,
  )

  // Pier2Pier red wireframe
  const wire = '#E11D48'
  const edges: [[number, number, number], [number, number, number]][] = [
    [[0, 0, 0], [L, 0, 0]],
    [[L, 0, 0], [L, W, 0]],
    [[L, W, 0], [0, W, 0]],
    [[0, W, 0], [0, 0, 0]],
    [[0, 0, H], [L, 0, H]],
    [[L, 0, H], [L, W, H]],
    [[L, W, H], [0, W, H]],
    [[0, W, H], [0, 0, H]],
    [[0, 0, 0], [0, 0, H]],
    [[L, 0, 0], [L, 0, H]],
    [[L, W, 0], [L, W, H]],
    [[0, W, 0], [0, W, H]],
  ]
  ctx.strokeStyle = wire
  ctx.lineWidth = 2.2
  ctx.lineJoin = 'round'
  for (const [a, b] of edges) {
    const p1 = project(a[0], a[1], a[2])
    const p2 = project(b[0], b[1], b[2])
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
  }

  // Dimension labels (cm) — Pier2Pier style along edges
  ctx.fillStyle = '#6B7280'
  ctx.font = '700 16px system-ui,Segoe UI,sans-serif'
  const len = project(L / 2, W + 160, 0)
  ctx.fillText(String(Math.round(L / 10)), len.x - 16, len.y + 4)
  const wid = project(L + 160, W / 2, 0)
  ctx.fillText(String(Math.round(W / 10)), wid.x, wid.y)
  const hei = project(L + 110, 0, H / 2)
  ctx.fillText(String(Math.round(H / 10)), hei.x, hei.y)

  // Cargo — painter's algorithm
  const sorted = [...placed].sort((a, b) => {
    const da = L - (a.x + a.lengthMm / 2) + a.y + a.z * 0.01
    const db = L - (b.x + b.lengthMm / 2) + b.y + b.z * 0.01
    return db - da
  })

  for (const box of sorted) {
    const isHi = opts.highlight === box
    const faded = fadeOthers && Boolean(opts.highlight) && !isHi
    drawSolidBox(ctx, project, box, { highlight: isHi, faded })
  }

  // Labels on top faces (3DLC-style names) and/or letter badges (Pier2Pier steps)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const box of sorted) {
    const isHi = opts.highlight === box
    const faded = fadeOthers && Boolean(opts.highlight) && !isHi
    if (faded && !isHi) continue
    if (labelHighlightOnly && !isHi) continue

    const letter = opts.labels?.get(box.cargoId)
    const c = project(
      box.x + box.lengthMm / 2,
      box.y + box.widthMm / 2,
      box.z + box.heightMm,
    )

    // Approximate projected top-face size for readable captions
    const tl = project(box.x, box.y, box.z + box.heightMm)
    const tr = project(box.x + box.lengthMm, box.y, box.z + box.heightMm)
    const bl = project(box.x, box.y + box.widthMm, box.z + box.heightMm)
    const faceW = Math.hypot(tr.x - tl.x, tr.y - tl.y)
    const faceH = Math.hypot(bl.x - tl.x, bl.y - tl.y)
    const canFitName = faceW >= 48 && faceH >= 18

    if (faceLabels && canFitName && !labelHighlightOnly) {
      const name = truncateLabel(box.name || letter || '?', faceW > 110 ? 22 : 14)
      const caption = letter ? `${letter}  ${name}` : name
      const fontPx = faceW > 100 ? 13 : 11
      ctx.font = `700 ${fontPx}px system-ui,Segoe UI,sans-serif`
      // Dark pill behind text for contrast on saturated cargo colours
      const tw = ctx.measureText(caption).width
      const padX = 6
      const padY = 4
      const bw = tw + padX * 2
      const bh = fontPx + padY * 2
      ctx.fillStyle = 'rgba(15,23,42,0.72)'
      ctx.beginPath()
      const rx = c.x - bw / 2
      const ry = c.y - bh / 2 - 2
      const r = 4
      ctx.moveTo(rx + r, ry)
      ctx.arcTo(rx + bw, ry, rx + bw, ry + bh, r)
      ctx.arcTo(rx + bw, ry + bh, rx, ry + bh, r)
      ctx.arcTo(rx, ry + bh, rx, ry, r)
      ctx.arcTo(rx, ry, rx + bw, ry, r)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(caption, c.x, c.y - 1.5)
      continue
    }

    // Compact letter badge (steps / small boxes)
    if (!letter) continue
    const rad = isHi ? 14 : 11
    ctx.beginPath()
    ctx.arc(c.x, c.y - 2, rad, 0, Math.PI * 2)
    ctx.fillStyle = isHi ? NOR_BRAND.navy : 'rgba(15,23,42,0.78)'
    ctx.fill()
    if (isHi) {
      ctx.lineWidth = 2.5
      ctx.strokeStyle = '#FFFFFF'
      ctx.stroke()
    }
    ctx.fillStyle = '#FFFFFF'
    ctx.font = isHi
      ? '800 14px system-ui,Segoe UI,sans-serif'
      : '700 12px system-ui,Segoe UI,sans-serif'
    ctx.fillText(letter, c.x, c.y - 1.5)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  return canvas.toDataURL('image/jpeg', 0.9)
}
