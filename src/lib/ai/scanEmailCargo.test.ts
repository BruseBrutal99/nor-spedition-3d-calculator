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

  it('parses Danish TMS L(m) B(m) H(m) with Koli quantity', () => {
    const drafts = scanEmailCargoLocal(`
Pos  Koli  Koli type  L(m)  B(m)  H(m)  Vægt (kg)
1    2     EUR        1,20  0,80  1,00  450
2    1     Palle      2,40  1,20  1,50  800
3    3     Kasse      0,60  0,40  0,40  25
`)
    const totalQty = drafts.reduce((s, d) => s + d.quantity, 0)
    expect(totalQty).toBe(6)

    const eur = drafts.find((d) => d.lengthMm === 1200 && d.widthMm === 800)
    expect(eur).toBeTruthy()
    expect(eur!.heightMm).toBe(1000)
    expect(eur!.weightKg).toBe(450)
    expect(eur!.quantity).toBe(2)

    const palle = drafts.find((d) => d.lengthMm === 2400 && d.widthMm === 1200)
    expect(palle).toBeTruthy()
    expect(palle!.heightMm).toBe(1500)
    expect(palle!.weightKg).toBe(800)
  })

  it('parses spoken Danish: 4x paller, 300cm x 95cm x 150 cm', () => {
    const drafts = scanEmailCargoLocal(`
4x paller, 300cm x 95cm x 150 cm
4x paller, 120cm x 80cm x 150cm
`)
    expect(drafts).toHaveLength(2)

    const long = drafts.find((d) => d.lengthMm === 3000 && d.widthMm === 950)
    expect(long).toBeTruthy()
    expect(long!.heightMm).toBe(1500)
    expect(long!.quantity).toBe(4)

    const eur = drafts.find((d) => d.lengthMm === 1200 && d.widthMm === 800)
    expect(eur).toBeTruthy()
    expect(eur!.heightMm).toBe(1500)
    expect(eur!.quantity).toBe(4)
  })

  it('parses short form: 4 pall, 300cm x 95cm x 150 cm', () => {
    const drafts = scanEmailCargoLocal(`
4 pall, 300cm x 95cm x 150 cm
4 pall 120cm x 80cm x 150cm
`)
    expect(drafts.reduce((s, d) => s + d.quantity, 0)).toBe(8)
    expect(drafts.some((d) => d.lengthMm === 3000 && d.widthMm === 950)).toBe(
      true,
    )
    expect(drafts.some((d) => d.lengthMm === 1200 && d.widthMm === 800)).toBe(
      true,
    )
  })

  it('parses Danish ordre lines with EU thousands as line totals', () => {
    const drafts = scanEmailCargoLocal(`
Ordre 5222571
3x 120 x 80 x 105 cm – 1.057 kg
3x 235 x 80 x 70 cm – 972 kg
10x 120 x 80 x 140 cm – 4.608 kg
Total
Antal colli 58
Total CBM 61,36 m³
Total bruttovægt 19.129 kg
`)
    const totalQty = drafts.reduce((s, d) => s + d.quantity, 0)
    expect(totalQty).toBe(16)

    const eur = drafts.find(
      (d) =>
        d.lengthMm === 1200 &&
        d.widthMm === 800 &&
        d.heightMm === 1050 &&
        d.quantity === 3,
    )
    expect(eur).toBeTruthy()
    // 1.057 kg line total → ~352.3 kg each
    expect(eur!.weightKg).toBeCloseTo(1057 / 3, 0)

    const ten = drafts.find(
      (d) =>
        d.lengthMm === 1200 &&
        d.widthMm === 800 &&
        d.heightMm === 1400 &&
        d.quantity === 10,
    )
    expect(ten).toBeTruthy()
    expect(ten!.weightKg).toBeCloseTo(4608 / 10, 0)

    const totalKg = drafts.reduce((s, d) => s + d.weightKg * d.quantity, 0)
    expect(totalKg).toBeCloseTo(1057 + 972 + 4608, 0)
  })

  it('parses English high x wide x long (meters) with total kgs', () => {
    const drafts = scanEmailCargoLocal(`
10.079,00 kgs
1 pallet: 1.40m high x 1.20m wide x 1.65m long
2 pallets: 0.85m high x 1.20m wide x 1.65m long
2 pallets: 1.20m high x 1.20m wide x 1.65m long
1 pallet: 0.80m high x 1.20m wide x 1.65m long
1 pallet: 1.12m high x 1.15m wide x 1.65m long
2 pallets: 1.10m high x 1.15m wide x 1.65m long
2 pallets: 1.15m high x 1.00m wide x 1.65m long
1 pallet: 0.75m high x 1.15m wide x 1.65m long
1 pallet: 1.15m high x 1.15m wide x 1.65m long
4 pallets: 1.15m high x 1.20m wide x 1.65m long
1 pallet: 1.35m high x 1.00m wide x 1.65m long
1 pallet: 0.85m high x 1.00m wide x 1.65m long
1 pallet: 0.80m high x 1.00m wide x 1.65m long
2 pallets: 1.10m high x 1.20m wide x 1.65m long
1 pallet: 0.75m high x 1.00m wide x 1.65m long
`)
    const totalQty = drafts.reduce((s, d) => s + d.quantity, 0)
    expect(totalQty).toBe(23)

    const first = drafts.find(
      (d) =>
        d.lengthMm === 1650 &&
        d.widthMm === 1200 &&
        d.heightMm === 1400 &&
        d.quantity === 1,
    )
    expect(first).toBeTruthy()

    const four = drafts.find(
      (d) =>
        d.lengthMm === 1650 &&
        d.widthMm === 1200 &&
        d.heightMm === 1150 &&
        d.quantity === 4,
    )
    expect(four).toBeTruthy()

    const totalKg = drafts.reduce((s, d) => s + d.weightKg * d.quantity, 0)
    expect(totalKg).toBeGreaterThan(10000)
    expect(totalKg).toBeLessThan(10200)
  })
})
