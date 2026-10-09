import { NOR_BRAND } from '../../data/brand'
import type {
  CargoItem,
  Equipment,
  FleetPlan,
  PlacedBox,
  VehicleLoad,
} from '../../types'
import { loadingSequence } from '../packer'
import type { CargoType, Plan, PlanItem, PlanUnit } from './types'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

function mmToCm(mm: number): number {
  return Math.round(mm) / 10
}

function flagsFor(item: CargoItem | undefined): string[] {
  const flags: string[] = []
  if (item && !item.stackable) {
    flags.push('Ikke stabelbar')
    flags.push('Kun gulv')
  }
  if (item && !item.allowRotation) flags.push('Ikke vendbar')
  return flags
}

function wasRotated(box: PlacedBox, src: CargoItem | undefined): boolean {
  if (!src) return false
  return (
    Math.abs(box.lengthMm - src.widthMm) < 1 &&
    Math.abs(box.widthMm - src.lengthMm) < 1 &&
    Math.abs(box.lengthMm - src.lengthMm) > 1
  )
}

/**
 * Map one vehicle's placed boxes → PlanUnit (cm, loading order).
 * Each unit only contains THAT vehicle's cargo — never the whole fleet.
 */
export function vehicleToUnit(
  vehicle: VehicleLoad,
  equipment: Equipment,
  totalVehicles: number,
): PlanUnit {
  const seq = loadingSequence(vehicle.result.placed)
  const itemById = new Map(vehicle.items.map((i) => [i.id, i]))

  /** Key = cargoId + placed LxW (rotation splits types) */
  const typeKeyOf = new Map<string, string>()
  const types: Record<string, CargoType> = {}
  let letterIdx = 0

  const ensureType = (box: PlacedBox): string => {
    const src = itemById.get(box.cargoId)
    const rot = wasRotated(box, src)
    const sig = `${box.cargoId}|${box.lengthMm}x${box.widthMm}x${box.heightMm}`
    const existing = typeKeyOf.get(sig)
    if (existing) return existing

    const key = LETTERS[letterIdx++] ?? `t${letterIdx}`
    typeKeyOf.set(sig, key)

    const placedL = mmToCm(box.lengthMm)
    const placedW = mmToCm(box.widthMm)
    const placedH = mmToCm(box.heightMm)
    const awbL = src ? mmToCm(src.lengthMm) : placedL
    const awbW = src ? mmToCm(src.widthMm) : placedW
    const awbH = src ? mmToCm(src.heightMm) : placedH

    const typeFlags = flagsFor(src)
    if (rot) typeFlags.push('Roteret')

    types[key] = {
      name: src?.name ?? box.name,
      l: placedL,
      w: placedW,
      h: placedH,
      kgEach: box.weightKg,
      color: src?.color ?? box.color,
      flags: typeFlags,
      awb:
        rot || awbL !== placedL || awbW !== placedW
          ? { l: awbL, w: awbW, h: awbH }
          : undefined,
    }
    return key
  }

  const items: PlanItem[] = seq.map((box) => {
    const src = itemById.get(box.cargoId)
    const t = ensureType(box)
    return {
      t,
      x: mmToCm(box.x),
      y: mmToCm(box.y),
      z: mmToCm(box.z),
      rot: wasRotated(box, src) ? 90 : 0,
    }
  })

  return {
    index: vehicle.index,
    total: totalVehicles,
    name: equipment.name,
    L: mmToCm(equipment.lengthMm),
    W: mmToCm(equipment.widthMm),
    H: mmToCm(equipment.heightMm),
    payload: equipment.maxWeightKg,
    types,
    items,
  }
}

export type PlanMeta = {
  ref?: string
  customer?: string
  route?: string
  loadDate?: string
  notes?: string[]
}

/** Build full Plan from fleet — one Unit per vehicle with that vehicle's placements only. */
export function buildPlan(
  fleet: FleetPlan,
  equipment: Equipment,
  meta: PlanMeta = {},
): Plan {
  const created = new Date().toISOString()
  const stamp = created.slice(0, 10)
  const units = fleet.vehicles.map((v) =>
    vehicleToUnit(v, equipment, fleet.vehicleCount),
  )

  return {
    company: {
      name: 'NOR Spedition',
      system: 'Nexum TMS',
      email: NOR_BRAND.contactEmail,
    },
    ref: meta.ref?.trim() || `NOR-${stamp}`,
    customer: meta.customer?.trim() || '—',
    route: meta.route?.trim() || '—',
    loadDate: meta.loadDate || stamp,
    created,
    notes: meta.notes,
    units,
  }
}

/** Fallback when only a single LoadResult is available (no fleet wrapper). */
export function buildPlanFromSingle(
  equipment: Equipment,
  placed: PlacedBox[],
  items: CargoItem[],
  meta: PlanMeta = {},
): Plan {
  const vehicle: VehicleLoad = {
    index: 1,
    label: 'Bil 1',
    items,
    result: {
      placed,
      unplaced: [],
      usedVolumeM3: 0,
      totalVolumeM3: 0,
      fillPercent: 0,
      totalWeightKg: placed.reduce((s, p) => s + p.weightKg, 0),
      maxWeightKg: equipment.maxWeightKg,
      weightPercent: 0,
      floorLengthMm: 0,
      equipmentLengthMm: equipment.lengthMm,
      loadingMeters: 0,
      physicalLoadingMeters: 0,
      weightLoadingMeters: 0,
      floorPercent: 0,
    },
  }
  return buildPlan(
    {
      vehicleCount: 1,
      splitReason: null,
      totalWeightKg: vehicle.result.totalWeightKg,
      vehicles: [vehicle],
    },
    equipment,
    meta,
  )
}
