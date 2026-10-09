import type {
  CargoItem,
  Equipment,
  FleetPlan,
  LoadResult,
  PackingOptions,
  PlacedBox,
  VehicleLoad,
} from '../types'

type Point = { x: number; y: number; z: number }
type Size = { l: number; w: number; h: number }

type Candidate = {
  cargoId: string
  name: string
  weightKg: number
  color: string
  itemIndex: number
  sizes: Size[]
}

function orientations(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  allowRotation: boolean,
): Size[] {
  const base: Size[] = [{ l: lengthMm, w: widthMm, h: heightMm }]
  if (allowRotation && lengthMm !== widthMm) {
    base.push({ l: widthMm, w: lengthMm, h: heightMm })
  }
  return base
}

function expandCargo(items: CargoItem[]): Candidate[] {
  const out: Candidate[] = []
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      out.push({
        cargoId: item.id,
        name: item.name,
        weightKg: item.weightKg,
        color: item.color,
        itemIndex: i + 1,
        sizes: orientations(
          item.lengthMm,
          item.widthMm,
          item.heightMm,
          item.allowRotation,
        ),
      })
    }
  }
  // Heavy + tall first as stable bases, then large footprint
  out.sort((a, b) => {
    if (b.weightKg !== a.weightKg) return b.weightKg - a.weightKg
    if (b.sizes[0].h !== a.sizes[0].h) return b.sizes[0].h - a.sizes[0].h
    const ba = a.sizes[0].l * a.sizes[0].w
    const bb = b.sizes[0].l * b.sizes[0].w
    if (bb !== ba) return bb - ba
    return bb * b.sizes[0].h - ba * a.sizes[0].h
  })
  return out
}

function overlaps(a: PlacedBox, x: number, y: number, z: number, s: Size): boolean {
  return !(
    x + s.l <= a.x ||
    a.x + a.lengthMm <= x ||
    y + s.w <= a.y ||
    a.y + a.widthMm <= y ||
    z + s.h <= a.z ||
    a.z + a.heightMm <= z
  )
}

function fitsInEquipment(
  eq: Equipment,
  x: number,
  y: number,
  z: number,
  s: Size,
): boolean {
  return (
    x >= 0 &&
    y >= 0 &&
    z >= 0 &&
    x + s.l <= eq.lengthMm &&
    y + s.w <= eq.widthMm &&
    z + s.h <= eq.heightMm
  )
}

type SupportInfo = {
  ok: boolean
  minSupportWeightKg: number
  supportAreaRatio: number
}

/**
 * Stacking support: ≥55% base coverage, and don't put clearly heavier
 * cargo on clearly lighter (allows ~10% + 40 kg slack for estimated weights).
 */
function evaluateSupport(
  placed: PlacedBox[],
  x: number,
  y: number,
  z: number,
  s: Size,
  allowStacking: boolean,
  stackableIds: Set<string>,
  candidateWeightKg: number,
): SupportInfo {
  if (z <= 0.5) {
    return { ok: true, minSupportWeightKg: Infinity, supportAreaRatio: 1 }
  }
  if (!allowStacking) {
    return { ok: false, minSupportWeightKg: 0, supportAreaRatio: 0 }
  }

  const baseArea = s.l * s.w
  let supportArea = 0
  let minSupportWeightKg = Infinity

  for (const p of placed) {
    if (Math.abs(p.z + p.heightMm - z) > 0.5) continue
    if (!stackableIds.has(p.cargoId)) continue
    const ox = Math.max(0, Math.min(x + s.l, p.x + p.lengthMm) - Math.max(x, p.x))
    const oy = Math.max(0, Math.min(y + s.w, p.y + p.widthMm) - Math.max(y, p.y))
    if (ox > 0 && oy > 0) {
      supportArea += ox * oy
      minSupportWeightKg = Math.min(minSupportWeightKg, p.weightKg)
    }
  }

  const supportAreaRatio = baseArea > 0 ? supportArea / baseArea : 0
  const weightOk =
    Number.isFinite(minSupportWeightKg) &&
    candidateWeightKg <= minSupportWeightKg * 1.1 + 40

  // Center of base should sit over support (avoids cantilever)
  const cx = x + s.l / 2
  const cy = y + s.w / 2
  let centerSupported = false
  for (const p of placed) {
    if (Math.abs(p.z + p.heightMm - z) > 0.5) continue
    if (!stackableIds.has(p.cargoId)) continue
    if (
      cx >= p.x - 0.5 &&
      cx <= p.x + p.lengthMm + 0.5 &&
      cy >= p.y - 0.5 &&
      cy <= p.y + p.widthMm + 0.5
    ) {
      centerSupported = true
      break
    }
  }

  const ok = supportAreaRatio >= 0.55 && weightOk && centerSupported
  return { ok, minSupportWeightKg, supportAreaRatio }
}

function contactArea(
  placed: PlacedBox[],
  eq: Equipment,
  x: number,
  y: number,
  z: number,
  s: Size,
): number {
  let contact = 0
  const eps = 0.5

  if (z <= eps) contact += s.l * s.w * 1.1
  if (x <= eps) contact += s.w * s.h * 1.2
  if (y <= eps) contact += s.l * s.h
  if (Math.abs(y + s.w - eq.widthMm) <= eps) contact += s.l * s.h

  for (const p of placed) {
    if (Math.abs(p.x + p.lengthMm - x) <= eps || Math.abs(x + s.l - p.x) <= eps) {
      const oy = Math.max(0, Math.min(y + s.w, p.y + p.widthMm) - Math.max(y, p.y))
      const oz = Math.max(0, Math.min(z + s.h, p.z + p.heightMm) - Math.max(z, p.z))
      contact += oy * oz
    }
    if (Math.abs(p.y + p.widthMm - y) <= eps || Math.abs(y + s.w - p.y) <= eps) {
      const ox = Math.max(0, Math.min(x + s.l, p.x + p.lengthMm) - Math.max(x, p.x))
      const oz = Math.max(0, Math.min(z + s.h, p.z + p.heightMm) - Math.max(z, p.z))
      contact += ox * oz
    }
    if (Math.abs(p.z + p.heightMm - z) <= eps || Math.abs(z + s.h - p.z) <= eps) {
      const ox = Math.max(0, Math.min(x + s.l, p.x + p.lengthMm) - Math.max(x, p.x))
      const oy = Math.max(0, Math.min(y + s.w, p.y + p.widthMm) - Math.max(y, p.y))
      contact += ox * oy * 1.35
    }
  }

  return contact
}

function addExtremePoints(
  points: Point[],
  placed: PlacedBox,
  eq: Equipment,
): void {
  const candidates: Point[] = [
    { x: placed.x + placed.lengthMm, y: placed.y, z: placed.z },
    { x: placed.x, y: placed.y + placed.widthMm, z: placed.z },
    { x: placed.x, y: placed.y, z: placed.z + placed.heightMm },
    { x: placed.x + placed.lengthMm, y: placed.y + placed.widthMm, z: placed.z },
    { x: placed.x + placed.lengthMm, y: placed.y, z: placed.z + placed.heightMm },
    { x: placed.x, y: placed.y + placed.widthMm, z: placed.z + placed.heightMm },
  ]
  for (const c of candidates) {
    pushUnique(points, c, eq)
  }
}

function pushUnique(points: Point[], p: Point, eq: Equipment) {
  if (p.x < 0 || p.y < 0 || p.z < 0) return
  if (p.x >= eq.lengthMm || p.y >= eq.widthMm || p.z >= eq.heightMm) return
  const exists = points.some(
    (q) =>
      Math.abs(q.x - p.x) < 0.5 &&
      Math.abs(q.y - p.y) < 0.5 &&
      Math.abs(q.z - p.z) < 0.5,
  )
  if (!exists) points.push(p)
}

/**
 * Extreme-point packer for truck loading.
 * Prefers short load length (inderst) and stacks when it saves floor length.
 */
export function packLoad(
  items: CargoItem[],
  equipment: Equipment,
  options: PackingOptions = { allowStacking: true },
): LoadResult {
  const candidates = expandCargo(items)
  const stackableIds = new Set(
    items.filter((i) => i.stackable).map((i) => i.id),
  )
  const placed: PlacedBox[] = []
  const unplaced: LoadResult['unplaced'] = []
  const points: Point[] = [{ x: 0, y: 0, z: 0 }]
  let totalWeight = 0

  for (const cand of candidates) {
    if (totalWeight + cand.weightKg > equipment.maxWeightKg) {
      unplaced.push({
        cargoId: cand.cargoId,
        name: `${cand.name} #${cand.itemIndex}`,
        reason: 'Vægtgrænse overskredet',
      })
      continue
    }

    let best: { point: Point; size: Size; score: number } | null = null
    const currentMaxX = placed.length
      ? Math.max(...placed.map((p) => p.x + p.lengthMm))
      : 0

    const tryPoints: Point[] = []
    for (const p of points) {
      tryPoints.push(p)
      pushUnique(tryPoints, { x: 0, y: p.y, z: p.z }, equipment)
      pushUnique(tryPoints, { x: p.x, y: 0, z: p.z }, equipment)
      pushUnique(tryPoints, { x: 0, y: 0, z: p.z }, equipment)
    }

    // Explicit stack candidates aligned to tops of placed boxes
    if (options.allowStacking) {
      for (const p of placed) {
        if (!stackableIds.has(p.cargoId)) continue
        const topZ = p.z + p.heightMm
        pushUnique(tryPoints, { x: p.x, y: p.y, z: topZ }, equipment)
        pushUnique(tryPoints, { x: p.x, y: 0, z: topZ }, equipment)
        pushUnique(tryPoints, { x: 0, y: p.y, z: topZ }, equipment)
        // Center-ish of support top for better coverage when sizes differ
        pushUnique(
          tryPoints,
          {
            x: p.x,
            y: Math.max(0, p.y + p.widthMm / 2 - cand.sizes[0].w / 2),
            z: topZ,
          },
          equipment,
        )
      }
    }

    for (const point of tryPoints) {
      for (const size of cand.sizes) {
        if (!fitsInEquipment(equipment, point.x, point.y, point.z, size)) continue
        if (placed.some((p) => overlaps(p, point.x, point.y, point.z, size))) {
          continue
        }

        const support = evaluateSupport(
          placed,
          point.x,
          point.y,
          point.z,
          size,
          options.allowStacking,
          stackableIds,
          cand.weightKg,
        )
        if (!support.ok) continue

        const contact = contactArea(
          placed,
          equipment,
          point.x,
          point.y,
          point.z,
          size,
        )

        const newMaxX = Math.max(currentMaxX, point.x + size.l)
        const extendsLength = Math.max(0, point.x + size.l - currentMaxX)

        // Lower is better: keep load short (fill width before stretching toward door)
        const stackBonus =
          options.allowStacking && point.z > 0.5 ? 80 : 0
        const score =
          newMaxX * 1e3 +
          extendsLength * 2.5e3 +
          point.x * 40 +
          point.y * 0.35 +
          point.z * (options.allowStacking ? 0.02 : 50) -
          contact * 0.08 -
          support.supportAreaRatio * 120 -
          stackBonus

        if (!best || score < best.score) {
          best = { point, size, score }
        }
      }
    }

    if (!best) {
      unplaced.push({
        cargoId: cand.cargoId,
        name: `${cand.name} #${cand.itemIndex}`,
        reason: 'Ikke plads i udstyr',
      })
      continue
    }

    const box: PlacedBox = {
      cargoId: cand.cargoId,
      name: cand.name,
      x: best.point.x,
      y: best.point.y,
      z: best.point.z,
      lengthMm: best.size.l,
      widthMm: best.size.w,
      heightMm: best.size.h,
      weightKg: cand.weightKg,
      color: cand.color,
      itemIndex: cand.itemIndex,
    }
    placed.push(box)
    totalWeight += cand.weightKg

    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i]
      if (
        p.x >= box.x &&
        p.x < box.x + box.lengthMm &&
        p.y >= box.y &&
        p.y < box.y + box.widthMm &&
        p.z >= box.z &&
        p.z < box.z + box.heightMm
      ) {
        points.splice(i, 1)
      }
    }
    addExtremePoints(points, box, equipment)

    // Prefer lower + inderst points next
    points.sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y)
    if (points.length > 600) points.length = 600
  }

  const usedVolumeM3 =
    placed.reduce((s, p) => s + p.lengthMm * p.widthMm * p.heightMm, 0) /
    1e9
  const totalVolumeM3 =
    (equipment.lengthMm * equipment.widthMm * equipment.heightMm) / 1e9

  const physicalFloorMm = placed.length
    ? Math.max(...placed.map((p) => p.x + p.lengthMm))
    : 0
  const physicalLoadingMeters = physicalFloorMm / 1000
  const trailerM = equipment.lengthMm / 1000
  const weightRatio =
    equipment.maxWeightKg > 0 ? totalWeight / equipment.maxWeightKg : 0
  const weightLoadingMeters = weightRatio * trailerM

  // Chargeable LDM: weight first, then space. Full trailer when weight fills it.
  let loadingMeters = Math.max(physicalLoadingMeters, weightLoadingMeters)
  if (weightRatio >= 0.9) {
    loadingMeters = trailerM
  }
  loadingMeters = Math.min(trailerM, loadingMeters)

  const chargeableFloorMm = Math.round(loadingMeters * 1000)
  const balanced =
    chargeableFloorMm > physicalFloorMm + 50
      ? redistributeForAxleBalance(placed, chargeableFloorMm)
      : placed

  const floorLengthMm = balanced.length
    ? Math.max(...balanced.map((p) => p.x + p.lengthMm))
    : 0
  const floorPercent =
    equipment.lengthMm > 0 ? (loadingMeters / trailerM) * 100 : 0

  return {
    placed: balanced,
    unplaced,
    usedVolumeM3,
    totalVolumeM3,
    fillPercent: totalVolumeM3 > 0 ? (usedVolumeM3 / totalVolumeM3) * 100 : 0,
    totalWeightKg: totalWeight,
    maxWeightKg: equipment.maxWeightKg,
    weightPercent: weightRatio * 100,
    floorLengthMm: Math.max(floorLengthMm, chargeableFloorMm),
    equipmentLengthMm: equipment.lengthMm,
    loadingMeters,
    physicalLoadingMeters,
    weightLoadingMeters,
    floorPercent,
  }
}

/**
 * Spread column-clusters along the trailer so weight isn't piled at the cab
 * when chargeable LDM ≫ dense footprint (axle / commercial fill).
 */
function redistributeForAxleBalance(
  placed: PlacedBox[],
  targetEndMm: number,
): PlacedBox[] {
  if (!placed.length) return placed
  const sorted = [...placed].sort(
    (a, b) => a.x - b.x || a.y - b.y || a.z - b.z,
  )
  const clusters: PlacedBox[][] = []
  for (const box of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && Math.abs(box.x - last[0].x) < 100) last.push(box)
    else clusters.push([box])
  }

  const spans = clusters.map((c) =>
    Math.max(...c.map((b) => b.x + b.lengthMm - c[0].x)),
  )
  const sumSpans = spans.reduce((a, b) => a + b, 0)
  const gapTotal = Math.max(0, targetEndMm - sumSpans)
  const weights = clusters.map((c) =>
    c.reduce((s, b) => s + b.weightKg, 0),
  )
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1

  // Gaps proportional to neighbouring weight — push mass toward mid-trailer
  const gapWeights: number[] = []
  for (let i = 0; i < clusters.length - 1; i++) {
    gapWeights.push(weights[i] + weights[i + 1])
  }
  const gapWeightSum = gapWeights.reduce((a, b) => a + b, 0) || 1

  let cursor = 0
  const out: PlacedBox[] = []
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]
    const originX = cluster[0].x
    for (const b of cluster) {
      out.push({ ...b, x: cursor + (b.x - originX) })
    }
    cursor += spans[i]
    if (i < clusters.length - 1) {
      cursor += (gapTotal * gapWeights[i]) / gapWeightSum
    }
  }

  // Nudge so cargo CoG sits near 45% of chargeable length (axle-friendly)
  const cog =
    out.reduce((s, b) => s + b.weightKg * (b.x + b.lengthMm / 2), 0) /
    weightSum
  const targetCog = targetEndMm * 0.45
  let shift = targetCog - cog
  const minX = Math.min(...out.map((b) => b.x))
  const maxX = Math.max(...out.map((b) => b.x + b.lengthMm))
  if (shift < -minX) shift = -minX
  if (maxX + shift > targetEndMm) shift = targetEndMm - maxX
  if (Math.abs(shift) > 1) {
    return out.map((b) => ({ ...b, x: b.x + shift }))
  }
  return out
}

export function mmToM(mm: number): number {
  return mm / 1000
}

export function formatM3(m3: number): string {
  return `${m3.toFixed(2)} m³`
}

export function formatKg(kg: number): string {
  return `${Math.round(kg).toLocaleString('da-DK')} kg`
}

/** Chargeable ladmeter (LDM). */
export function formatLadmeter(meters: number): string {
  const text = (Math.round(meters * 100) / 100).toLocaleString('da-DK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${text} LDM`
}

/**
 * Physical loading sequence: inderst (cab/front, low X) → door,
 * floor before stacked, left before right.
 */
export function loadingSequence(placed: PlacedBox[]): PlacedBox[] {
  return [...placed].sort(
    (a, b) => a.x - b.x || a.z - b.z || a.y - b.y || a.itemIndex - b.itemIndex,
  )
}

type Piece = {
  key: string
  cargoId: string
  name: string
  lengthMm: number
  widthMm: number
  heightMm: number
  weightKg: number
  allowRotation: boolean
  stackable: boolean
  color: string
  itemIndex: number
}

function expandToPieces(items: CargoItem[]): Piece[] {
  const out: Piece[] = []
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      out.push({
        key: `${item.id}#${i + 1}`,
        cargoId: item.id,
        name: item.name,
        lengthMm: item.lengthMm,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        weightKg: item.weightKg,
        allowRotation: item.allowRotation,
        stackable: item.stackable,
        color: item.color,
        itemIndex: i + 1,
      })
    }
  }
  return out
}

function piecesToCargoItems(pieces: Piece[]): CargoItem[] {
  const map = new Map<string, CargoItem>()
  for (const p of pieces) {
    const existing = map.get(p.cargoId)
    if (existing) {
      existing.quantity += 1
    } else {
      map.set(p.cargoId, {
        id: p.cargoId,
        name: p.name,
        lengthMm: p.lengthMm,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        weightKg: p.weightKg,
        quantity: 1,
        allowRotation: p.allowRotation,
        stackable: p.stackable,
        color: p.color,
      })
    }
  }
  return [...map.values()]
}

/** Greedy multifit: heaviest first → lightest feasible bin (weight-balanced). */
function partitionByWeight(
  pieces: Piece[],
  binCount: number,
  maxWeightKg: number,
): Piece[][] | null {
  if (binCount < 1) return null
  const sorted = [...pieces].sort((a, b) => b.weightKg - a.weightKg)
  const bins: Piece[][] = Array.from({ length: binCount }, () => [])
  const weights = Array.from({ length: binCount }, () => 0)

  for (const piece of sorted) {
    if (piece.weightKg > maxWeightKg + 1e-6) return null
    let best = -1
    for (let i = 0; i < binCount; i++) {
      if (weights[i] + piece.weightKg > maxWeightKg + 1e-6) continue
      if (best < 0 || weights[i] < weights[best]) best = i
    }
    if (best < 0) return null
    bins[best].push(piece)
    weights[best] += piece.weightKg
  }
  return bins
}

function minVehiclesByWeight(pieces: Piece[], maxWeightKg: number): number {
  if (!pieces.length) return 1
  const total = pieces.reduce((s, p) => s + p.weightKg, 0)
  const heaviest = Math.max(...pieces.map((p) => p.weightKg))
  if (heaviest > maxWeightKg) return Infinity
  return Math.max(1, Math.ceil(total / maxWeightKg - 1e-9))
}

/**
 * Plan one or more vehicles when weight/space requires it.
 * Splits pieces for even weight, then packs each truck separately.
 */
export function packFleet(
  items: CargoItem[],
  equipment: Equipment,
  options: PackingOptions = { allowStacking: true },
): FleetPlan {
  const pieces = expandToPieces(items)
  const totalWeightKg = pieces.reduce((s, p) => s + p.weightKg, 0)

  if (!pieces.length) {
    const empty = packLoad([], equipment, options)
    return {
      vehicleCount: 1,
      splitReason: null,
      totalWeightKg: 0,
      vehicles: [
        {
          index: 1,
          label: 'Bil 1',
          items: [],
          result: empty,
        },
      ],
    }
  }

  const minByWeight = minVehiclesByWeight(pieces, equipment.maxWeightKg)
  if (!Number.isFinite(minByWeight)) {
    const fail = packLoad(items, equipment, options)
    return {
      vehicleCount: 1,
      splitReason: `Enkelt colli overskrider max vægt (${equipment.maxWeightKg.toLocaleString('da-DK')} kg)`,
      totalWeightKg,
      vehicles: [{ index: 1, label: 'Bil 1', items, result: fail }],
    }
  }

  const maxTry = Math.min(pieces.length, minByWeight + 6)
  let best: FleetPlan | null = null

  for (let n = minByWeight; n <= maxTry; n++) {
    const bins = partitionByWeight(pieces, n, equipment.maxWeightKg)
    if (!bins) continue

    const vehicles: VehicleLoad[] = bins.map((bin, i) => {
      const binItems = piecesToCargoItems(bin)
      return {
        index: i + 1,
        label: `Bil ${i + 1}`,
        items: binItems,
        result: packLoad(binItems, equipment, options),
      }
    })

    const allFit = vehicles.every((v) => v.result.unplaced.length === 0)
    const plan: FleetPlan = {
      vehicleCount: n,
      splitReason:
        n > 1
          ? totalWeightKg > equipment.maxWeightKg
            ? `Samlet vægt ${Math.round(totalWeightKg).toLocaleString('da-DK')} kg overskrider max ${equipment.maxWeightKg.toLocaleString('da-DK')} kg pr. bil — fordelt på ${n} biler`
            : `Kræver ${n} biler for at få plads (non-stack / mål)`
          : null,
      totalWeightKg,
      vehicles,
    }

    if (allFit) return plan
    if (
      !best ||
      vehicles.reduce((s, v) => s + v.result.unplaced.length, 0) <
        best.vehicles.reduce((s, v) => s + v.result.unplaced.length, 0)
    ) {
      best = plan
    }
  }

  return (
    best ?? {
      vehicleCount: 1,
      splitReason: null,
      totalWeightKg,
      vehicles: [
        {
          index: 1,
          label: 'Bil 1',
          items,
          result: packLoad(items, equipment, options),
        },
      ],
    }
  )
}
