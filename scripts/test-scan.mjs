import { scanEmailCargoLocal } from '../src/lib/ai/scanEmailCargo.ts'

const text = `Total Pieces  : 12
Total Gross Wt: 1,875.0 kg
Total Volume  : 19.364 cbm
Dimensions
1 pcs 150/90/173 cms
1 pcs 125/93/170 cms
1 pcs 120/80/209 cms
1 pcs 190/90/210 cms
1 pcs 120/100/97 cms
1 pcs 125/90/158 cms
1 pcs 120/80/117 cms
2 pcs 153/93/6 cms
1 pcs 133/80/93 cms
1 pcs 220/90/149 cms
1 pcs 80/200/80 cms`

const d = scanEmailCargoLocal(text)
console.log('lines', d.length)
console.log(
  'qty sum',
  d.reduce((s, x) => s + x.quantity, 0),
)
console.log(
  'weight sum',
  Math.round(d.reduce((s, x) => s + x.weightKg * x.quantity, 0)),
)
for (const x of d) {
  console.log(
    `${x.quantity}× ${x.lengthMm}×${x.widthMm}×${x.heightMm} mm · ${x.weightKg} kg`,
  )
}
