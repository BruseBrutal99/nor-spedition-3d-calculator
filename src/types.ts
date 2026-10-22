/** Dimensions in millimeters, weight in kilograms */

/** Colli geometry for manual entry / 3D preview */
export type CargoShape = 'box' | 'pipe' | 'barrel'

/** How multiple units of the same line are laid on the trailer floor */
export type CargoArrangement = 'linear' | 'grid' | 'nested'

export type CargoItem = {
  id: string
  name: string
  lengthMm: number
  widthMm: number
  heightMm: number
  weightKg: number
  quantity: number
  /** Allow 90° rotation on the floor plane (L↔W) */
  allowRotation: boolean
  /** Allow stacking other items on top */
  stackable: boolean
  color: string
  /** Default box — pipe/barrel use diameter in width/height */
  shape?: CargoShape
  /** Floor arrangement preference (pipes/tønder) */
  arrangement?: CargoArrangement
}

/** One separate deck on split equipment (e.g. forvogn + trailer) */
export type EquipmentSection = {
  id: string
  name: string
  lengthMm: number
  widthMm: number
  heightMm: number
}

export type Equipment = {
  id: string
  name: string
  category: 'truck' | 'trailer' | 'container'
  /** Total usable deck length (sum of sections when split) */
  lengthMm: number
  widthMm: number
  heightMm: number
  maxWeightKg: number
  /**
   * Separate lad that cannot be spanned by cargo.
   * When set, packer fills each section in order (e.g. forvogn → trailer).
   */
  sections?: EquipmentSection[]
  /** Visual gap between sections in 3D/PDF (mm). Default 1800. */
  sectionGapMm?: number
}

export type PlacedBox = {
  cargoId: string
  name: string
  /**
   * Position of box corner in mm.
   * Origin = floor, left side, FRONT/CAB end (inderst).
   * +X toward the door (bagerst) — load low X first.
   * +Y toward the right side.
   * +Z up.
   * For split equipment, X is world-space including gaps between sections.
   */
  x: number
  y: number
  z: number
  lengthMm: number
  widthMm: number
  heightMm: number
  weightKg: number
  color: string
  itemIndex: number
  /** Section id when packed on split equipment (modulvogntog) */
  sectionId?: string
}

export type LoadResult = {
  placed: PlacedBox[]
  unplaced: { cargoId: string; name: string; reason: string }[]
  usedVolumeM3: number
  totalVolumeM3: number
  fillPercent: number
  totalWeightKg: number
  maxWeightKg: number
  weightPercent: number
  /** Furthest floor extent cab → door (mm), not LDM */
  floorLengthMm: number
  /** Equipment internal length, mm */
  equipmentLengthMm: number
  /**
   * Chargeable LDM — packed floor length (cab → furthest colli), or weight LDM.
   * Packer fills width side-by-side before stretching length.
   * Near/full weight capacity ⇒ full trailer LDM.
   */
  loadingMeters: number
  /** Physical packed floor length, meters */
  physicalLoadingMeters: number
  /** Weight converted to LDM: (kg/maxKg) × trailer length */
  weightLoadingMeters: number
  /** loadingMeters / equipment length × 100 */
  floorPercent: number
}

export type PackingOptions = {
  allowStacking: boolean
}

/** One physical truck/trailer in a multi-vehicle plan */
export type VehicleLoad = {
  index: number
  label: string
  items: CargoItem[]
  result: LoadResult
}

/** Full plan when cargo needs one or more vehicles */
export type FleetPlan = {
  vehicleCount: number
  /** Why more than one vehicle was required */
  splitReason: string | null
  totalWeightKg: number
  vehicles: VehicleLoad[]
}
