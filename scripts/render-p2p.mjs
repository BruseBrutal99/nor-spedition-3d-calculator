import fs from 'fs'
import path from 'path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'

const outDir =
  'C:/Users/Mathias Kristensen/Projects/nor-spedition-3d-calculator/tmp-p2p'
fs.mkdirSync(outDir, { recursive: true })

async function renderPdf(pdfPath, prefix) {
  const data = new Uint8Array(fs.readFileSync(pdfPath))
  const doc = await getDocument({ data }).promise
  console.log(prefix, 'pages', doc.numPages)
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    const file = path.join(outDir, `${prefix}-p${i}.png`)
    fs.writeFileSync(file, canvas.toBuffer('image/png'))
    console.log('wrote', file)
  }
}

await renderPdf(
  'C:/Users/Mathias Kristensen/Downloads/Packaging Report - 5683 Haarby  Schiphol  06OCT ALL.pdf',
  'haarby',
)
await renderPdf(
  'C:/Users/Mathias Kristensen/Downloads/Packaging Report - TVS foresprgsel 5 forsendelser  Nord  LOT 3.pdf',
  'tvs',
)
