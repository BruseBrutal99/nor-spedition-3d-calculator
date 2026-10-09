import type { Equipment } from '../types'
import { NOR_CARGO_COLORS } from './brand'

/** Common European freight equipment — internal loading dimensions */
export const EQUIPMENT_PRESETS: Equipment[] = [
  {
    id: 'truck-12m',
    name: 'Lastbil 12 m (solo)',
    category: 'truck',
    lengthMm: 12000,
    widthMm: 2450,
    heightMm: 2700,
    maxWeightKg: 10000,
  },
  {
    id: 'trailer-13.6',
    name: 'Sættevogn 13,6 m',
    category: 'trailer',
    lengthMm: 13600,
    widthMm: 2450,
    heightMm: 2700,
    maxWeightKg: 24000,
  },
  {
    id: 'trailer-13.6-240-265',
    name: 'Sættevogn 13,6 m (240×265 cm)',
    category: 'trailer',
    lengthMm: 13600,
    widthMm: 2400,
    heightMm: 2650,
    maxWeightKg: 24000,
  },
  {
    id: 'trailer-13.6-mega',
    name: 'Mega-trailer 13,6 m',
    category: 'trailer',
    lengthMm: 13600,
    widthMm: 2450,
    heightMm: 3000,
    maxWeightKg: 24000,
  },
  {
    id: 'container-20',
    name: 'Container 20\'',
    category: 'container',
    lengthMm: 5898,
    widthMm: 2352,
    heightMm: 2393,
    maxWeightKg: 28200,
  },
  {
    id: 'container-40',
    name: 'Container 40\'',
    category: 'container',
    lengthMm: 12032,
    widthMm: 2352,
    heightMm: 2393,
    maxWeightKg: 26700,
  },
  {
    id: 'container-40hc',
    name: 'Container 40\' High Cube',
    category: 'container',
    lengthMm: 12032,
    widthMm: 2352,
    heightMm: 2698,
    maxWeightKg: 26480,
  },
]

export const CARGO_COLORS = NOR_CARGO_COLORS
