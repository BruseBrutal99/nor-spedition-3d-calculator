import { scanEmailCargoLocal } from '../src/lib/ai/scanEmailCargo.ts'

const t = `Hub sektion: 2 units
Each unit: 1550 x 1720 x 860 mm (LWH) / 7200kg

Propel: 20 units
Each unit: 1200 x 500 x 2000 mm (LWH) / 1500kg each
Det hele er non stack`

const d = scanEmailCargoLocal(t)
console.log(
  d.map((x) => ({
    n: x.name,
    q: x.quantity,
    w: x.weightKg,
    s: x.stackable,
    L: x.lengthMm,
    W: x.widthMm,
    H: x.heightMm,
  })),
)
