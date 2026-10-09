import type { CargoItem, Equipment, FleetPlan, LoadResult } from '../../types'
import { buildPlan, buildPlanFromSingle, type PlanMeta } from '../plan/buildPlan'
import { renderPlanDocument } from '../plan/renderHtml'
import type { Plan } from '../plan/types'

export type PdfPlanKind = 'overview' | 'detailed'

type PdfInput = {
  equipment: Equipment
  result: LoadResult
  kind: PdfPlanKind
  reference?: string
  customer?: string
  route?: string
  loadDate?: string
  items?: CargoItem[]
  fleet?: FleetPlan | null
}

function metaFromInput(input: PdfInput): PlanMeta {
  return {
    ref: input.reference,
    customer: input.customer,
    route: input.route,
    loadDate: input.loadDate,
  }
}

export function buildLoadPlan(input: PdfInput): Plan {
  if (input.fleet && input.fleet.vehicles.length > 0) {
    return buildPlan(input.fleet, input.equipment, metaFromInput(input))
  }
  return buildPlanFromSingle(
    input.equipment,
    input.result.placed,
    input.items ?? [],
    metaFromInput(input),
  )
}

/**
 * Opens a print-ready A4 HTML lasteplan (SVG top/side views).
 * User chooses “Gem som PDF” in the print dialog — keeps drawings vector-sharp.
 */
export async function downloadLoadPlanPdf(input: PdfInput): Promise<void> {
  const plan = buildLoadPlan(input)
  if (!plan.units.length) {
    throw new Error('Ingen biler at eksportere')
  }

  const html = renderPlanDocument(plan)
  const w = window.open('', '_blank')
  if (!w) {
    // Popup blocked — fall back to downloadable HTML
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `NOR-Lasteplan-${plan.ref.replace(/[^\w.-]+/g, '_')}.html`
    a.click()
    URL.revokeObjectURL(url)
    return
  }

  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  // Let layout/SVG settle before print dialog
  w.setTimeout(() => {
    try {
      w.print()
    } catch {
      // user can use toolbar button
    }
  }, 350)
}
