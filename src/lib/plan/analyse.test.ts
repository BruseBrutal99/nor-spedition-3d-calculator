import { describe, expect, it } from 'vitest'
import { analyse } from './analyse'
import type { PlanUnit } from './types'

/** Example from lasteplan-skabelon: 1 hub + 10 propels = 22.200 kg */
const EXAMPLE_UNIT: PlanUnit = {
  index: 1,
  total: 2,
  name: 'Sættevogn 13,6 m',
  L: 1360,
  W: 240,
  H: 265,
  payload: 24000,
  types: {
    a: {
      name: 'Hub sektion',
      l: 155,
      w: 172,
      h: 86,
      kgEach: 7200,
      color: '#3b82f6',
      flags: ['Ikke stabelbar', 'Kun gulv'],
    },
    b: {
      name: 'Propel',
      l: 50,
      w: 120,
      h: 200,
      kgEach: 1500,
      color: '#10b981',
      flags: ['Ikke vendbar', 'Surres'],
    },
  },
  items: [
    ...[0, 1, 2, 3, 4].flatMap((r) => [
      { t: 'b' as const, x: 40 + r * 230, y: 0, z: 0 },
      { t: 'b' as const, x: 40 + r * 230, y: 120, z: 0 },
    ]),
    { t: 'a', x: 1180, y: 34, z: 0 },
  ],
}

describe('analyse', () => {
  it('matches skabelon snapshot (22.200 kg, ~93 % vægt, ~17 % rum, 11 kolli)', () => {
    const A = analyse(EXAMPLE_UNIT)

    expect(A.its).toHaveLength(11)
    expect(A.kg).toBe(22200)
    expect(Math.round(A.wPct)).toBe(93)
    expect(Math.round(A.vPct)).toBe(17)
    expect(A.weightLimited).toBe(true)
    expect(A.ldmCharged).toBe(13.6)
    expect(A.ldmFloor).toBeGreaterThan(0)
    expect(A.ldmFloor).toBeLessThan(13.6)
    expect(A.cogLevel).toMatch(/^(ok|warn|bad)$/)

    expect({
      kg: A.kg,
      kolli: A.its.length,
      wPct: Math.round(A.wPct),
      vPct: Math.round(A.vPct),
      ldmCharged: A.ldmCharged,
      weightLimited: A.weightLimited,
      cogLevel: A.cogLevel,
    }).toMatchSnapshot()
  })
})
