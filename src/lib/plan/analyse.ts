import type { PlanUnit, UnitAnalysis } from './types'

/**
 * Pure metrics for one vehicle/unit. Used by HTML/PDF — never recompute in UI.
 * Coordinates and type dims are cm (as placed).
 */
export function analyse(u: PlanUnit): UnitAnalysis {
  const its = u.items.map((p, i) => {
    const T = u.types[p.t]
    if (!T) {
      throw new Error(`Ukendt varetype "${p.t}" på kolli ${i + 1}`)
    }
    return {
      ...p,
      n: i + 1,
      l: T.l,
      w: T.w,
      h: T.h,
      kg: T.kgEach,
      T,
    }
  })

  const kg = its.reduce((s, i) => s + i.kg, 0)
  const vol = its.reduce((s, i) => s + i.l * i.w * i.h, 0)
  const usedLen = its.length ? Math.max(...its.map((i) => i.x + i.l)) : 0

  const cog =
    kg > 0
      ? {
          x: its.reduce((s, i) => s + (i.x + i.l / 2) * i.kg, 0) / kg,
          y: its.reduce((s, i) => s + (i.y + i.w / 2) * i.kg, 0) / kg,
          z: its.reduce((s, i) => s + (i.z + i.h / 2) * i.kg, 0) / kg,
        }
      : { x: u.L / 2, y: u.W / 2, z: 0 }

  const wPct = u.payload > 0 ? (kg / u.payload) * 100 : 0
  const capacity = u.L * u.W * u.H
  const vPct = capacity > 0 ? (vol / capacity) * 100 : 0

  const ldmFloor = usedLen / 100
  // Weight-limited: near full weight but little volume → charge full trailer LDM
  const weightLimited = wPct >= 85 && vPct < 50
  const ldmCharged = weightLimited ? u.L / 100 : ldmFloor

  const offX = u.L > 0 ? ((cog.x - u.L / 2) / u.L) * 100 : 0
  const offY = u.W > 0 ? ((cog.y - u.W / 2) / u.W) * 100 : 0
  const cogLevel =
    Math.abs(offY) > 8
      ? 'bad'
      : Math.abs(offY) > 4 || Math.abs(offX) > 15
        ? 'warn'
        : 'ok'

  return {
    its,
    kg,
    vol,
    usedLen,
    cog,
    wPct,
    vPct,
    ldmFloor,
    ldmCharged,
    weightLimited,
    offX,
    offY,
    cogLevel,
  }
}
