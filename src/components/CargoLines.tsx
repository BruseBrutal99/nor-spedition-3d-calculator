import { useState } from 'react'
import type { CargoItem } from '../types'

type Props = {
  items: CargoItem[]
  onChange: (items: CargoItem[]) => void
}

type EditDraft = {
  id: string
  name: string
  lengthMm: number
  widthMm: number
  heightMm: number
  weightKg: number
  quantity: number
}

export function CargoLines({ items, onChange }: Props) {
  const [editing, setEditing] = useState<EditDraft | null>(null)

  if (items.length === 0) {
    return (
      <section className="card">
        <div className="card-head">
          <h2>Varelinjer</h2>
        </div>
        <p className="muted">Scan gods for at oprette varelinjer.</p>
      </section>
    )
  }

  const openEdit = (item: CargoItem) => {
    setEditing({
      id: item.id,
      name: item.name,
      lengthMm: item.lengthMm,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      weightKg: item.weightKg,
      quantity: item.quantity,
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
              lengthMm: Math.max(1, Math.round(editing.lengthMm)),
              widthMm: Math.max(1, Math.round(editing.widthMm)),
              heightMm: Math.max(1, Math.round(editing.heightMm)),
              weightKg: Math.max(0, Number(editing.weightKg) || 0),
              quantity: Math.max(1, Math.round(editing.quantity) || 1),
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
              <th>L×B×H</th>
              <th>Antal</th>
              <th>kg</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <span
                    className="sw"
                    style={{ background: item.color }}
                    aria-hidden
                  />
                  {item.name}
                </td>
                <td className="mono">
                  {item.lengthMm}×{item.widthMm}×{item.heightMm}
                </td>
                <td>{item.quantity}</td>
                <td>{item.weightKg}</td>
                <td className="scanner-row-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
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
        <div className="scanner-edit" role="dialog" aria-label="Ret varelinje">
          <div className="scanner-edit-head">
            <strong>Ret varelinje</strong>
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
              <span>Længde (mm)</span>
              <input
                className="input"
                type="number"
                min={1}
                value={editing.lengthMm}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    lengthMm: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label>
              <span>Bredde (mm)</span>
              <input
                className="input"
                type="number"
                min={1}
                value={editing.widthMm}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    widthMm: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label>
              <span>Højde (mm)</span>
              <input
                className="input"
                type="number"
                min={1}
                value={editing.heightMm}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    heightMm: Number(e.target.value) || 0,
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
