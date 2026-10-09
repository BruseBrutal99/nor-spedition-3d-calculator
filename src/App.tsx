import { useMemo, useState } from 'react'

function isEmbedMode(): boolean {
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search)
  if (q.has('embed') || q.get('mode') === 'embed') return true
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}
import { CargoForm } from './components/CargoForm'
import { EmailScanner } from './components/EmailScanner'
import { EquipmentPicker } from './components/EquipmentPicker'
import { ExportPanel } from './components/ExportPanel'
import { LoadScene } from './components/LoadScene'
import { ResultStats } from './components/ResultStats'
import { CARGO_COLORS, EQUIPMENT_PRESETS } from './data/equipment'
import { LOGO_URL } from './lib/logo'
import { formatLadmeter, packFleet } from './lib/packer'
import type { CargoItem, Equipment, FleetPlan } from './types'

const DEMO_CARGO: CargoItem[] = [
  {
    id: 'demo-heavy',
    name: 'Tungt colli',
    lengthMm: 1200,
    widthMm: 800,
    heightMm: 1000,
    weightKg: 1000,
    quantity: 1,
    allowRotation: true,
    stackable: true,
    color: CARGO_COLORS[0],
  },
  {
    id: 'demo-box',
    name: 'Karton',
    lengthMm: 600,
    widthMm: 400,
    heightMm: 400,
    weightKg: 10,
    quantity: 10,
    allowRotation: true,
    stackable: true,
    color: CARGO_COLORS[2],
  },
]

const DEFAULT_EQ =
  EQUIPMENT_PRESETS.find((p) => p.id === 'trailer-13.6-240-265') ??
  EQUIPMENT_PRESETS[1]

export default function App() {
  const [items, setItems] = useState<CargoItem[]>(DEMO_CARGO)
  const [equipment, setEquipment] = useState<Equipment>({ ...DEFAULT_EQ })
  const [allowStacking, setAllowStacking] = useState(true)
  const [fleet, setFleet] = useState<FleetPlan | null>(null)
  const [activeVehicle, setActiveVehicle] = useState(0)
  const embed = useMemo(() => isEmbedMode(), [])

  const canCalculate = useMemo(
    () => items.length > 0 && items.every((i) => i.quantity > 0),
    [items],
  )

  const active = fleet?.vehicles[activeVehicle]
  const result = active?.result ?? null
  const exportItems = active?.items ?? items

  const calculate = () => {
    const effectiveStacking =
      allowStacking && items.some((i) => i.stackable)
    const plan = packFleet(items, equipment, {
      allowStacking: effectiveStacking,
    })
    setFleet(plan)
    setActiveVehicle(0)
  }

  return (
    <div className={embed ? 'app app-embed' : 'app'}>
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <img
            className="sidebar-logo-img"
            src={LOGO_URL}
            alt="NOR Spedition"
            width={100}
            height={100}
          />
        </div>
        <div className="sidebar-nav">
          <div className="nav-item" aria-current="page">
            <span className="nav-item-dot" />
            3D Load Calculator
          </div>
        </div>
        <div className="sidebar-foot">
          <p className="name">Nor Spedition</p>
          <p className="meta">3D lastplanlægning</p>
        </div>
      </aside>

      <div className="main">
        <div className="main-inner">
          <header className="page-header">
            <div>
              <h1>3D Load Calculator</h1>
              <p className="subtitle">
                Velkommen til Nors 3D Load calculator
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canCalculate}
              onClick={calculate}
            >
              Beregn lastplan
            </button>
          </header>

          <div className="workspace">
            <div className="workspace-forms">
              <EmailScanner
                onApply={(next, how) => {
                  setItems((prev) =>
                    how === 'replace' ? next : [...prev, ...next],
                  )
                  if (next.length && next.every((i) => !i.stackable)) {
                    setAllowStacking(false)
                  }
                  setFleet(null)
                }}
              />
              <CargoForm items={items} onChange={setItems} />
              <EquipmentPicker
                value={equipment}
                onChange={(eq) => {
                  setEquipment(eq)
                  setFleet(null)
                }}
                allowStacking={allowStacking}
                onAllowStackingChange={(v) => {
                  setAllowStacking(v)
                  setFleet(null)
                }}
              />
              <ResultStats
                result={result}
                fleet={fleet}
                activeVehicle={activeVehicle}
                onSelectVehicle={setActiveVehicle}
              />
              <ExportPanel
                equipment={equipment}
                result={result}
                items={exportItems}
                fleet={fleet}
                reference={
                  fleet && fleet.vehicleCount > 1
                    ? `${active?.label} af ${fleet.vehicleCount}`
                    : undefined
                }
              />
            </div>

            <section className="workspace-view">
              <div className="viewport-frame">
                {result && active && fleet ? (
                  <>
                    <div className="viewport-hud">
                      <div className="viewport-hud-lm">
                        <span className="viewport-hud-label">
                          {fleet.vehicleCount > 1
                            ? `${active.label} · LDM`
                            : 'LDM'}
                        </span>
                        <span className="viewport-hud-value">
                          {formatLadmeter(result.loadingMeters)}
                        </span>
                      </div>
                      <div className="viewport-hud-sub">
                        {Math.round(result.totalWeightKg).toLocaleString('da-DK')}{' '}
                        kg
                        {result.weightPercent >= 85 && result.fillPercent < 50
                          ? ' · vægtbegrænset'
                          : ''}
                        {fleet.vehicleCount > 1
                          ? ` · ${fleet.vehicleCount} biler`
                          : ''}
                      </div>
                    </div>
                    <LoadScene
                      equipment={equipment}
                      activeIndex={activeVehicle}
                      vehicles={fleet.vehicles.map((v) => ({
                        label: v.label,
                        placed: v.result.placed,
                      }))}
                    />
                  </>
                ) : (
                  <div className="viewport-empty">
                    <p>Indtast gods, vælg udstyr og tryk Beregn lastplan.</p>
                    <p className="muted">
                      Ved vægt over max pr. bil foreslås flere biler automatisk.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
