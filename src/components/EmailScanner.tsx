import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import {
  draftsToCargoItems,
  prepareScanImage,
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
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ScannedCargoDraft[] | null>(null)
  const [mode, setMode] = useState<'local' | 'openai' | 'anthropic' | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addImage = useCallback(async (file: Blob) => {
    setError(null)
    try {
      const prepared = await prepareScanImage(file)
      setImageDataUrl(prepared.dataUrl)
      setDrafts(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke læse billedet')
    }
  }, [])

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) void addImage(file)
          return
        }
      }
    },
    [addImage],
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file?.type.startsWith('image/')) void addImage(file)
    },
    [addImage],
  )

  const canScan = Boolean(text.trim() || imageDataUrl)

  const scan = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await scanEmailCargo(text, {
        image: imageDataUrl ? { dataUrl: imageDataUrl } : null,
      })
      setDrafts(result.drafts)
      setMode(result.mode)
      if (!result.drafts.length) {
        setError(
          imageDataUrl
            ? 'Ingen colli fundet på skærmklippet. Tjek at mål/antal er synlige, eller indsæt også tekst.'
            : 'Ingen dimensioner fundet. Prøv fx 1 pcs 150/90/173 cms, eller indsæt et skærmklip af packing listen.',
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
    setImageDataUrl(null)
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
        Indsæt mailtekst, eller Ctrl+V / træk et skærmklip af packing listen.
        Billeder kræver AI-nøgle i .env.
      </p>

      <div
        className={
          dragOver ? 'scanner-dropzone scanner-dropzone-active' : 'scanner-dropzone'
        }
        onPaste={onPaste}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <textarea
          className="input scanner-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          placeholder="Indsæt mailtekst her — eller indsæt/træk et skærmklip…"
          rows={7}
        />

        {imageDataUrl ? (
          <div className="scanner-image-preview">
            <img src={imageDataUrl} alt="Skærmklip til scanning" />
            <button
              type="button"
              className="btn btn-ghost scanner-image-remove"
              onClick={() => setImageDataUrl(null)}
            >
              Fjern billede
            </button>
          </div>
        ) : (
          <div className="scanner-image-actions">
            <button
              type="button"
              className="btn"
              onClick={() => fileRef.current?.click()}
            >
              Vælg skærmklip
            </button>
            <span className="muted">eller Ctrl+V / slip billede her</span>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void addImage(file)
            e.target.value = ''
          }}
        />
      </div>

      <div className="scanner-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !canScan}
          onClick={() => void scan()}
        >
          {busy ? 'Scanner…' : imageDataUrl ? 'Scan skærmklip' : 'Scan mail'}
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
          {imageDataUrl ? ' (billede)' : ''}
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
