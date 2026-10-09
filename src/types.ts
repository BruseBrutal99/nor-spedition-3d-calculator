/** Dimensions in millimeters, weight in kilograms */

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
}

export type Equipment = {
  id: string
  name: string
  category: 'truck' | 'trailer' | 'container'
  lengthMm: number
  widthMm: number
  heightMm: number
  maxWeightKg: number
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
  /** Dense physical floor length used (cab → door), mm */
  floorLengthMm: number
  /** Equipment internal length, mm */
  equipmentLengthMm: number
  /**
   * Chargeable LDM (ladmeter) — max of physical floor and weight-based LDM.
   * Near/full weight capacity ⇒ full trailer LDM.
   */
  loadingMeters: number
  /** Physical floor only, meters */
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
