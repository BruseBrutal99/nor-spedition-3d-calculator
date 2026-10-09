import { packLoad } from '../src/lib/packer.ts'
import { EQUIPMENT_PRESETS } from '../src/data/equipment.ts'
import {
  scanEmailCargoLocal,
  draftsToCargoItems,
} from '../src/lib/ai/scanEmailCargo.ts'

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

const items = draftsToCargoItems(scanEmailCargoLocal(text))
const eq = EQUIPMENT_PRESETS[1]
const r = packLoad(items, eq, { allowStacking: true })
const stacked = r.placed.filter((p) => p.z > 0.5)
const maxX = Math.max(...r.placed.map((p) => p.x + p.lengthMm))
console.log(
  JSON.stringify(
    {
      placed: r.placed.length,
      unplaced: r.unplaced.length,
      stacked: stacked.length,
      stackedDetail: stacked.map((p) => ({
        name: p.name,
        z: Math.round(p.z),
        h: p.heightMm,
        on: r.placed
          .filter(
            (b) =>
              Math.abs(b.z + b.heightMm - p.z) < 1 &&
              !(
                p.x + p.lengthMm <= b.x ||
                b.x + b.lengthMm <= p.x ||
                p.y + p.widthMm <= b.y ||
                b.y + b.widthMm <= p.y
              ),
          )
          .map((b) => b.name),
      })),
      maxXcm: Math.round(maxX / 10),
      fill: +r.fillPercent.toFixed(1),
    },
    null,
    2,
  ),
)
