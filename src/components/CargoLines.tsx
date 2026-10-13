import { useEffect, useRef, useState } from 'react'
import type { CargoItem } from '../types'

type Props = {
  items: CargoItem[]
  onChange: (items: CargoItem[]) => void
}

type EditDraft = {
  id: string
  name: string
  lengthCm: number
  widthCm: number
  heightCm: number
  weightKg: number
  quantity: number
  stackable: boolean
}

function mmToCm(mm: number): number {
  return Math.round((mm / 10) * 10) / 10
}

function cmToMm(cm: number): number {
  return Math.max(1, Math.round(cm * 10))
}

export function CargoLines({ items, onChange }: Props) {
  const [editing, setEditing] = useState<EditDraft | null>(null)
  const editRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [editing?.id])

  if (items.length === 0) {
    return (
      <section className="card">
        <div className="card-head">
          <h2>Varelinjer</h2>
        </div>
        <p className="muted">
          Scan eller tast colli for at oprette varelinjer.
        </p>
      </section>
    )
  }

  const openEdit = (item: CargoItem) => {
    setEditing({
      id: item.id,
      name: item.name,
      lengthCm: mmToCm(item.lengthMm),
      widthCm: mmToCm(item.widthMm),
      heightCm: mmToCm(item.heightMm),
      weightKg: item.weightKg,
      quantity: item.quantity,
      stackable: item.stackable,
    })
  }

  const saveEdit = () => {
    if (!editing) return
    onChange(
      items.map((it) =>
        it.id === editing.id
          ? {
              ...it,
              name: editing.name.trim() || it.name,
              lengthMm: cmToMm(editing.lengthCm),
              widthMm: cmToMm(editing.widthCm),
              heightMm: cmToMm(editing.heightCm),
              weightKg: Math.max(0, Number(editing.weightKg) || 0),
              quantity: Math.max(1, Math.round(editing.quantity) || 1),
              stackable: editing.stackable,
            }
          : it,
      ),
    )
    setEditing(null)
  }

  const removeLine = (id: string) => {
    onChange(items.filter((it) => it.id !== id))
    if (editing?.id === id) setEditing(null)
  }

  const toggleStack = (id: string, stackable: boolean) => {
    onChange(items.map((it) => (it.id === id ? { ...it, stackable } : it)))
    if (editing?.id === id) setEditing({ ...editing, stackable })
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Varelinjer</h2>
        <span className="muted">{items.length} linjer</span>
      </div>

      <div className="scanner-preview">
        <table>
          <thead>
            <tr>
              <th>Navn</th>
              <th>Type</th>
              <th>Mål (cm)</th>
              <th>Antal</th>
              <th>kg</th>
              <th>Stack</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={editing?.id === item.id ? 'row-editing' : undefined}
              >
                <td>
                  <span
                    className="sw"
                    style={{ background: item.color }}
                    aria-hidden
                  />
                  {item.name}
                </td>
                <td className="muted">
                  {item.shape === 'pipe'
                    ? 'Pipe'
                    : item.shape === 'barrel'
                      ? 'Tønde'
                      : 'Kasse'}
                </td>
                <td className="mono">
                  {item.shape === 'pipe'
                    ? `${mmToCm(item.lengthMm)}×Ø${mmToCm(item.widthMm)}`
                    : item.shape === 'barrel'
                      ? `Ø${mmToCm(item.widthMm)}×${mmToCm(item.heightMm)}`
                      : `${mmToCm(item.lengthMm)}×${mmToCm(item.widthMm)}×${mmToCm(item.heightMm)}`}
                </td>
                <td>{item.quantity}</td>
                <td>{item.weightKg}</td>
                <td>
                  <button
                    type="button"
                    className={
                      item.stackable
                        ? 'stack-chip stack-chip-sm stack-chip-active'
                        : 'stack-chip stack-chip-sm'
                    }
                    title={
                      item.stackable
                        ? 'Stack OK — klik for non-stack'
                        : 'Non-stack — klik for Stack OK'
                    }
                    onClick={() => toggleStack(item.id, !item.stackable)}
                  >
                    {item.stackable ? 'OK' : 'Nej'}
                  </button>
                </td>
                <td className="scanner-row-actions">
                  <button
                    type="button"
                    className="btn btn-ret"
                    onClick={() => openEdit(item)}
                  >
                    Ret
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          ref={editRef}
          className="scanner-edit"
          role="dialog"
          aria-label="Ret varelinje"
        >
          <div className="scanner-edit-head">
            <strong>Ret colli</strong>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(null)}
            >
              Luk
            </button>
          </div>
          <label>
            <span>Navn</span>
            <input
              className="input"
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value })
              }
            />
          </label>
          <div className="scanner-edit-grid">
            <label>
              <span>Længde (cm)</span>
              <input
                className="input"
                type="number"
                min={1}
                step={0.1}
                value={editing.lengthCm}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    lengthCm: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label>
              <span>Bredde (cm)</span>
              <input
                className="input"
                type="number"
                min={1}
                step={0.1}
                value={editing.widthCm}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    widthCm: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label>
              <span>Højde (cm)</span>
              <input
                className="input"
                type="number"
                min={1}
                step={0.1}
                value={editing.heightCm}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    heightCm: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label>
              <span>Vægt (kg/stk)</span>
              <input
                className="input"
                type="number"
                min={0}
                step={0.1}
                value={editing.weightKg}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    weightKg: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label>
              <span>Antal</span>
              <input
                className="input"
                type="number"
                min={1}
                value={editing.quantity}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    quantity: Number(e.target.value) || 1,
                  })
                }
              />
            </label>
          </div>
          <div className="stack-toggle" role="group" aria-label="Stabling">
            <button
              type="button"
              className={
                editing.stackable
                  ? 'stack-chip stack-chip-active'
                  : 'stack-chip'
              }
              onClick={() => setEditing({ ...editing, stackable: true })}
            >
              Stack OK
            </button>
            <button
              type="button"
              className={
                !editing.stackable
                  ? 'stack-chip stack-chip-active'
                  : 'stack-chip'
              }
              onClick={() => setEditing({ ...editing, stackable: false })}
            >
              Non-stack
            </button>
          </div>
          <div className="scanner-edit-actions">
            <button type="button" className="btn btn-primary" onClick={saveEdit}>
              Gem
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => removeLine(editing.id)}
            >
              Fjern linje
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
