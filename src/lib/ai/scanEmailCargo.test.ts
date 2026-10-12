import { describe, expect, it } from 'vitest'
import { scanEmailCargoLocal } from './scanEmailCargo'

/** Customer packing list: Package | Gross | Net | Length | Wide | Height (cm) */
const PACKING_LIST = `
Package No.  Gross weight  Net. Weight  Length  Wide  Height
             kg            kg           cm      cm    cm
1            1190          1180         335     175   170
2            30            20           140     90    35
3            280           260          160     70    76
4            280           260          160     70    76
5            280           260          160     70    76
6            85            75           110     80    100
7            85            75           110     80    100
8            85            75           110     80    100
9            85            75           110     80    100
10           85            75           110     80    100
11           85            75           110     80    100
12           85            75           110     80    100
13           85            75           110     80    100
14           151           141          170     80    100
15           354           324          110     110   70
16           46            36           60      60    70
17           37            29           50      50    60
18           59            39           80      60    70
19           260           220          110     90    160
20           260           220          110     90    160
21           260           220          110     90    160
22           260           220          110     90    160
23           260           220          110     90    160
24           485           445          105     133   225
25           485           445          105     133   225
26
Total        7092          6534
`

describe('scanEmailCargoLocal packing list (Wide/cm)', () => {
  it('reads Length/Wide/Height in cm and gross weight', () => {
    const drafts = scanEmailCargoLocal(PACKING_LIST)
    const totalQty = drafts.reduce((s, d) => s + d.quantity, 0)
    expect(totalQty).toBe(25)

    const first = drafts.find((d) => d.lengthMm === 3350 && d.widthMm === 1750)
    expect(first).toBeTruthy()
    expect(first!.heightMm).toBe(1700)
    expect(first!.weightKg).toBe(1190)

    const trio = drafts.find(
      (d) =>
        d.lengthMm === 1600 &&
        d.widthMm === 700 &&
        d.heightMm === 760 &&
        d.weightKg === 280,
    )
    expect(trio).toBeTruthy()
    expect(trio!.quantity).toBe(3)

    const tall = drafts.find(
      (d) => d.lengthMm === 1050 && d.widthMm === 1330 && d.heightMm === 2250,
    )
    expect(tall).toBeTruthy()
    expect(tall!.weightKg).toBe(485)
    expect(tall!.quantity).toBe(2)
  })

  it('still parses classic unit blocks', () => {
    const drafts = scanEmailCargoLocal(`Hub sektion: 2 units
Each unit: 1550 x 1720 x 860 mm (LWH) / 7200kg`)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.lengthMm).toBe(1550)
    expect(drafts[0]!.quantity).toBe(2)
    expect(drafts[0]!.weightKg).toBe(7200)
  })

  it('parses pipe-separated packing rows', () => {
    const drafts = scanEmailCargoLocal(`
Package | Gross weight | Net. Weight | Length | Wide | Height
No. | kg | kg | cm | cm | cm
1 | 1190 | 1180 | 335 | 175 | 170
2 | 30 | 20 | 140 | 90 | 35
`)
    expect(drafts.reduce((s, d) => s + d.quantity, 0)).toBe(2)
    expect(drafts[0]!.lengthMm).toBe(3350)
    expect(drafts[0]!.widthMm).toBe(1750)
  })
})
