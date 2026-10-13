import { EQUIPMENT_PRESETS } from '../data/equipment'
import type { Equipment, EquipmentSection } from '../types'

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

function formatDeckM(mm: number): string {
  return (mm / 1000).toFixed(2).replace('.', ',')
}

function syncFromSections(
  sections: EquipmentSection[],
): Pick<Equipment, 'lengthMm' | 'widthMm' | 'heightMm' | 'sections'> {
  return {
    sections,
    lengthMm: sections.reduce((s, sec) => s + sec.lengthMm, 0),
    widthMm: Math.max(...sections.map((s) => s.widthMm)),
    heightMm: Math.max(...sections.map((s) => s.heightMm)),
  }
}

export function EquipmentPicker({
  value,
  onChange,
  allowStacking,
  onAllowStackingChange,
}: Props) {
  const split = Boolean(value.sections && value.sections.length > 1)

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

  const patchSection = (
    sectionId: string,
    partial: Partial<Pick<EquipmentSection, 'lengthMm' | 'widthMm' | 'heightMm'>>,
  ) => {
    if (!value.sections) return
    const sections = value.sections.map((sec) =>
      sec.id === sectionId ? { ...sec, ...partial } : sec,
    )
    patch(syncFromSections(sections))
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

      {split ? (
        <>
          <p className="muted equip-hint">
            To separate lad — gods kan ikke stå hen over koblingen. Målene er
            defaults og kan ændres.
          </p>
          {value.sections!.map((sec) => (
            <div key={sec.id} className="equip-section">
              <h3 className="equip-section-title">{sec.name}</h3>
              <div className="equip-dims">
                <label className="block-label">
                  <span>Længde (cm)</span>
                  <input
                    className="input"
                    type="number"
                    min={100}
                    step={1}
                    value={mmToCm(sec.lengthMm)}
                    onChange={(e) =>
                      patchSection(sec.id, {
                        lengthMm: Math.round(Number(e.target.value) * 10),
                      })
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
                    value={mmToCm(sec.widthMm)}
                    onChange={(e) =>
                      patchSection(sec.id, {
                        widthMm: Math.round(Number(e.target.value) * 10),
                      })
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
                    value={mmToCm(sec.heightMm)}
                    onChange={(e) =>
                      patchSection(sec.id, {
                        heightMm: Math.round(Number(e.target.value) * 10),
                      })
                    }
                  />
                </label>
              </div>
            </div>
          ))}
          <div className="equip-dims">
            <label className="block-label">
              <span>Max vægt gods (kg)</span>
              <input
                className="input"
                type="number"
                min={100}
                step={100}
                value={value.maxWeightKg}
                onChange={(e) =>
                  patch({
                    maxWeightKg: Math.round(Number(e.target.value) || 0),
                  })
                }
              />
            </label>
          </div>
          <dl className="spec-list">
            <div>
              <dt>Samlet ladlængde</dt>
              <dd>{formatDeckM(value.lengthMm)} m</dd>
            </div>
            <div>
              <dt>Max vægt</dt>
              <dd>{value.maxWeightKg.toLocaleString('da-DK')} kg</dd>
            </div>
          </dl>
        </>
      ) : (
        <>
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
                  patch({
                    maxWeightKg: Math.round(Number(e.target.value) || 0),
                  })
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
        </>
      )}

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
