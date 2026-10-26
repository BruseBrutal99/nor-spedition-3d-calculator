import { describe, expect, it } from 'vitest'
import { EQUIPMENT_PRESETS } from '../data/equipment'
import type { CargoItem } from '../types'
import {
  occupancyLoadingMeters,
  packFleet,
  packLoad,
  sectionOriginMm,
} from './packer'

const TRAILER =
  EQUIPMENT_PRESETS.find((p) => p.id === 'trailer-13.6-240-265') ??
  EQUIPMENT_PRESETS[1]

const MODUL =
  EQUIPMENT_PRESETS.find((p) => p.id === 'modulvogntog-25.25')!

function item(
  i: number,
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  weightKg: number,
): CargoItem {
  return {
    id: `p${i}`,
    name: `Package ${i}`,
    lengthMm,
    widthMm,
    heightMm,
    weightKg,
    quantity: 1,
    allowRotation: true,
    stackable: false,
    color: '#888',
  }
}

/** Customer packing list (non-stack) that previously split evenly across 2 trucks. */
const PACKAGES: CargoItem[] = [
  item(1, 3350, 1750, 1700, 1190),
  item(2, 1400, 900, 350, 30),
  item(3, 1600, 700, 760, 280),
  item(4, 1600, 700, 760, 280),
  item(5, 1600, 700, 760, 280),
  item(6, 1200, 700, 850, 235),
  item(7, 800, 600, 650, 85),
  item(8, 1200, 800, 600, 113),
  item(9, 1200, 800, 800, 123),
  item(10, 1200, 800, 1100, 278),
  item(11, 1300, 1050, 1530, 654),
  item(12, 1200, 1200, 1180, 249),
  item(13, 1300, 1050, 1530, 654),
  item(14, 1200, 1200, 1180, 249),
  item(15, 1100, 1100, 700, 354),
  item(16, 1200, 800, 1500, 150),
  item(17, 500, 500, 600, 37),
  item(18, 1200, 800, 1100, 230),
  item(19, 800, 600, 390, 42),
  item(20, 1200, 880, 1580, 148),
  item(21, 1200, 880, 1360, 172),
  item(22, 1200, 800, 1170, 121),
  item(23, 1200, 800, 1500, 170),
  item(24, 1050, 1330, 2250, 485),
  item(25, 1050, 1330, 2250, 485),
]

describe('packFleet fill-first (non-stack)', () => {
  it('fills Bil 1 before spilling to Bil 2 — not even weight split', () => {
    const fleet = packFleet(PACKAGES, TRAILER, { allowStacking: false })

    expect(fleet.vehicleCount).toBeGreaterThanOrEqual(1)
    for (const v of fleet.vehicles) {
      expect(v.result.unplaced.length).toBe(0)
    }

    if (fleet.vehicleCount >= 2) {
      const bil1 = fleet.vehicles[0]!
      const bil2 = fleet.vehicles[1]!
      const count1 = bil1.result.placed.length
      const count2 = bil2.result.placed.length
      // Bil 1 must get the larger share (fill-first), not a balanced ~50/50
      expect(count1).toBeGreaterThan(count2)
      expect(bil1.result.loadingMeters).toBeGreaterThan(bil2.result.loadingMeters)
      expect(fleet.splitReason ?? '').toMatch(/Bil 1 fyldt først/i)
    }
  })

  it('keeps everything on Bil 1 when it fits', () => {
    const few = PACKAGES.slice(0, 3)
    const fleet = packFleet(few, TRAILER, { allowStacking: false })
    expect(fleet.vehicleCount).toBe(1)
    expect(fleet.vehicles[0]!.result.placed.length).toBe(3)
    expect(fleet.splitReason).toBeNull()
  })
})

describe('modulvogntog split decks', () => {
  it('has forvogn + trailer sections and 42 t payload', () => {
    expect(MODUL.sections?.map((s) => s.id)).toEqual(['forvogn', 'trailer'])
    expect(MODUL.sections?.[0]?.lengthMm).toBe(6800)
    expect(MODUL.sections?.[1]?.lengthMm).toBe(13600)
    expect(MODUL.maxWeightKg).toBe(42000)
    expect(MODUL.lengthMm).toBe(20400)
  })

  it('places long cargo on trailer, not across the coupling gap', () => {
    const long: CargoItem = {
      id: 'long',
      name: 'Lang kasse',
      lengthMm: 8000,
      widthMm: 1200,
      heightMm: 1200,
      weightKg: 500,
      quantity: 1,
      allowRotation: false,
      stackable: false,
      color: '#888',
    }
    const result = packLoad([long], MODUL, { allowStacking: false })
    expect(result.placed.length).toBe(1)
    expect(result.placed[0]!.sectionId).toBe('trailer')
    const trailerOrigin = sectionOriginMm(MODUL, 1)
    expect(result.placed[0]!.x).toBeGreaterThanOrEqual(trailerOrigin - 0.5)
    // Must not sit in the gap between forvogn end and trailer start
    const forvognEnd = MODUL.sections![0]!.lengthMm
    expect(result.placed[0]!.x).toBeGreaterThanOrEqual(trailerOrigin)
    expect(result.placed[0]!.x).toBeGreaterThan(forvognEnd)
  })

  it('fills forvogn before trailer', () => {
    const small = item(1, 1200, 800, 800, 200)
    small.quantity = 4
    const result = packLoad([small], MODUL, { allowStacking: false })
    expect(result.placed.length).toBe(4)
    expect(result.placed.every((p) => p.sectionId === 'forvogn')).toBe(true)
  })
})

describe('floor rotation optimizes width', () => {
  it('fits 17×115×154 cm non-stack on one 13,6 m trailer via 2-abreast', () => {
    const cargo: CargoItem = {
      id: 'colli1',
      name: 'Colli 1',
      lengthMm: 1150,
      widthMm: 1540,
      heightMm: 1300,
      weightKg: 800,
      quantity: 17,
      allowRotation: false, // packer must rotate anyway (langs/bredde)
      stackable: false,
      color: '#3b82f6',
    }
    const fleet = packFleet([cargo], TRAILER, { allowStacking: false })
    expect(fleet.vehicleCount).toBe(1)
    expect(fleet.vehicles[0]!.result.placed.length).toBe(17)
    expect(fleet.vehicles[0]!.result.unplaced.length).toBe(0)
    // Must use the orientation that allows two across (w=1150)
    const widths = new Set(
      fleet.vehicles[0]!.result.placed.map((p) => p.widthMm),
    )
    expect(widths.has(1150)).toBe(true)
  })
})

describe('occupancy LDM (reel gulvplads)', () => {
  it('counts narrow cargo as share of width, not full length', () => {
    // 10 m × 0,8 m on a 2,4 m wide deck → 10 × 0,8 / 2,4 ≈ 3,33 LDM
    const placed = [
      {
        cargoId: 'pipe',
        name: 'Rør',
        x: 0,
        y: 0,
        z: 0,
        lengthMm: 10000,
        widthMm: 800,
        heightMm: 400,
        weightKg: 200,
        color: '#0f0',
        itemIndex: 1,
      },
    ]
    const ldm = occupancyLoadingMeters(placed, 2400)
    expect(ldm).toBeCloseTo((10000 * 800) / 2400 / 1000, 5)
    expect(ldm).toBeLessThan(4)
  })

  it('does not double-count side-by-side colli on the same length', () => {
    // Two 2 m × 1,2 m pallets side by side = full width for 2 m → 2 LDM
    const placed = [
      {
        cargoId: 'a',
        name: 'A',
        x: 0,
        y: 0,
        z: 0,
        lengthMm: 2000,
        widthMm: 1200,
        heightMm: 1000,
        weightKg: 100,
        color: '#00f',
        itemIndex: 1,
      },
      {
        cargoId: 'b',
        name: 'B',
        x: 0,
        y: 1200,
        z: 0,
        lengthMm: 2000,
        widthMm: 1200,
        heightMm: 1000,
        weightKg: 100,
        color: '#f00',
        itemIndex: 1,
      },
    ]
    expect(occupancyLoadingMeters(placed, 2400)).toBeCloseTo(2, 5)
  })

  it('packLoad LDM follows packed floor length', () => {
    const longNarrow: CargoItem = {
      id: 'pipe',
      name: 'Langt smalt',
      lengthMm: 10000,
      widthMm: 800,
      heightMm: 400,
      weightKg: 300,
      quantity: 1,
      allowRotation: false,
      stackable: false,
      color: '#0f0',
    }
    const result = packLoad([longNarrow], TRAILER, { allowStacking: false })
    expect(result.placed.length).toBe(1)
    expect(result.loadingMeters).toBeCloseTo(10, 1)
    expect(result.floorLengthMm).toBeGreaterThanOrEqual(10000)
  })
})

describe('ordre fleet fits on ≤2 trailers', () => {
  it('packs 58 palletised colli (~19 t) on at most 2×13,6 m', () => {
    // Representative mix from customer ordre (dims cm, weights are per-colli)
    const items: CargoItem[] = [
      { id: 'a', name: 'A', lengthMm: 1200, widthMm: 800, heightMm: 1400, weightKg: 460, quantity: 16, allowRotation: true, stackable: true, color: '#3b82f6' },
      { id: 'b', name: 'B', lengthMm: 1200, widthMm: 800, heightMm: 1050, weightKg: 350, quantity: 12, allowRotation: true, stackable: true, color: '#22c55e' },
      { id: 'c', name: 'C', lengthMm: 2350, widthMm: 800, heightMm: 700, weightKg: 340, quantity: 8, allowRotation: true, stackable: true, color: '#f59e0b' },
      { id: 'd', name: 'D', lengthMm: 2000, widthMm: 800, heightMm: 700, weightKg: 380, quantity: 6, allowRotation: true, stackable: true, color: '#ef4444' },
      { id: 'e', name: 'E', lengthMm: 1200, widthMm: 800, heightMm: 700, weightKg: 240, quantity: 8, allowRotation: true, stackable: true, color: '#8b5cf6' },
      { id: 'f', name: 'F', lengthMm: 2350, widthMm: 800, heightMm: 350, weightKg: 230, quantity: 4, allowRotation: true, stackable: true, color: '#06b6d4' },
      { id: 'g', name: 'G', lengthMm: 2000, widthMm: 1000, heightMm: 400, weightKg: 113, quantity: 2, allowRotation: true, stackable: true, color: '#84cc16' },
      { id: 'h', name: 'H', lengthMm: 1200, widthMm: 800, heightMm: 350, weightKg: 100, quantity: 2, allowRotation: true, stackable: true, color: '#f97316' },
    ]
    const totalQty = items.reduce((s, i) => s + i.quantity, 0)
    expect(totalQty).toBe(58)
    const totalKg = items.reduce((s, i) => s + i.weightKg * i.quantity, 0)
    expect(totalKg).toBeLessThan(24000)

    const fleet = packFleet(items, TRAILER, { allowStacking: true })
    expect(fleet.vehicleCount).toBeLessThanOrEqual(2)
    expect(
      fleet.vehicles.reduce((s, v) => s + v.result.placed.length, 0),
    ).toBe(58)
  })
})

describe('dense row packing (customer 4,8 LDM case)', () => {
  it('packs 5×80×100 + 8×70×115 on ≤5,2 LDM (target ~4,8)', () => {
    const items: CargoItem[] = [
      {
        id: 'c2',
        name: 'Colli 2',
        lengthMm: 800,
        widthMm: 1000,
        heightMm: 800,
        weightKg: 100,
        quantity: 5,
        allowRotation: true,
        stackable: false,
        color: '#3b82f6',
      },
      {
        id: 'c1',
        name: 'Colli 1',
        lengthMm: 700,
        widthMm: 1150,
        heightMm: 700,
        weightKg: 100,
        quantity: 8,
        allowRotation: true,
        stackable: false,
        color: '#ef4444',
      },
    ]
    const result = packLoad(items, TRAILER, { allowStacking: false })
    expect(result.placed.length).toBe(13)
    expect(result.unplaced.length).toBe(0)
    expect(result.loadingMeters).toBeLessThanOrEqual(5.2)
    expect(result.loadingMeters).toBeLessThanOrEqual(4.85)
  })
})
