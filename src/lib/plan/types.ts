/** Load-plan data contract (cm, kg). Shared by analyse + HTML/PDF render. */

export type PlanCompany = {
  name: string
  system: string
  email: string
  phone?: string
}

export type CargoType = {
  name: string
  /** As placed (cm) */
  l: number
  w: number
  h: number
  kgEach: number
  color: string
  flags: string[]
  /** Original AWB dims before rotation (cm), if different */
  awb?: { l: number; w: number; h: number }
}

export type PlanItem = {
  /** Type key in unit.types */
  t: string
  /** Length from front/cab (cm) */
  x: number
  /** Width from left side (cm) */
  y: number
  /** Height from floor (cm) */
  z: number
  rot?: 0 | 90
}

export type PlanUnit = {
  index: number
  total: number
  name: string
  /** Interior L×W×H cm */
  L: number
  W: number
  H: number
  /** Max payload kg */
  payload: number
  types: Record<string, CargoType>
  /** Placements in loading order (front → doors) */
  items: PlanItem[]
}

export type Plan = {
  company: PlanCompany
  ref: string
  customer: string
  route: string
  loadDate: string
  created: string
  notes?: string[]
  units: PlanUnit[]
}

export type AnalysedItem = PlanItem & {
  n: number
  l: number
  w: number
  h: number
  kg: number
  T: CargoType
}

export type CogLevel = 'ok' | 'warn' | 'bad'

export type UnitAnalysis = {
  its: AnalysedItem[]
  kg: number
  vol: number
  usedLen: number
  cog: { x: number; y: number; z: number }
  wPct: number
  vPct: number
  ldmFloor: number
  ldmCharged: number
  weightLimited: boolean
  offX: number
  offY: number
  cogLevel: CogLevel
}
