import { describe, expect, it } from 'vitest'
import { EQUIPMENT_PRESETS } from '../../data/equipment'
import { packFleet } from '../packer'
import { draftsToCargoItems, scanEmailCargoLocal } from './scanEmailCargo'

const TRAILER =
  EQUIPMENT_PRESETS.find((p) => p.id === 'trailer-13.6-240-265') ??
  EQUIPMENT_PRESETS[1]

/** Full customer ordre paste that previously became 3 trucks @ ~23.9 t */
const ORDRE_LIST = `
Ordre 5222571
3x 120 x 80 x 105 cm – 1.057 kg
3x 235 x 80 x 70 cm – 972 kg
3x 120 x 80 x 140 cm – 1.464 kg
1x 200 x 80 x 70 cm – 446 kg
1x 235 x 80 x 75 cm – 445 kg
1x 200 x 80 x 90 cm – 440 kg
1x 120 x 80 x 130 cm – 374 kg
1x 120 x 80 x 95 cm – 318 kg
1x 200 x 100 x 40 cm – 113 kg
1x 120 x 80 x 70 cm – 492 kg
1x 235 x 80 x 35 cm – 239 kg

Ordre 5223975
2x 120 x 80 x 105 cm – 322 kg
1x 120 x 80 x 35 cm – 97 kg
1x 235 x 80 x 70 cm – 345 kg

Ordre 5222703
10x 120 x 80 x 140 cm – 4.608 kg
2x 120 x 80 x 105 cm – 901 kg
2x 235 x 80 x 70 cm – 1.026 kg
1x 120 x 80 x 75 cm – 91 kg
1x 200 x 80 x 70 cm – 380 kg
1x 120 x 80 x 70 cm – 170 kg

Ordre 5222704
2x 120 x 80 x 140 cm – 504 kg
1x 120 x 80 x 125 cm – 372 kg
1x 120 x 80 x 70 cm – 151 kg

Ordre 5222705
2x 120 x 80 x 105 cm – 542 kg
2x 200 x 80 x 70 cm – 769 kg
1x 120 x 80 x 35 cm – 109 kg
1x 120 x 80 x 140 cm – 364 kg

Ordre 5222706
1x 120 x 80 x 105 cm – 178 kg
1x 235 x 80 x 35 cm – 204 kg
1x 120 x 80 x 105 cm – 277 kg

Ordre 5222707
1x 120 x 80 x 105 cm – 279 kg

Ordre 5223449
1x 120 x 80 x 70 cm – 145 kg
1x 235 x 80 x 35 cm – 238 kg
1x 235 x 80 x 70 cm – 248 kg

Ordre 5223447
1x 200 x 80 x 35 cm – 118 kg
1x 200 x 80 x 70 cm – 225 kg

Ordre 5222061
1x 120 x 80 x 35 cm – 106 kg

Total
Antal colli 58
Total CBM 61,36 m³
Total bruttovægt 19.129 kg
`

describe('full ordre → fleet', () => {
  it('parses ~19.1 t / 58 colli and packs on ≤2 trailers', () => {
    const drafts = scanEmailCargoLocal(ORDRE_LIST)
    const totalQty = drafts.reduce((s, d) => s + d.quantity, 0)
    expect(totalQty).toBe(58)

    const totalKg = drafts.reduce((s, d) => s + d.weightKg * d.quantity, 0)
    expect(totalKg).toBeGreaterThan(18500)
    expect(totalKg).toBeLessThan(20000)
    // Must NOT inflate like the old AI path (~23922)
    expect(totalKg).toBeLessThan(22000)

    const items = draftsToCargoItems(drafts)
    const fleet = packFleet(items, TRAILER, { allowStacking: true })
    expect(fleet.vehicleCount).toBeLessThanOrEqual(2)
    expect(
      fleet.vehicles.reduce((s, v) => s + v.result.placed.length, 0),
    ).toBe(58)
  })
})
