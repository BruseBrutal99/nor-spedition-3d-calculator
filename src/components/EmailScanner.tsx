import { useState } from 'react'
import {
  draftsToCargoItems,
  scanEmailCargo,
  type ScannedCargoDraft,
} from '../lib/ai/scanEmailCargo'
import type { CargoItem } from '../types'

type Props = {
  onApply: (items: CargoItem[], mode: 'replace' | 'append') => void
}

const EXAMPLE = `Total Pieces  : 12
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

export function EmailScanner({ onApply }: Props) {
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<ScannedCargoDraft[] | null>(null)
  const [mode, setMode] = useState<'local' | 'openai' | 'anthropic' | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scan = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await scanEmailCargo(text)
      setDrafts(result.drafts)
      setMode(result.mode)
      if (!result.drafts.length) {
        setError(
          'Ingen dimensioner fundet. Prøv fx 1 pcs 150/90/173 cms, Each unit: 1550 x 1720 x 860 mm, eller L1200 B800 H1000.',
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scanning fejlede')
      setDrafts(null)
    } finally {
      setBusy(false)
    }
  }

  const apply = (how: 'replace' | 'append') => {
    if (!drafts?.length) return
    onApply(draftsToCargoItems(drafts), how)
    setDrafts(null)
    setText('')
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>AI-scanner</h2>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setText(EXAMPLE)}
        >
          Indsæt eksempel
        </button>
      </div>

      <p className="muted scanner-hint">
        Sæt mailtekst ind — scanneren læser mål, antal og vægt og opretter
        colli automatisk.
      </p>

      <textarea
        className="input scanner-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Indsæt mail med colli-mål her…"
        rows={7}
      />

      <div className="scanner-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !text.trim()}
          onClick={() => void scan()}
        >
          {busy ? 'Scanner…' : 'Scan mail'}
        </button>
      </div>

      {mode && drafts && drafts.length > 0 && (
        <p className="scanner-mode">
          Fundet {drafts.length} linjer via{' '}
          {mode === 'local'
            ? 'lokal AI-parser'
            : mode === 'openai'
              ? 'OpenAI'
              : 'Anthropic'}
        </p>
      )}

      {drafts && drafts.length > 0 && (
        <div className="scanner-preview">
          <table>
            <thead>
              <tr>
                <th>Navn</th>
                <th>L×B×H</th>
                <th>Antal</th>
                <th>kg</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d, i) => (
                <tr key={`${d.sourceLine}-${i}`}>
                  <td>{d.name}</td>
                  <td className="mono">
                    {d.lengthMm}×{d.widthMm}×{d.heightMm}
                  </td>
                  <td>{d.quantity}</td>
                  <td>{d.weightKg}</td>
                  <td>{Math.round(d.confidence * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="scanner-apply">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => apply('replace')}
            >
              Erstat gods
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => apply('append')}
            >
              Tilføj til liste
            </button>
          </div>
        </div>
      )}

      {error && <p className="export-error">{error}</p>}
    </section>
  )
}
