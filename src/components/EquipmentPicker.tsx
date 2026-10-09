import { EQUIPMENT_PRESETS } from '../data/equipment'
import type { Equipment } from '../types'

type Props = {
  value: Equipment
  onChange: (equipment: Equipment) => void
  allowStacking: boolean
  onAllowStackingChange: (value: boolean) => void
}

function mmToCm(mm: number): string {
  const cm = mm / 10
  return Number.isInteger(cm) ? String(cm) : String(Math.round(cm * 10) / 10)
}

export function EquipmentPicker({
  value,
  onChange,
  allowStacking,
  onAllowStackingChange,
}: Props) {
  const patch = (partial: Partial<Equipment>) => {
    onChange({
      ...value,
      id: value.id.startsWith('custom') ? value.id : `custom-${value.id}`,
      name: value.name.includes('(tilpasset)')
        ? value.name
        : `${value.name} (tilpasset)`,
      ...partial,
    })
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Udstyr & lastregler</h2>
      </div>

      <label className="block-label">
        <span>Type</span>
        <select
          className="input"
          value={
            EQUIPMENT_PRESETS.some((p) => p.id === value.id)
              ? value.id
              : value.id.replace(/^custom-/, '')
          }
          onChange={(e) => {
            const next = EQUIPMENT_PRESETS.find((p) => p.id === e.target.value)
            if (next) onChange({ ...next })
          }}
        >
          <optgroup label="Lastbil / trailer">
            {EQUIPMENT_PRESETS.filter((p) => p.category !== 'container').map(
              (p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ),
            )}
          </optgroup>
          <optgroup label="Container">
            {EQUIPMENT_PRESETS.filter((p) => p.category === 'container').map(
              (p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ),
            )}
          </optgroup>
        </select>
      </label>

      <div className="equip-dims">
        <label className="block-label">
          <span>Længde (cm)</span>
          <input
            className="input"
            type="number"
            min={100}
            step={1}
            value={mmToCm(value.lengthMm)}
            onChange={(e) =>
              patch({ lengthMm: Math.round(Number(e.target.value) * 10) })
            }
          />
        </label>
        <label className="block-label">
          <span>Bredde (cm)</span>
          <input
            className="input"
            type="number"
            min={100}
            step={1}
            value={mmToCm(value.widthMm)}
            onChange={(e) =>
              patch({ widthMm: Math.round(Number(e.target.value) * 10) })
            }
          />
        </label>
        <label className="block-label">
          <span>Højde (cm)</span>
          <input
            className="input"
            type="number"
            min={100}
            step={1}
            value={mmToCm(value.heightMm)}
            onChange={(e) =>
              patch({ heightMm: Math.round(Number(e.target.value) * 10) })
            }
          />
        </label>
        <label className="block-label">
          <span>Max vægt (kg)</span>
          <input
            className="input"
            type="number"
            min={100}
            step={100}
            value={value.maxWeightKg}
            onChange={(e) =>
              patch({ maxWeightKg: Math.round(Number(e.target.value) || 0) })
            }
          />
        </label>
      </div>

      <dl className="spec-list">
        <div>
          <dt>Indvendig L×B×H</dt>
          <dd>
            {(value.lengthMm / 1000).toFixed(2)} ×{' '}
            {(value.widthMm / 1000).toFixed(2)} ×{' '}
            {(value.heightMm / 1000).toFixed(2)} m
          </dd>
        </div>
        <div>
          <dt>Max vægt</dt>
          <dd>{value.maxWeightKg.toLocaleString('da-DK')} kg</dd>
        </div>
      </dl>

      <label className="check">
        <input
          type="checkbox"
          checked={allowStacking}
          onChange={(e) => onAllowStackingChange(e.target.checked)}
        />
        Stack OK — stabl for optimal plads (tungt nederst)
      </label>
      {!allowStacking && (
        <p className="muted equip-hint">
          Non-stack: alt gods lægges på gulvet — flere biler hvis vægt/plads
          kræver det.
        </p>
      )}
    </section>
  )
}
