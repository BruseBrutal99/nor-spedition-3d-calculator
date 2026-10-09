import type { CargoItem } from '../types'
import { CARGO_COLORS } from '../data/equipment'

type Props = {
  items: CargoItem[]
  onChange: (items: CargoItem[]) => void
}

function emptyItem(index: number): CargoItem {
  return {
    id: crypto.randomUUID(),
    name: `Colli ${index + 1}`,
    lengthMm: 1200,
    widthMm: 800,
    heightMm: 1000,
    weightKg: 250,
    quantity: 1,
    allowRotation: true,
    stackable: true,
    color: CARGO_COLORS[index % CARGO_COLORS.length],
  }
}

export function CargoForm({ items, onChange }: Props) {
  const update = (id: string, patch: Partial<CargoItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const remove = (id: string) => {
    onChange(items.filter((item) => item.id !== id))
  }

  const add = () => {
    onChange([...items, emptyItem(items.length)])
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Gods / colli</h2>
        <button type="button" className="btn" onClick={add}>
          Tilføj colli
        </button>
      </div>

      <div className="cargo-list">
        {items.length === 0 && (
          <p className="muted">Tilføj colli, pakker eller paller for at starte.</p>
        )}
        {items.map((item, index) => (
          <article key={item.id} className="cargo-card">
            <div className="cargo-card-top">
              <div className="left">
                <span className="swatch" style={{ background: item.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="cargo-index">Colli {index + 1}</p>
                  <input
                    className="input name"
                    value={item.name}
                    onChange={(e) => update(item.id, { name: e.target.value })}
                    aria-label="Navn"
                  />
                </div>
              </div>
              {items.length > 1 ? (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => remove(item.id)}
                >
                  Fjern
                </button>
              ) : null}
            </div>

            <div className="field-grid cols-3">
              <label>
                <span>Længde (mm)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={item.lengthMm}
                  onChange={(e) =>
                    update(item.id, { lengthMm: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label>
                <span>Bredde (mm)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={item.widthMm}
                  onChange={(e) =>
                    update(item.id, { widthMm: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label>
                <span>Højde (mm)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={item.heightMm}
                  onChange={(e) =>
                    update(item.id, { heightMm: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label>
                <span>Vægt pr. stk (kg)</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={0.1}
                  value={item.weightKg}
                  onChange={(e) =>
                    update(item.id, { weightKg: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label>
                <span>Antal</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    update(item.id, {
                      quantity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </label>
            </div>

            <div className="toggles">
              <label className="check">
                <input
                  type="checkbox"
                  checked={item.allowRotation}
                  onChange={(e) =>
                    update(item.id, { allowRotation: e.target.checked })
                  }
                />
                Rotation (L↔B)
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={item.stackable}
                  onChange={(e) =>
                    update(item.id, { stackable: e.target.checked })
                  }
                />
                Stack OK (må stables ovenpå)
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
