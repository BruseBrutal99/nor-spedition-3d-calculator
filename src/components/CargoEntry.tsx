import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import { CARGO_COLORS } from '../data/equipment'
import {
  draftsToCargoItems,
  prepareScanImage,
  scanEmailCargo,
} from '../lib/ai/scanEmailCargo'
import type {
  CargoArrangement,
  CargoItem,
  CargoShape,
} from '../types'

type Mode = 'manual' | 'ai'

type Props = {
  onScanned: (items: CargoItem[]) => void
  onAddItem: (item: CargoItem) => void
  lineCount: number
}

type ManualDraft = {
  name: string
  lengthCm: number
  widthCm: number
  heightCm: number
  diameterCm: number
  weightKg: number
  quantity: number
  stackable: boolean
  shape: CargoShape
  arrangement: CargoArrangement
  color: string
}

function emptyDraft(index: number): ManualDraft {
  return {
    name: `Colli ${index + 1}`,
    lengthCm: 120,
    widthCm: 80,
    heightCm: 100,
    diameterCm: 40,
    weightKg: 250,
    quantity: 1,
    stackable: true,
    shape: 'box',
    arrangement: 'linear',
    color: CARGO_COLORS[index % CARGO_COLORS.length],
  }
}

function shapeToDims(draft: ManualDraft): {
  lengthMm: number
  widthMm: number
  heightMm: number
} {
  if (draft.shape === 'pipe') {
    const d = Math.max(1, Math.round(draft.diameterCm * 10))
    return {
      lengthMm: Math.max(1, Math.round(draft.lengthCm * 10)),
      widthMm: d,
      heightMm: d,
    }
  }
  if (draft.shape === 'barrel') {
    const d = Math.max(1, Math.round(draft.diameterCm * 10))
    return {
      lengthMm: d,
      widthMm: d,
      heightMm: Math.max(1, Math.round(draft.heightCm * 10)),
    }
  }
  return {
    lengthMm: Math.max(1, Math.round(draft.lengthCm * 10)),
    widthMm: Math.max(1, Math.round(draft.widthCm * 10)),
    heightMm: Math.max(1, Math.round(draft.heightCm * 10)),
  }
}

export function CargoEntry({ onScanned, onAddItem, lineCount }: Props) {
  const [mode, setMode] = useState<Mode>('ai')
  const [draft, setDraft] = useState(() => emptyDraft(lineCount))
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

  const setShape = (shape: CargoShape) => {
    setDraft((d) => ({
      ...d,
      shape,
      stackable: shape === 'box' ? d.stackable : false,
      arrangement: shape === 'box' ? 'linear' : d.arrangement,
    }))
  }

  const addManual = (e: FormEvent) => {
    e.preventDefault()
    const dims = shapeToDims(draft)
    const item: CargoItem = {
      id: crypto.randomUUID(),
      name: draft.name.trim() || `Colli ${lineCount + 1}`,
      ...dims,
      weightKg: Math.max(0, Number(draft.weightKg) || 0),
      quantity: Math.max(1, Math.round(draft.quantity) || 1),
      allowRotation: draft.shape !== 'barrel',
      stackable: draft.shape === 'box' ? draft.stackable : false,
      color: draft.color,
      shape: draft.shape,
      arrangement: draft.shape === 'box' ? 'linear' : draft.arrangement,
    }
    onAddItem(item)
    setDraft(emptyDraft(lineCount + 1))
    setError(null)
  }

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
            : 'Ingen dimensioner fundet. Prøv fx 4x paller, 120cm x 80cm x 150cm.',
        )
        return
      }
      const next = draftsToCargoItems(result.drafts)
      onScanned(next)
      setText('')
      setImageDataUrl(null)
      setScanInfo(
        next.length === 1
          ? 'Fundet 1 varelinje'
          : `Fundet ${next.length} varelinjer`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scanning fejlede')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Gods</h2>
      </div>

      <div className="entry-tabs" role="tablist" aria-label="Indtastningsmetode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'manual'}
          className={
            mode === 'manual' ? 'entry-tab entry-tab-active' : 'entry-tab'
          }
          onClick={() => {
            setMode('manual')
            setError(null)
          }}
        >
          Tast selv
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'ai'}
          className={mode === 'ai' ? 'entry-tab entry-tab-active' : 'entry-tab'}
          onClick={() => {
            setMode('ai')
            setError(null)
          }}
        >
          AI-scanner
        </button>
      </div>

      {mode === 'manual' ? (
        <form className="manual-entry" onSubmit={addManual}>
          <p className="muted scanner-hint">
            Vælg type, mål og placering — tilføj ét colli ad gangen.
          </p>

          <div className="shape-row">
            <span className="shape-label">Type</span>
            <div className="shape-icons" role="group" aria-label="Colli-type">
              <button
                type="button"
                title="Kasse / palle"
                className={
                  draft.shape === 'box'
                    ? 'shape-btn shape-btn-active'
                    : 'shape-btn'
                }
                onClick={() => setShape('box')}
              >
                <span aria-hidden>▢</span>
              </button>
              <button
                type="button"
                title="Rør / pipe (liggende)"
                className={
                  draft.shape === 'pipe'
                    ? 'shape-btn shape-btn-active'
                    : 'shape-btn'
                }
                onClick={() => setShape('pipe')}
              >
                <span aria-hidden>═</span>
              </button>
              <button
                type="button"
                title="Tønde (stående)"
                className={
                  draft.shape === 'barrel'
                    ? 'shape-btn shape-btn-active'
                    : 'shape-btn'
                }
                onClick={() => setShape('barrel')}
              >
                <span aria-hidden>⌀</span>
              </button>
            </div>
            <div className="color-dots" role="group" aria-label="Farve">
              {CARGO_COLORS.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={
                    draft.color === c
                      ? 'color-dot color-dot-active'
                      : 'color-dot'
                  }
                  style={{ background: c }}
                  title="Farve i 3D"
                  onClick={() => setDraft({ ...draft, color: c })}
                />
              ))}
            </div>
          </div>

          {draft.shape !== 'box' && (
            <div className="shape-row">
              <span className="shape-label">Placering</span>
              <div
                className="shape-icons"
                role="group"
                aria-label="Placering på trailer"
              >
                <button
                  type="button"
                  title="På række"
                  className={
                    draft.arrangement === 'linear'
                      ? 'shape-btn shape-btn-active'
                      : 'shape-btn'
                  }
                  onClick={() => setDraft({ ...draft, arrangement: 'linear' })}
                >
                  <span aria-hidden>···</span>
                </button>
                <button
                  type="button"
                  title="I gitter"
                  className={
                    draft.arrangement === 'grid'
                      ? 'shape-btn shape-btn-active'
                      : 'shape-btn'
                  }
                  onClick={() => setDraft({ ...draft, arrangement: 'grid' })}
                >
                  <span aria-hidden>⁝⁝</span>
                </button>
                <button
                  type="button"
                  title="Forskudt / nested"
                  className={
                    draft.arrangement === 'nested'
                      ? 'shape-btn shape-btn-active'
                      : 'shape-btn'
                  }
                  onClick={() => setDraft({ ...draft, arrangement: 'nested' })}
                >
                  <span aria-hidden>⋱⋱</span>
                </button>
              </div>
            </div>
          )}

          <label>
            <span>Navn</span>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
          </label>

          <div className="manual-entry-grid">
            {draft.shape === 'box' && (
              <>
                <label>
                  <span>Længde [cm]</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={0.1}
                    value={draft.lengthCm}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lengthCm: Number(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </label>
                <label>
                  <span>Bredde [cm]</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={0.1}
                    value={draft.widthCm}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        widthCm: Number(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </label>
                <label>
                  <span>Højde [cm]</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={0.1}
                    value={draft.heightCm}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        heightCm: Number(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </label>
              </>
            )}
            {draft.shape === 'pipe' && (
              <>
                <label>
                  <span>Længde [cm]</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={0.1}
                    value={draft.lengthCm}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lengthCm: Number(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </label>
                <label>
                  <span>Diameter [cm]</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={0.1}
                    value={draft.diameterCm}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        diameterCm: Number(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </label>
              </>
            )}
            {draft.shape === 'barrel' && (
              <>
                <label>
                  <span>Diameter [cm]</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={0.1}
                    value={draft.diameterCm}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        diameterCm: Number(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </label>
                <label>
                  <span>Højde [cm]</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={0.1}
                    value={draft.heightCm}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        heightCm: Number(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </label>
              </>
            )}
            <label>
              <span>Vægt [kg]</span>
              <input
                className="input"
                type="number"
                min={0}
                step={0.1}
                value={draft.weightKg}
                onChange={(e) =>
                  setDraft({ ...draft, weightKg: Number(e.target.value) || 0 })
                }
              />
            </label>
            <label>
              <span>Antal</span>
              <input
                className="input"
                type="number"
                min={1}
                value={draft.quantity}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    quantity: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </label>
          </div>

          <div className="manual-entry-foot">
            {draft.shape === 'box' ? (
              <div className="stack-toggle" role="group" aria-label="Stabling">
                <button
                  type="button"
                  className={
                    draft.stackable
                      ? 'stack-chip stack-chip-active'
                      : 'stack-chip'
                  }
                  onClick={() => setDraft({ ...draft, stackable: true })}
                >
                  Stack OK
                </button>
                <button
                  type="button"
                  className={
                    !draft.stackable
                      ? 'stack-chip stack-chip-active'
                      : 'stack-chip'
                  }
                  onClick={() => setDraft({ ...draft, stackable: false })}
                >
                  Non-stack
                </button>
              </div>
            ) : (
              <p className="muted shape-note">
                {draft.shape === 'pipe' ? 'Pipe' : 'Tønde'} ·{' '}
                {draft.arrangement === 'linear'
                  ? 'på række'
                  : draft.arrangement === 'grid'
                    ? 'gitter'
                    : 'forskudt'}
              </p>
            )}
            <button type="submit" className="btn btn-primary">
              Tilføj
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted scanner-hint">
            Indsæt mailtekst eller skærmklip/packing list (Ctrl+V). Understøtter
            bl.a. Length/Wide/Height i cm. Resultatet vises under Varelinjer.
          </p>

          <div
            className={
              dragOver
                ? 'scanner-dropzone scanner-dropzone-active'
                : 'scanner-dropzone'
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
        </>
      )}

      {error && <p className="export-error">{error}</p>}
    </section>
  )
}
