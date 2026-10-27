import type {
  CargoItem,
  Equipment,
  EquipmentSection,
  FleetPlan,
  LoadResult,
  PackingOptions,
  PlacedBox,
  VehicleLoad,
} from '../types'

type Size = { l: number; w: number; h: number }

/** Floor orientations: L↔W always allowed (height stays up). */
function orientations(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
): Size[] {
  const base: Size[] = [{ l: lengthMm, w: widthMm, h: heightMm }]
  if (lengthMm !== widthMm) {
    base.push({ l: widthMm, w: lengthMm, h: heightMm })
  }
  return base
}

const DEFAULT_SECTION_GAP_MM = 1800

/** Sections to pack into — single deck when equipment has no split. */
export function getEquipmentSections(eq: Equipment): EquipmentSection[] {
  if (eq.sections && eq.sections.length > 0) return eq.sections
  return [
    {
      id: 'main',
      name: 'Lad',
      lengthMm: eq.lengthMm,
      widthMm: eq.widthMm,
      heightMm: eq.heightMm,
    },
  ]
}

export function equipmentSectionGapMm(eq: Equipment): number {
  return eq.sectionGapMm ?? DEFAULT_SECTION_GAP_MM
}

/** Total usable deck length (no coupling gap). */
export function equipmentDeckLengthMm(eq: Equipment): number {
  return getEquipmentSections(eq).reduce((s, sec) => s + sec.lengthMm, 0)
}

/** Span including visual gaps between sections (3D / PDF). */
export function equipmentSpanMm(eq: Equipment): number {
  const sections = getEquipmentSections(eq)
  if (sections.length <= 1) return eq.lengthMm
  const gap = equipmentSectionGapMm(eq)
  return (
    sections.reduce((s, sec) => s + sec.lengthMm, 0) +
    gap * (sections.length - 1)
  )
}

export function sectionOriginMm(eq: Equipment, index: number): number {
  const sections = getEquipmentSections(eq)
  const gap = equipmentSectionGapMm(eq)
  let x = 0
  for (let i = 0; i < index; i++) {
    x += sections[i].lengthMm + gap
  }
  return x
}

function equipmentVolumeM3(eq: Equipment): number {
  return getEquipmentSections(eq).reduce(
    (s, sec) => s + (sec.lengthMm * sec.widthMm * sec.heightMm) / 1e9,
    0,
  )
}

type FreeRect = { x: number; y: number; l: number; w: number }

function freeRectsOverlap(
  a: FreeRect,
  b: { x: number; y: number; l: number; w: number },
): boolean {
  return (
    a.x < b.x + b.l - 0.5 &&
    a.x + a.l > b.x + 0.5 &&
    a.y < b.y + b.w - 0.5 &&
    a.y + a.w > b.y + 0.5
  )
}

/** MaxRects: subtract used box from free list, prune contained rects. */
function subtractFreeRect(
  free: FreeRect[],
  used: { x: number; y: number; l: number; w: number },
): FreeRect[] {
  const next: FreeRect[] = []
  for (const fr of free) {
    if (!freeRectsOverlap(fr, used)) {
      next.push(fr)
      continue
    }
    const ux0 = used.x
    const uy0 = used.y
    const ux1 = used.x + used.l
    const uy1 = used.y + used.w
    const fx0 = fr.x
    const fy0 = fr.y
    const fx1 = fr.x + fr.l
    const fy1 = fr.y + fr.w
    if (ux0 > fx0 + 0.5) {
      next.push({ x: fx0, y: fy0, l: ux0 - fx0, w: fr.w })
    }
    if (ux1 < fx1 - 0.5) {
      next.push({ x: ux1, y: fy0, l: fx1 - ux1, w: fr.w })
    }
    if (uy0 > fy0 + 0.5) {
      next.push({ x: fx0, y: fy0, l: fr.l, w: uy0 - fy0 })
    }
    if (uy1 < fy1 - 0.5) {
      next.push({ x: fx0, y: uy1, l: fr.l, w: fy1 - uy1 })
    }
  }
  const pruned: FreeRect[] = []
  for (let i = 0; i < next.length; i++) {
    const a = next[i]!
    if (a.l < 1 || a.w < 1) continue
    let inside = false
    for (let j = 0; j < next.length; j++) {
      if (i === j) continue
      const b = next[j]!
      if (
        a.x >= b.x - 0.5 &&
        a.y >= b.y - 0.5 &&
        a.x + a.l <= b.x + b.l + 0.5 &&
        a.y + a.w <= b.y + b.w + 0.5
      ) {
        inside = true
        break
      }
    }
    if (!inside) pruned.push(a)
  }
  return pruned
}

/**
 * Free-rectangle floor packer (MaxRects / bottom-left).
 * Fills L-shaped leftovers when colli have different depths — unlike guillotine shelves.
 * With stacking: builds columns on each floor slot, then a global top-up pass.
 */
function packMaxRectsFloor(
  items: CargoItem[],
  equipment: Equipment,
  allowStacking = false,
): { placed: PlacedBox[]; unplaced: LoadResult['unplaced']; totalWeight: number } {
  type Piece = {
    cargoId: string
    name: string
    weightKg: number
    color: string
    itemIndex: number
    stackable: boolean
    sizes: Size[]
  }

  type Column = {
    x: number
    y: number
    baseL: number
    baseW: number
    topZ: number
    stackable: boolean
    cargoId: string
  }

  const stackableIds = new Set(
    items.filter((i) => i.stackable).map((i) => i.id),
  )

  const fitsDeck = (s: Size) =>
    s.w <= equipment.widthMm + 0.5 &&
    s.l <= equipment.lengthMm + 0.5 &&
    s.h <= equipment.heightMm + 0.5

  const remaining: Piece[] = []
  for (const item of items) {
    const sizes = orientations(item.lengthMm, item.widthMm, item.heightMm).filter(
      fitsDeck,
    )
    if (!sizes.length) continue
    for (let i = 0; i < item.quantity; i++) {
      remaining.push({
        cargoId: item.id,
        name: item.name,
        weightKg: item.weightKg,
        color: item.color,
        itemIndex: i + 1,
        stackable: stackableIds.has(item.id),
        sizes,
      })
    }
  }

  // Large footprint first (good stack bases), then tall, then long
  remaining.sort((a, b) => {
    const areaA = Math.max(...a.sizes.map((s) => s.l * s.w))
    const areaB = Math.max(...b.sizes.map((s) => s.l * s.w))
    const hA = Math.max(...a.sizes.map((s) => s.h))
    const hB = Math.max(...b.sizes.map((s) => s.h))
    const longA = Math.max(...a.sizes.map((s) => s.l))
    const longB = Math.max(...b.sizes.map((s) => s.l))
    return areaB - areaA || hB - hA || longB - longA
  })

  const placed: PlacedBox[] = []
  const columns: Column[] = []
  const unplaced: LoadResult['unplaced'] = []
  let totalWeight = 0
  let free: FreeRect[] = [
    { x: 0, y: 0, l: equipment.lengthMm, w: equipment.widthMm },
  ]

  const placeAt = (p: Piece, x: number, y: number, z: number, size: Size) => {
    placed.push({
      cargoId: p.cargoId,
      name: p.name,
      x,
      y,
      z,
      lengthMm: size.l,
      widthMm: size.w,
      heightMm: size.h,
      weightKg: p.weightKg,
      color: p.color,
      itemIndex: p.itemIndex,
    })
    totalWeight += p.weightKg
  }

  const tryStackOne = (col: Column): boolean => {
    if (!allowStacking || !col.stackable) return false
    let bestJ = -1
    let bestSize: Size | null = null
    let bestKey = -Infinity
    for (let j = 0; j < remaining.length; j++) {
      const p = remaining[j]!
      if (!p.stackable) continue
      if (totalWeight + p.weightKg > equipment.maxWeightKg) continue
      for (const s of p.sizes) {
        if (s.l > col.baseL + 0.5) continue
        if (s.w > col.baseW + 0.5) continue
        if (col.topZ + s.h > equipment.heightMm + 0.5) continue
        const sameId = p.cargoId === col.cargoId ? 1e9 : 0
        const fit =
          Math.abs(s.l - col.baseL) < 0.5 && Math.abs(s.w - col.baseW) < 0.5
            ? 1e6
            : 0
        const key = sameId + fit + s.l * s.w * 1e-3 + s.h
        if (key > bestKey) {
          bestKey = key
          bestJ = j
          bestSize = s
        }
      }
    }
    if (bestJ < 0 || !bestSize) return false
    const p = remaining.splice(bestJ, 1)[0]!
    placeAt(p, col.x, col.y, col.topZ, bestSize)
    col.topZ += bestSize.h
    return true
  }

  const stackOnColumn = (col: Column) => {
    let g = 0
    while (g++ < 40 && tryStackOne(col)) {
      /* keep stacking */
    }
  }

  let floorGuard = 0
  while (remaining.length > 0 && floorGuard++ < 500) {
    let bestJ = -1
    let bestSize: Size | null = null
    let bestX = 0
    let bestY = 0
    let bestDens = -Infinity
    let bestArea = -1
    let bestX2 = Infinity
    let bestY2 = Infinity

    for (let j = 0; j < remaining.length; j++) {
      const p = remaining[j]!
      if (totalWeight + p.weightKg > equipment.maxWeightKg) continue
      for (const s of p.sizes) {
        for (const fr of free) {
          if (s.l > fr.l + 0.5 || s.w > fr.w + 0.5) continue
          // Prefer long items that still fill width (deep shelves others nest into),
          // and L↔W that maximises colli across the free strip.
          const across = Math.floor((fr.w + 0.5) / s.w)
          if (across < 1) continue
          const area = s.l * s.w
          const score = s.l * across * s.w
          const betterPos =
            fr.x < bestX2 - 0.5 ||
            (Math.abs(fr.x - bestX2) < 0.5 && fr.y < bestY2 - 0.5)
          const samePos =
            Math.abs(fr.x - bestX2) < 0.5 && Math.abs(fr.y - bestY2) < 0.5
          if (
            betterPos ||
            (samePos && score > bestDens + 1e-6) ||
            (samePos && Math.abs(score - bestDens) < 1e-6 && area > bestArea)
          ) {
            bestDens = score
            bestArea = area
            bestX2 = fr.x
            bestY2 = fr.y
            bestJ = j
            bestSize = s
            bestX = fr.x
            bestY = fr.y
          }
        }
      }
    }

    if (bestJ < 0 || !bestSize) break

    const p = remaining.splice(bestJ, 1)[0]!
    placeAt(p, bestX, bestY, 0, bestSize)
    free = subtractFreeRect(free, {
      x: bestX,
      y: bestY,
      l: bestSize.l,
      w: bestSize.w,
    })
    const col: Column = {
      x: bestX,
      y: bestY,
      baseL: bestSize.l,
      baseW: bestSize.w,
      topZ: bestSize.h,
      stackable: p.stackable,
      cargoId: p.cargoId,
    }
    columns.push(col)
    stackOnColumn(col)
  }

  if (allowStacking) {
    let progress = true
    let topGuard = 0
    while (progress && remaining.length > 0 && topGuard++ < 200) {
      progress = false
      const order = [...columns].sort(
        (a, b) => b.baseL * b.baseW - a.baseL * a.baseW || a.topZ - b.topZ,
      )
      for (const c of order) {
        if (tryStackOne(c)) {
          progress = true
          break
        }
      }
    }
  }

  for (const p of remaining) {
    unplaced.push({
      cargoId: p.cargoId,
      name: `${p.name} #${p.itemIndex}`,
      reason:
        totalWeight + p.weightKg > equipment.maxWeightKg
          ? 'Vægtgrænse overskredet'
          : 'Ikke plads i udstyr',
    })
  }

  return { placed, unplaced, totalWeight }
}

/**
 * Guillotine shelf packer (non-stack): fill width in rows, then advance along length.
 * Chooses L↔W orientation that maximises colli per ladmeter.
 * With stacking: builds vertical columns on each floor slot before moving on.
 */
function packGuillotineShelves(
  items: CargoItem[],
  equipment: Equipment,
  allowStacking = false,
): { placed: PlacedBox[]; unplaced: LoadResult['unplaced']; totalWeight: number } {
  type Piece = {
    cargoId: string
    name: string
    weightKg: number
    color: string
    itemIndex: number
    stackable: boolean
    sizes: Size[]
    size: Size
  }

  const stackableIds = new Set(
    items.filter((i) => i.stackable).map((i) => i.id),
  )

  const pickSize = (sizes: Size[]): Size | null => {
    let best: Size | null = null
    let bestD = -1
    for (const s of sizes) {
      if (s.w > equipment.widthMm + 0.5) continue
      if (s.l > equipment.lengthMm + 0.5) continue
      if (s.h > equipment.heightMm + 0.5) continue
      const across = Math.floor((equipment.widthMm + 0.5) / s.w)
      if (across < 1) continue
      const d = across / s.l
      if (d > bestD + 1e-12) {
        bestD = d
        best = s
      }
    }
    return best
  }

  const remaining: Piece[] = []
  for (const item of items) {
    const sizes = orientations(item.lengthMm, item.widthMm, item.heightMm)
    for (let i = 0; i < item.quantity; i++) {
      const size = pickSize(sizes)
      if (!size) continue
      remaining.push({
        cargoId: item.id,
        name: item.name,
        weightKg: item.weightKg,
        color: item.color,
        itemIndex: i + 1,
        stackable: stackableIds.has(item.id),
        sizes,
        size,
      })
    }
  }

  // Deeper shelves first; keep similar footprints together
  remaining.sort(
    (a, b) =>
      b.size.l - a.size.l ||
      b.size.w - a.size.w ||
      b.size.h - a.size.h ||
      a.cargoId.localeCompare(b.cargoId),
  )

  type Column = {
    x: number
    y: number
    baseL: number
    baseW: number
    topZ: number
    stackable: boolean
    cargoId: string
  }

  const placed: PlacedBox[] = []
  const columns: Column[] = []
  const unplaced: LoadResult['unplaced'] = []
  let totalWeight = 0
  let shelfX = 0

  const placeAt = (p: Piece, x: number, y: number, z: number, size: Size) => {
    placed.push({
      cargoId: p.cargoId,
      name: p.name,
      x,
      y,
      z,
      lengthMm: size.l,
      widthMm: size.w,
      heightMm: size.h,
      weightKg: p.weightKg,
      color: p.color,
      itemIndex: p.itemIndex,
    })
    totalWeight += p.weightKg
  }

  const tryStackOne = (col: Column): boolean => {
    if (!allowStacking || !col.stackable) return false
    let bestJ = -1
    let bestSize: Size | null = null
    let bestKey = -Infinity
    for (let j = 0; j < remaining.length; j++) {
      const p = remaining[j]!
      if (!p.stackable) continue
      if (totalWeight + p.weightKg > equipment.maxWeightKg) continue
      for (const s of p.sizes) {
        if (s.l > col.baseL + 0.5) continue
        if (s.w > col.baseW + 0.5) continue
        if (col.topZ + s.h > equipment.heightMm + 0.5) continue
        const sameId = p.cargoId === col.cargoId ? 1e9 : 0
        const fit =
          Math.abs(s.l - col.baseL) < 0.5 && Math.abs(s.w - col.baseW) < 0.5
            ? 1e6
            : 0
        const key = sameId + fit + s.l * s.w * 1e-3 + s.h
        if (key > bestKey) {
          bestKey = key
          bestJ = j
          bestSize = s
        }
      }
    }
    if (bestJ < 0 || !bestSize) return false
    const p = remaining.splice(bestJ, 1)[0]!
    placeAt(p, col.x, col.y, col.topZ, bestSize)
    col.topZ += bestSize.h
    return true
  }

  const stackOnColumn = (col: Column) => {
    let guard = 0
    while (guard++ < 40 && tryStackOne(col)) {
      /* keep stacking */
    }
  }

  const addFloorColumn = (
    p: Piece,
    x: number,
    y: number,
    size: Size,
  ): Column => {
    placeAt(p, x, y, 0, size)
    const col: Column = {
      x,
      y,
      baseL: size.l,
      baseW: size.w,
      topZ: size.h,
      stackable: p.stackable,
      cargoId: p.cargoId,
    }
    columns.push(col)
    stackOnColumn(col)
    return col
  }

  /** Fill L-shaped leftovers inside the current shelf band. */
  const fillShelfResiduals = (shelfOrigin: number, shelfDepth: number) => {
    let free: FreeRect[] = [
      { x: shelfOrigin, y: 0, l: shelfDepth, w: equipment.widthMm },
    ]
    for (const box of placed) {
      if (box.z > 0.5) continue
      if (box.x + box.lengthMm < shelfOrigin + 0.5) continue
      if (box.x > shelfOrigin + shelfDepth - 0.5) continue
      free = subtractFreeRect(free, {
        x: box.x,
        y: box.y,
        l: box.lengthMm,
        w: box.widthMm,
      })
    }

    let guard = 0
    while (remaining.length > 0 && guard++ < 200) {
      let bestJ = -1
      let bestSize: Size | null = null
      let bestX = 0
      let bestY = 0
      let bestScore = -Infinity
      let bestX2 = Infinity
      let bestY2 = Infinity

      for (let j = 0; j < remaining.length; j++) {
        const p = remaining[j]!
        if (totalWeight + p.weightKg > equipment.maxWeightKg) continue
        for (const s of p.sizes) {
          for (const fr of free) {
            if (s.l > fr.l + 0.5 || s.w > fr.w + 0.5) continue
            const across = Math.floor((fr.w + 0.5) / s.w)
            if (across < 1) continue
            const score = s.l * across * s.w
            const betterPos =
              fr.x < bestX2 - 0.5 ||
              (Math.abs(fr.x - bestX2) < 0.5 && fr.y < bestY2 - 0.5)
            const samePos =
              Math.abs(fr.x - bestX2) < 0.5 && Math.abs(fr.y - bestY2) < 0.5
            if (
              betterPos ||
              (samePos && score > bestScore + 1e-6)
            ) {
              bestScore = score
              bestX2 = fr.x
              bestY2 = fr.y
              bestJ = j
              bestSize = s
              bestX = fr.x
              bestY = fr.y
            }
          }
        }
      }
      if (bestJ < 0 || !bestSize) break
      const p = remaining.splice(bestJ, 1)[0]!
      addFloorColumn(p, bestX, bestY, bestSize)
      free = subtractFreeRect(free, {
        x: bestX,
        y: bestY,
        l: bestSize.l,
        w: bestSize.w,
      })
    }
  }

  while (remaining.length > 0) {
    let openIdx = -1
    let openDens = -1
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i]!
      if (totalWeight + p.weightKg > equipment.maxWeightKg) continue
      if (shelfX + p.size.l > equipment.lengthMm + 0.5) {
        let alt: Size | null = null
        let altD = -1
        for (const s of p.sizes) {
          if (shelfX + s.l > equipment.lengthMm + 0.5) continue
          if (s.w > equipment.widthMm + 0.5) continue
          if (s.h > equipment.heightMm + 0.5) continue
          const across = Math.floor((equipment.widthMm + 0.5) / s.w)
          if (across < 1) continue
          const d = across / s.l
          if (d > altD) {
            altD = d
            alt = s
          }
        }
        if (!alt) continue
        p.size = alt
      }
      const across = Math.floor((equipment.widthMm + 0.5) / p.size.w)
      const d = across / p.size.l
      if (d > openDens) {
        openDens = d
        openIdx = i
      }
    }

    if (openIdx < 0) break

    const first = remaining.splice(openIdx, 1)[0]!
    const shelfDepth = first.size.l
    addFloorColumn(first, shelfX, 0, first.size)
    let y = first.size.w

    let guard = 0
    while (guard++ < 500 && remaining.length > 0) {
      let bestJ = -1
      let bestSize: Size | null = null
      let bestKey = -Infinity
      for (let j = 0; j < remaining.length; j++) {
        const p = remaining[j]!
        if (totalWeight + p.weightKg > equipment.maxWeightKg) continue
        for (const s of p.sizes) {
          if (s.l > shelfDepth + 0.5) continue
          if (y + s.w > equipment.widthMm + 0.5) continue
          if (s.h > equipment.heightMm + 0.5) continue
          const exact = Math.abs(s.l - shelfDepth) < 0.5 ? 1e9 : 0
          const key = exact + s.w * 1e3 + s.l
          if (key > bestKey) {
            bestKey = key
            bestJ = j
            bestSize = s
          }
        }
      }
      if (bestJ < 0 || !bestSize) break
      const p = remaining.splice(bestJ, 1)[0]!
      addFloorColumn(p, shelfX, y, bestSize)
      y += bestSize.w
    }

    fillShelfResiduals(shelfX, shelfDepth)
    shelfX += shelfDepth
  }

  if (allowStacking && remaining.length > 0) {
    let progress = true
    let topGuard = 0
    while (progress && remaining.length > 0 && topGuard++ < 200) {
      progress = false
      const order = [...columns].sort(
        (a, b) => b.baseL * b.baseW - a.baseL * a.baseW || a.topZ - b.topZ,
      )
      for (const c of order) {
        if (tryStackOne(c)) {
          progress = true
          break
        }
      }
    }
  }

  for (const p of remaining) {
    unplaced.push({
      cargoId: p.cargoId,
      name: `${p.name} #${p.itemIndex}`,
      reason:
        totalWeight + p.weightKg > equipment.maxWeightKg
          ? 'Vægtgrænse overskredet'
          : 'Ikke plads i udstyr',
    })
  }

  return { placed, unplaced, totalWeight }
}

type DeckPack = {
  placed: PlacedBox[]
  unplaced: LoadResult['unplaced']
  totalWeight: number
}

/** Prefer more cargo placed, then shorter floor length, then more stacking. */
function pickBetterDeck(a: DeckPack, b: DeckPack): DeckPack {
  const score = (p: DeckPack) => {
    const extent = p.placed.length
      ? Math.max(...p.placed.map((box) => box.x + box.lengthMm))
      : 0
    const stacked = p.placed.filter((box) => box.z > 0.5).length
    const vol =
      p.placed.reduce(
        (s, box) => s + box.lengthMm * box.widthMm * box.heightMm,
        0,
      ) / 1e9
    // Higher is better: placed count dominates, then volume, then stacks, then shorter extent
    return (
      p.placed.length * 1e12 -
      p.unplaced.length * 1e11 +
      vol * 1e6 +
      stacked * 1e3 -
      extent
    )
  }
  return score(b) > score(a) ? b : a
}

function packSingleDeck(
  items: CargoItem[],
  equipment: Equipment,
  options: PackingOptions,
): DeckPack {
  // Non-stack: tight guillotine rows (best LDM for uniform cargo).
  if (!options.allowStacking) {
    return packGuillotineShelves(items, equipment, false)
  }
  // Stack: try shelf rows AND free-rect nesting — keep the denser result.
  // (MaxRects alone regressed rotation/stacking on mixed packing lists.)
  const shelf = packGuillotineShelves(items, equipment, true)
  const free = packMaxRectsFloor(items, equipment, true)
  return pickBetterDeck(shelf, free)
}

/** Furthest X extent per section summed (gap is not loadable). */
function extentFloorAcrossSections(
  placed: PlacedBox[],
  equipment: Equipment,
): number {
  const sections = getEquipmentSections(equipment)
  if (sections.length <= 1) {
    return placed.length
      ? Math.max(...placed.map((p) => p.x + p.lengthMm))
      : 0
  }
  let sum = 0
  for (let i = 0; i < sections.length; i++) {
    const origin = sectionOriginMm(equipment, i)
    const end = origin + sections[i].lengthMm
    const inSection = placed.filter(
      (p) => p.x >= origin - 0.5 && p.x + p.lengthMm <= end + 0.5,
    )
    if (inSection.length) {
      sum += Math.max(...inSection.map((p) => p.x + p.lengthMm - origin))
    }
  }
  return sum
}

/** Length of merged Y-intervals (mm). */
function unionIntervalLength(intervals: [number, number][]): number {
  if (!intervals.length) return 0
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let total = 0
  let curS = sorted[0]![0]
  let curE = sorted[0]![1]
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]!
    if (s <= curE) {
      curE = Math.max(curE, e)
    } else {
      total += curE - curS
      curS = s
      curE = e
    }
  }
  total += curE - curS
  return total
}

/**
 * Union of floor footprints (mm²). Stacked items share the same footprint;
 * side-by-side items only add the uncovered width.
 */
export function floorFootprintUnionMm2(placed: PlacedBox[]): number {
  if (!placed.length) return 0
  const xs = new Set<number>()
  for (const p of placed) {
    xs.add(p.x)
    xs.add(p.x + p.lengthMm)
  }
  const sorted = [...xs].sort((a, b) => a - b)
  let area = 0
  for (let i = 0; i < sorted.length - 1; i++) {
    const x0 = sorted[i]!
    const x1 = sorted[i + 1]!
    const dx = x1 - x0
    if (dx <= 0) continue
    const intervals: [number, number][] = []
    for (const p of placed) {
      if (p.x < x1 - 0.5 && p.x + p.lengthMm > x0 + 0.5) {
        intervals.push([p.y, p.y + p.widthMm])
      }
    }
    area += dx * unionIntervalLength(intervals)
  }
  return area
}

/**
 * Reel LDM from occupied floor: footprint area / deck width.
 * A narrow item along one side only counts its share of the width.
 */
export function occupancyLoadingMeters(
  placed: PlacedBox[],
  widthMm: number,
): number {
  if (!placed.length || widthMm <= 0) return 0
  return floorFootprintUnionMm2(placed) / widthMm / 1000
}

function finalizeLoadResult(
  placed: PlacedBox[],
  unplaced: LoadResult['unplaced'],
  equipment: Equipment,
  totalWeight: number,
  allowAxleBalance: boolean,
): LoadResult {
  const usedVolumeM3 =
    placed.reduce((s, p) => s + p.lengthMm * p.widthMm * p.heightMm, 0) / 1e9
  const totalVolumeM3 = equipmentVolumeM3(equipment)
  const deckMm = equipmentDeckLengthMm(equipment)
  const extentMm = extentFloorAcrossSections(placed, equipment)
  const extentM = extentMm / 1000
  const trailerM = deckMm / 1000
  const weightRatio =
    equipment.maxWeightKg > 0 ? totalWeight / equipment.maxWeightKg : 0
  const weightLoadingMeters = weightRatio * trailerM

  // Chargeable LDM = packed floor length (after width-optimised placement).
  let loadingMeters = Math.max(extentM, weightLoadingMeters)
  if (weightRatio >= 0.9) {
    loadingMeters = trailerM
  }
  loadingMeters = Math.min(trailerM, loadingMeters)

  const chargeableExtentMm = Math.round(loadingMeters * 1000)
  const balanced =
    allowAxleBalance &&
    weightLoadingMeters > extentM + 0.05 &&
    chargeableExtentMm > extentMm + 50
      ? redistributeForAxleBalance(placed, Math.min(chargeableExtentMm, deckMm))
      : placed

  const floorLengthMm = balanced.length
    ? Math.max(...balanced.map((p) => p.x + p.lengthMm))
    : 0
  const physicalLoadingMeters =
    balanced !== placed
      ? extentFloorAcrossSections(balanced, equipment) / 1000
      : extentM

  const floorPercent = deckMm > 0 ? (loadingMeters / trailerM) * 100 : 0

  return {
    placed: balanced,
    unplaced,
    usedVolumeM3,
    totalVolumeM3,
    fillPercent: totalVolumeM3 > 0 ? (usedVolumeM3 / totalVolumeM3) * 100 : 0,
    totalWeightKg: totalWeight,
    maxWeightKg: equipment.maxWeightKg,
    weightPercent: weightRatio * 100,
    floorLengthMm,
    equipmentLengthMm: deckMm,
    loadingMeters,
    physicalLoadingMeters,
    weightLoadingMeters,
    floorPercent,
  }
}

/**
 * Extreme-point packer for truck loading.
 * Split equipment (modulvogntog) fills forvogn first, then trailer —
 * cargo never spans the coupling gap.
 */
export function packLoad(
  items: CargoItem[],
  equipment: Equipment,
  options: PackingOptions = { allowStacking: true },
): LoadResult {
  const sections = getEquipmentSections(equipment)

  if (sections.length <= 1) {
    const { placed, unplaced, totalWeight } = packSingleDeck(
      items,
      equipment,
      options,
    )
    return finalizeLoadResult(
      placed,
      unplaced,
      equipment,
      totalWeight,
      true,
    )
  }

  // Fill each lad in order; leftover goes to the next section.
  let remaining = expandToPieces(items)
  const allPlaced: PlacedBox[] = []
  let usedWeight = 0

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si]
    const weightLeft = equipment.maxWeightKg - usedWeight
    if (!remaining.length || weightLeft <= 0) break

    const sectionEq: Equipment = {
      id: section.id,
      name: section.name,
      category: equipment.category,
      lengthMm: section.lengthMm,
      widthMm: section.widthMm,
      heightMm: section.heightMm,
      maxWeightKg: weightLeft,
    }

    const cargo = piecesToCargoItems(remaining)
    const deck = packSingleDeck(cargo, sectionEq, options)
    const { leftover } = splitPlacedPieces(remaining, {
      placed: deck.placed,
      unplaced: deck.unplaced,
      usedVolumeM3: 0,
      totalVolumeM3: 0,
      fillPercent: 0,
      totalWeightKg: deck.totalWeight,
      maxWeightKg: weightLeft,
      weightPercent: 0,
      floorLengthMm: 0,
      equipmentLengthMm: section.lengthMm,
      loadingMeters: 0,
      physicalLoadingMeters: 0,
      weightLoadingMeters: 0,
      floorPercent: 0,
    })

    const origin = sectionOriginMm(equipment, si)
    for (const box of deck.placed) {
      allPlaced.push({
        ...box,
        x: box.x + origin,
        sectionId: section.id,
      })
    }
    usedWeight += deck.totalWeight
    remaining = leftover
  }

  const unplaced: LoadResult['unplaced'] = remaining.map((p) => ({
    cargoId: p.cargoId,
    name: `${p.name} #${p.itemIndex}`,
    reason:
      usedWeight >= equipment.maxWeightKg - 1e-6
        ? 'Vægtgrænse overskredet'
        : 'Ikke plads i forvogn/trailer',
  }))

  return finalizeLoadResult(
    allPlaced,
    unplaced,
    equipment,
    usedWeight,
    false,
  )
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

/**
 * Split remaining pieces into what packLoad placed vs left unplaced
 * (matched by cargoId counts — order within each id follows remaining).
 */
function splitPlacedPieces(
  remaining: Piece[],
  result: LoadResult,
): { placed: Piece[]; leftover: Piece[] } {
  const placedCount = new Map<string, number>()
  for (const p of result.placed) {
    placedCount.set(p.cargoId, (placedCount.get(p.cargoId) ?? 0) + 1)
  }
  const used = new Map<string, number>()
  const placed: Piece[] = []
  const leftover: Piece[] = []
  for (const piece of remaining) {
    const need = placedCount.get(piece.cargoId) ?? 0
    const have = used.get(piece.cargoId) ?? 0
    if (have < need) {
      placed.push(piece)
      used.set(piece.cargoId, have + 1)
    } else {
      leftover.push(piece)
    }
  }
  return { placed, leftover }
}

/**
 * Plan one or more vehicles when weight/space requires it.
 * Fills Bil 1 as full as possible, then Bil 2 with overflow, etc.
 * (Does NOT balance weight evenly across trucks.)
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

  const heaviest = Math.max(...pieces.map((p) => p.weightKg))
  if (heaviest > equipment.maxWeightKg + 1e-6) {
    const fail = packLoad(items, equipment, options)
    return {
      vehicleCount: 1,
      splitReason: `Enkelt colli overskrider max vægt (${equipment.maxWeightKg.toLocaleString('da-DK')} kg)`,
      totalWeightKg,
      vehicles: [{ index: 1, label: 'Bil 1', items, result: fail }],
    }
  }

  const vehicles: VehicleLoad[] = []
  let remaining = pieces
  const maxVehicles = Math.min(pieces.length, 12)

  while (remaining.length > 0 && vehicles.length < maxVehicles) {
    const probeItems = piecesToCargoItems(remaining)
    const probe = packLoad(probeItems, equipment, options)
    const { placed, leftover } = splitPlacedPieces(remaining, probe)

    if (placed.length === 0) {
      // Nothing fits in a fresh truck — stop with leftovers marked unplaced
      vehicles.push({
        index: vehicles.length + 1,
        label: `Bil ${vehicles.length + 1}`,
        items: probeItems,
        result: probe,
      })
      break
    }

    // Re-pack only what belongs on this truck so stats/unplaced stay clean
    const truckItems = piecesToCargoItems(placed)
    const truckResult = packLoad(truckItems, equipment, options)
    vehicles.push({
      index: vehicles.length + 1,
      label: `Bil ${vehicles.length + 1}`,
      items: truckItems,
      result: truckResult,
    })

    if (leftover.length === 0) break
    remaining = leftover
  }

  const n = vehicles.length
  const splitReason =
    n > 1
      ? totalWeightKg > equipment.maxWeightKg
        ? `Samlet vægt ${Math.round(totalWeightKg).toLocaleString('da-DK')} kg overskrider max ${equipment.maxWeightKg.toLocaleString('da-DK')} kg pr. bil — Bil 1 fyldt først, rest på flere biler`
        : `Kræver ${n} biler for plads (non-stack / mål) — Bil 1 fyldt først`
      : null

  return {
    vehicleCount: n,
    splitReason,
    totalWeightKg,
    vehicles,
  }
}
