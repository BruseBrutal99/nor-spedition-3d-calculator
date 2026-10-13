import { describe, expect, it } from 'vitest'
import { EQUIPMENT_PRESETS } from '../data/equipment'
import type { CargoItem } from '../types'
import { packFleet, packLoad, sectionOriginMm } from './packer'

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
