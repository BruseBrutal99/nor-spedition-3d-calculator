import { scanEmailCargoLocal } from '../src/lib/ai/scanEmailCargo.ts'

const text = `Hub sektion: 2 units
Each unit: 1550 x 1720 x 860 mm (LWH) / 7200kg

Propel: 20 units
Each unit: 1425 x 1100 x 600 mm (LWH) / 1500kg each`

const drafts = scanEmailCargoLocal(text)
console.log(JSON.stringify(drafts, null, 2))
console.log(
  'ok',
  drafts.length === 2 &&
    drafts[0]?.name === 'Hub sektion' &&
    drafts[0]?.quantity === 2 &&
    drafts[0]?.lengthMm === 1550 &&
    drafts[0]?.widthMm === 1720 &&
    drafts[0]?.heightMm === 860 &&
    drafts[0]?.weightKg === 7200 &&
    drafts[1]?.name === 'Propel' &&
    drafts[1]?.quantity === 20 &&
    drafts[1]?.lengthMm === 1425 &&
    drafts[1]?.weightKg === 1500,
)
