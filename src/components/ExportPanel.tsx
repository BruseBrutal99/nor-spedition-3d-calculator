import { useState } from 'react'
import type { CargoItem, Equipment, FleetPlan, LoadResult } from '../types'
import { downloadLoadPlanPdf } from '../lib/pdf/loadPlanPdf'

type Props = {
  equipment: Equipment
  result: LoadResult | null
  items: CargoItem[]
  fleet: FleetPlan | null
  reference?: string
}

export function ExportPanel({
  equipment,
  result,
  items,
  fleet,
  reference,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ready = Boolean(
    (fleet && fleet.vehicles.some((v) => v.result.placed.length > 0)) ||
      (result && result.placed.length > 0),
  )
  const truckNote =
    fleet && fleet.vehicleCount > 1
      ? `Én A4 pr. bil · ${fleet.vehicleCount} biler`
      : 'Én A4 · ovenfra + side · godsliste'

  const run = async (label: string, fn: () => Promise<void>) => {
    setError(null)
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export fejlede')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Download</h2>
      </div>

      {!ready ? (
        <p className="muted">Beregn en lastplan først for at udskrive.</p>
      ) : (
        <div className="export-grid">
          <button
            type="button"
            className="btn export-btn"
            disabled={Boolean(busy)}
            onClick={() =>
              run('pdf', () =>
                downloadLoadPlanPdf({
                  equipment,
                  result: result!,
                  kind: 'overview',
                  items,
                  reference,
                  fleet,
                }),
              )
            }
          >
            <strong>Lasteplan (A4)</strong>
            <span>{truckNote}</span>
          </button>
        </div>
      )}

      {busy && <p className="export-status">Åbner lasteplan…</p>}
      {error && <p className="export-error">{error}</p>}
    </section>
  )
}
