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
} from '../lib/ai/scanEmailCargo'
import type { CargoItem } from '../types'

type Props = {
  onScanned: (items: CargoItem[]) => void
}

export function EmailScanner({ onScanned }: Props) {
  const [text, setText] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [scanInfo, setScanInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addImage = useCallback(async (file: Blob) => {
    setError(null)
    try {
      const prepared = await prepareScanImage(file)
      setImageDataUrl(prepared.dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke læse billedet')
    }
  }, [])

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      const list = e.clipboardData?.items
      if (!list) return
      for (const item of Array.from(list)) {
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
    setScanInfo(null)
    try {
      const result = await scanEmailCargo(text, {
        image: imageDataUrl ? { dataUrl: imageDataUrl } : null,
      })
      if (!result.drafts.length) {
        setError(
          imageDataUrl
            ? 'Ingen colli fundet på skærmklippet.'
            : 'Ingen dimensioner fundet. Prøv fx 3 Pall – 120X80X127.',
        )
        return
      }
      const next = draftsToCargoItems(result.drafts)
      onScanned(next)
      setText('')
      setImageDataUrl(null)
      const via =
        result.mode === 'local'
          ? 'lokal parser'
          : result.mode === 'openai'
            ? 'OpenAI'
            : 'Anthropic'
      setScanInfo(`${next.length} varelinjer via ${via}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scanning fejlede')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>AI-scanner</h2>
      </div>

      <p className="muted scanner-hint">
        Indsæt mailtekst eller skærmklip (Ctrl+V). Resultatet vises under
        Varelinjer.
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
          placeholder="Indsæt mailtekst eller skærmklip…"
          rows={5}
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
            <span className="muted">eller Ctrl+V</span>
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
          {busy ? 'Scanner…' : 'Scan'}
        </button>
      </div>

      {scanInfo && <p className="scanner-mode">{scanInfo}</p>}
      {error && <p className="export-error">{error}</p>}
    </section>
  )
}
