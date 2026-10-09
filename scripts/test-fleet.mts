import { packFleet } from '../src/lib/packer.ts'
import { EQUIPMENT_PRESETS, CARGO_COLORS } from '../src/data/equipment.ts'
import type { CargoItem } from '../src/types.ts'

const eq =
  EQUIPMENT_PRESETS.find((p) => p.id === 'trailer-13.6-240-265') ??
  EQUIPMENT_PRESETS[1]

const items: CargoItem[] = [
  {
    id: 'hub',
    name: 'Hub sektion',
    lengthMm: 1550,
    widthMm: 1720,
    heightMm: 860,
    weightKg: 7200,
    quantity: 2,
    allowRotation: true,
    stackable: false,
    color: CARGO_COLORS[0],
  },
  {
    id: 'propel',
    name: 'Propel',
    lengthMm: 1200,
    widthMm: 500,
    heightMm: 2000,
    weightKg: 1500,
    quantity: 20,
    allowRotation: true,
    stackable: false,
    color: CARGO_COLORS[1],
  },
]

const plan = packFleet(items, eq, { allowStacking: false })
console.log(
  JSON.stringify(
    {
      vehicleCount: plan.vehicleCount,
      splitReason: plan.splitReason,
      totalWeightKg: plan.totalWeightKg,
      vehicles: plan.vehicles.map((v) => ({
        label: v.label,
        weight: Math.round(v.result.totalWeightKg),
        lm: +v.result.loadingMeters.toFixed(2),
        placed: v.result.placed.length,
        unplaced: v.result.unplaced.length,
        stacked: v.result.placed.filter((p) => p.z > 0.5).length,
        cargo: v.items.map((i) => `${i.quantity}×${i.name}`),
      })),
    },
    null,
    2,
  ),
)
