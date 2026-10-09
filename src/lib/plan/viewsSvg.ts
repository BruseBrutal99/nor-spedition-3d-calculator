import type { PlanUnit, UnitAnalysis } from './types'

const S = 0.5 // px per cm — same scale for top and side so x-axes align
const PAD = { l: 26, r: 14, t: 16, b: 22 }

function ticks(u: PlanUnit, y0: number): string {
  let s = ''
  for (let c = 0; c <= u.L; c += 100) {
    const x = PAD.l + c * S
    s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + (c % 500 ? 3 : 6)}" stroke="#9ca3af"/>`
    if (c % 200 === 0) {
      s += `<text x="${x}" y="${y0 + 13}" font-size="7.5" text-anchor="middle" fill="#6b7280">${c / 100} m</text>`
    }
  }
  return s
}

function lbl(cx: number, cy: number, n: number, color: string, r = 7): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${color}" stroke-width="1.5"/>
    <text x="${cx}" y="${cy + 3}" font-size="8" font-weight="700" text-anchor="middle" fill="#111827">${n}</text>`
}

/** Orthographic top + side SVG strings (vector, print-sharp). */
export function renderViews(
  u: PlanUnit,
  A: UnitAnalysis,
): { top: string; side: string } {
  const Wt = u.L * S + PAD.l + PAD.r
  const Ht = u.W * S + PAD.t + PAD.b
  const Hs = u.H * S + PAD.t + PAD.b

  let top = `<svg viewBox="0 0 ${Wt} ${Ht}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Set ovenfra">
    <rect x="${PAD.l}" y="${PAD.t}" width="${u.L * S}" height="${u.W * S}" fill="#f9fafb" stroke="#111827" stroke-width="1.2"/>
    <rect x="${PAD.l - 8}" y="${PAD.t + u.W * S * 0.2}" width="6" height="${u.W * S * 0.6}" fill="#111827" rx="1"/>
    <text x="${PAD.l - 12}" y="${PAD.t + (u.W * S) / 2}" font-size="7" fill="#6b7280" text-anchor="middle" transform="rotate(-90 ${PAD.l - 12} ${PAD.t + (u.W * S) / 2})">FRONT</text>
    <text x="${PAD.l + u.L * S + 8}" y="${PAD.t + (u.W * S) / 2}" font-size="7" fill="#6b7280" text-anchor="middle" transform="rotate(90 ${PAD.l + u.L * S + 8} ${PAD.t + (u.W * S) / 2})">DØRE</text>
    <line x1="${PAD.l}" y1="${PAD.t + (u.W * S) / 2}" x2="${PAD.l + u.L * S}" y2="${PAD.t + (u.W * S) / 2}" stroke="#d1d5db" stroke-dasharray="3 3"/>`

  for (const i of A.its) {
    const x = PAD.l + i.x * S
    const y = PAD.t + i.y * S
    const w = i.l * S
    const h = i.w * S
    top += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${i.T.color}" fill-opacity=".22" stroke="${i.T.color}" stroke-width="1.2"/>`
    top += lbl(x + w / 2, y + h / 2, i.n, i.T.color)
  }

  const cx = PAD.l + A.cog.x * S
  const cy = PAD.t + A.cog.y * S
  top += `<g stroke="#dc2626" stroke-width="1.5"><line x1="${cx - 6}" y1="${cy}" x2="${cx + 6}" y2="${cy}"/><line x1="${cx}" y1="${cy - 6}" x2="${cx}" y2="${cy + 6}"/></g>
    <circle cx="${cx}" cy="${cy}" r="3" fill="none" stroke="#dc2626"/>
    <text x="${cx + 8}" y="${cy - 5}" font-size="7.5" fill="#dc2626" font-weight="700">TP</text>`
  top += ticks(u, PAD.t + u.W * S + 2) + `</svg>`

  let side = `<svg viewBox="0 0 ${Wt} ${Hs}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Set fra siden">
    <rect x="${PAD.l}" y="${PAD.t}" width="${u.L * S}" height="${u.H * S}" fill="#f9fafb" stroke="#111827" stroke-width="1.2"/>
    <text x="${PAD.l - 4}" y="${PAD.t + 6}" font-size="7" fill="#6b7280" text-anchor="end">${u.H}</text>`

  const depthSorted = [...A.its].sort((p, q) => q.y - p.y)
  for (const i of depthSorted) {
    const x = PAD.l + i.x * S
    const w = i.l * S
    const h = i.h * S
    const y = PAD.t + u.H * S - i.z * S - h
    side += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${i.T.color}" fill-opacity=".22" stroke="${i.T.color}" stroke-width="1.2"/>`
  }

  const seen = new Set<string>()
  for (const i of A.its) {
    const k = `${i.x}|${i.z}`
    if (seen.has(k)) continue
    seen.add(k)
    const grp = A.its
      .filter((j) => j.x === i.x && j.z === i.z)
      .map((j) => j.n)
      .join('+')
    const x = PAD.l + i.x * S + (i.l * S) / 2
    const y = PAD.t + u.H * S - i.z * S - i.h * S - 6
    side += `<text x="${x}" y="${y}" font-size="7.5" font-weight="700" text-anchor="middle" fill="#111827">${grp}</text>`
  }

  const cogY = PAD.t + u.H * S - A.cog.z * S
  side += `<line x1="${cx}" y1="${cogY - 6}" x2="${cx}" y2="${cogY + 6}" stroke="#dc2626" stroke-width="1.5"/>
    <line x1="${cx - 6}" y1="${cogY}" x2="${cx + 6}" y2="${cogY}" stroke="#dc2626" stroke-width="1.5"/>`
  side += ticks(u, PAD.t + u.H * S + 2) + `</svg>`

  return { top, side }
}

export function sideLabel(
  item: { y: number; w: number },
  unitW: number,
): 'V' | 'H' | 'midt' {
  const mid = item.y + item.w / 2
  const half = unitW / 2
  if (mid < half - 1) return 'V'
  if (mid > half + 1) return 'H'
  return 'midt'
}
