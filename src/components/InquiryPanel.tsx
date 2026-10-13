import { useState, type FormEvent } from 'react'
import { NOR_BRAND } from '../data/brand'
import { formatLadmeter } from '../lib/packer'
import { downloadLoadPlanPdf } from '../lib/pdf/loadPlanPdf'
import type { CargoItem, Equipment, FleetPlan, LoadResult } from '../types'

type Props = {
  equipment: Equipment
  result: LoadResult | null
  items: CargoItem[]
  fleet: FleetPlan | null
}

type InquiryForm = {
  company: string
  contactName: string
  email: string
  phone: string
  pickupAddress: string
  pickupZipCity: string
  pickupCountry: string
  deliveryAddress: string
  deliveryZipCity: string
  deliveryCountry: string
  readyDate: string
  notes: string
}

const emptyForm = (): InquiryForm => ({
  company: '',
  contactName: '',
  email: '',
  phone: '',
  pickupAddress: '',
  pickupZipCity: '',
  pickupCountry: 'Danmark',
  deliveryAddress: '',
  deliveryZipCity: '',
  deliveryCountry: 'Danmark',
  readyDate: '',
  notes: '',
})

function mmToCm(mm: number): number {
  return Math.round((mm / 10) * 10) / 10
}

function shapeLabel(item: CargoItem): string {
  if (item.shape === 'pipe') return 'pipe'
  if (item.shape === 'barrel') return 'tønde'
  return 'kasse'
}

function buildCargoSummary(items: CargoItem[]): string {
  return items
    .map((it, i) => {
      const dims =
        it.shape === 'pipe'
          ? `L ${mmToCm(it.lengthMm)} cm × Ø ${mmToCm(it.widthMm)} cm`
          : it.shape === 'barrel'
            ? `Ø ${mmToCm(it.widthMm)} cm × H ${mmToCm(it.heightMm)} cm`
            : `${mmToCm(it.lengthMm)}×${mmToCm(it.widthMm)}×${mmToCm(it.heightMm)} cm`
      const stack = it.stackable ? 'stack OK' : 'non-stack'
      const arr =
        it.shape && it.shape !== 'box' && it.arrangement
          ? `, ${it.arrangement}`
          : ''
      return `${i + 1}. ${it.name} (${shapeLabel(it)}) · ${dims} · ${it.quantity} stk · ${it.weightKg} kg · ${stack}${arr}`
    })
    .join('\n')
}

function buildPlanSummary(fleet: FleetPlan | null, result: LoadResult | null): string {
  if (fleet && fleet.vehicles.length) {
    const lines = fleet.vehicles.map((v) => {
      const r = v.result
      return `${v.label}: ${formatLadmeter(r.loadingMeters)}, ${Math.round(r.totalWeightKg)} kg, ${r.placed.length} colli`
    })
    return [
      `Antal biler: ${fleet.vehicleCount}`,
      `Samlet vægt: ${Math.round(fleet.totalWeightKg)} kg`,
      ...lines,
    ].join('\n')
  }
  if (result) {
    return `LDM: ${formatLadmeter(result.loadingMeters)}, vægt: ${Math.round(result.totalWeightKg)} kg`
  }
  return 'Ingen lastplan beregnet'
}

export function InquiryPanel({
  equipment,
  result,
  items,
  fleet,
}: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<InquiryForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ready = Boolean(
    (fleet && fleet.vehicles.some((v) => v.result.placed.length > 0)) ||
      (result && result.placed.length > 0),
  )

  const patch = (p: Partial<InquiryForm>) => setForm((f) => ({ ...f, ...p }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready || !result) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const route = `${form.pickupZipCity || form.pickupAddress} → ${form.deliveryZipCity || form.deliveryAddress}`
      await downloadLoadPlanPdf({
        equipment,
        result,
        kind: 'overview',
        items,
        fleet,
        customer: form.company || form.contactName,
        route,
        reference: form.company
          ? `Forespørgsel ${form.company}`
          : 'Kunde-forespørgsel',
        loadDate: form.readyDate || undefined,
      })

      const body = [
        'Hej NOR Spedition',
        '',
        'Jeg har brugt 3D Load Calculator og ønsker et tilbud / booking.',
        '',
        '— Kontakt —',
        `Firma: ${form.company || '—'}`,
        `Navn: ${form.contactName}`,
        `E-mail: ${form.email}`,
        `Telefon: ${form.phone || '—'}`,
        '',
        '— Afhentning —',
        form.pickupAddress,
        `${form.pickupZipCity}, ${form.pickupCountry}`,
        '',
        '— Levering —',
        form.deliveryAddress,
        `${form.deliveryZipCity}, ${form.deliveryCountry}`,
        '',
        `Klar dato: ${form.readyDate || '—'}`,
        `Udstyr: ${equipment.name}`,
        '',
        '— Lastplan —',
        buildPlanSummary(fleet, result),
        '',
        '— Gods —',
        buildCargoSummary(items),
        '',
        form.notes ? `Bemærkninger:\n${form.notes}\n` : '',
        'Lasteplanen er åbnet/downloadet i browseren — vedhæft gerne PDF/print til denne mail.',
        '',
        'Venlig hilsen',
        form.contactName,
      ]
        .filter((line) => line !== undefined)
        .join('\n')

      const mailto =
        `mailto:${NOR_BRAND.contactEmail}` +
        `?subject=${encodeURIComponent(
          `Forespørgsel lastplan – ${form.company || form.contactName}`,
        )}` +
        `&body=${encodeURIComponent(body)}`

      window.location.href = mailto
      setStatus(
        'Lasteplan åbnet. Mail til contact@norspedition.dk er klar — vedhæft lasteplanen før du sender.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke sende forespørgsel')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Send forespørgsel</h2>
      </div>

      {!ready ? (
        <p className="muted">
          Beregn lastplan først — så kan du sende gods + lasteplan til NOR
          Spedition.
        </p>
      ) : !open ? (
        <div className="inquiry-intro">
          <p className="muted">
            Klar til tilbud? Udfyld adresser og send forespørgslen til{' '}
            {NOR_BRAND.contactEmail}. Lasteplanen følger med.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setOpen(true)}
          >
            Start forespørgsel
          </button>
        </div>
      ) : (
        <form className="inquiry-form" onSubmit={(e) => void submit(e)}>
          <p className="muted scanner-hint">
            Felter markeret * er påkrævet. Lasteplan åbnes automatisk, så du kan
            vedhæfte den i mailen.
          </p>

          <fieldset className="inquiry-fieldset">
            <legend>Kontakt</legend>
            <div className="manual-entry-grid">
              <label>
                <span>Firma</span>
                <input
                  className="input"
                  value={form.company}
                  onChange={(e) => patch({ company: e.target.value })}
                />
              </label>
              <label>
                <span>Navn *</span>
                <input
                  className="input"
                  required
                  value={form.contactName}
                  onChange={(e) => patch({ contactName: e.target.value })}
                />
              </label>
              <label>
                <span>E-mail *</span>
                <input
                  className="input"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => patch({ email: e.target.value })}
                />
              </label>
              <label>
                <span>Telefon</span>
                <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="inquiry-fieldset">
            <legend>Afhentning</legend>
            <label>
              <span>Adresse *</span>
              <input
                className="input"
                required
                value={form.pickupAddress}
                onChange={(e) => patch({ pickupAddress: e.target.value })}
              />
            </label>
            <div className="manual-entry-grid">
              <label>
                <span>Postnr. & by *</span>
                <input
                  className="input"
                  required
                  value={form.pickupZipCity}
                  onChange={(e) => patch({ pickupZipCity: e.target.value })}
                />
              </label>
              <label>
                <span>Land</span>
                <input
                  className="input"
                  value={form.pickupCountry}
                  onChange={(e) => patch({ pickupCountry: e.target.value })}
                />
              </label>
              <label>
                <span>Klar dato</span>
                <input
                  className="input"
                  type="date"
                  value={form.readyDate}
                  onChange={(e) => patch({ readyDate: e.target.value })}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="inquiry-fieldset">
            <legend>Levering</legend>
            <label>
              <span>Adresse *</span>
              <input
                className="input"
                required
                value={form.deliveryAddress}
                onChange={(e) => patch({ deliveryAddress: e.target.value })}
              />
            </label>
            <div className="manual-entry-grid">
              <label>
                <span>Postnr. & by *</span>
                <input
                  className="input"
                  required
                  value={form.deliveryZipCity}
                  onChange={(e) => patch({ deliveryZipCity: e.target.value })}
                />
              </label>
              <label>
                <span>Land</span>
                <input
                  className="input"
                  value={form.deliveryCountry}
                  onChange={(e) => patch({ deliveryCountry: e.target.value })}
                />
              </label>
            </div>
          </fieldset>

          <label>
            <span>Bemærkninger</span>
            <textarea
              className="input"
              rows={3}
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Særlige krav, tider, referencer…"
            />
          </label>

          <div className="inquiry-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Annuller
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
            >
              {busy ? 'Forbereder…' : 'Send til NOR Spedition'}
            </button>
          </div>
        </form>
      )}

      {status && <p className="scanner-mode">{status}</p>}
      {error && <p className="export-error">{error}</p>}
    </section>
  )
}
