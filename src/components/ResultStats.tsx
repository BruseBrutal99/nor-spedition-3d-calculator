import type { FleetPlan, LoadResult } from '../types'
import { formatKg, formatLadmeter, formatM3 } from '../lib/packer'

type Props = {
  result: LoadResult | null
  fleet: FleetPlan | null
  activeVehicle: number
  onSelectVehicle: (index: number) => void
}

function VehicleStats({ result }: { result: LoadResult }) {
  const eqM = result.equipmentLengthMm / 1000
  const eqLabel = `${eqM.toFixed(eqM % 1 === 0 ? 0 : 1).replace('.', ',')} m`

  return (
    <>
      <div className="ladmeter-hero" aria-label="LDM">
        <div className="ladmeter-hero-main">
          <span className="ladmeter-hero-label">LDM på bilen</span>
          <span className="ladmeter-hero-value">
            {formatLadmeter(result.loadingMeters)}
          </span>
        </div>
        <div className="ladmeter-hero-meta">
          <span>
            {formatKg(result.totalWeightKg)}
            {result.weightPercent >= 85 && result.fillPercent < 50
              ? ' · vægtbegrænset'
              : ` · max ${eqLabel}`}
          </span>
          <span className="mono">{result.floorPercent.toFixed(0)}%</span>
        </div>
        <div className="meter" title="Andel af bilens længde">
          <div
            className="meter-fill floor"
            style={{ width: `${Math.min(100, result.floorPercent)}%` }}
          />
        </div>
      </div>

      <div className="meters">
        <div>
          <div className="meter-label">
            <span>Rumfang</span>
            <span className="mono">
              {result.fillPercent.toFixed(1)}% · {formatM3(result.usedVolumeM3)}{' '}
              / {formatM3(result.totalVolumeM3)}
            </span>
          </div>
          <div className="meter">
            <div
              className="meter-fill volume"
              style={{ width: `${Math.min(100, result.fillPercent)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="meter-label">
            <span>Vægt</span>
            <span className="mono">
              {result.weightPercent.toFixed(1)}% ·{' '}
              {formatKg(result.totalWeightKg)} / {formatKg(result.maxWeightKg)}
            </span>
          </div>
          <div className="meter">
            <div
              className="meter-fill weight"
              style={{ width: `${Math.min(100, result.weightPercent)}%` }}
            />
          </div>
        </div>
      </div>

      {result.unplaced.length > 0 && (
        <div className="unplaced">
          <h3>Ikke placeret</h3>
          <ul>
            {result.unplaced.map((u, i) => (
              <li key={`${u.cargoId}-${i}`}>
                <span>{u.name}</span>
                <span className="muted">{u.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

export function ResultStats({
  result,
  fleet,
  activeVehicle,
  onSelectVehicle,
}: Props) {
  if (!result || !fleet) {
    return (
      <section className="card">
        <div className="card-head">
          <h2>Resultat</h2>
        </div>
        <p className="muted">
          Beregn for at se antal biler, LDM, fyldning og vægt.
        </p>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Resultat</h2>
        <span className="badge">
          {fleet.vehicleCount} bil
          {fleet.vehicleCount > 1 ? 'er' : ''} ·{' '}
          {formatKg(fleet.totalWeightKg)} total
        </span>
      </div>

      {fleet.splitReason && (
        <p className="fleet-reason">{fleet.splitReason}</p>
      )}

      {fleet.vehicleCount > 1 && (
        <div className="fleet-tabs" role="tablist">
          {fleet.vehicles.map((v, i) => (
            <button
              key={v.label}
              type="button"
              role="tab"
              className={
                i === activeVehicle ? 'fleet-tab fleet-tab-active' : 'fleet-tab'
              }
              aria-selected={i === activeVehicle}
              onClick={() => onSelectVehicle(i)}
            >
              <strong>{v.label}</strong>
              <span>
                {formatLadmeter(v.result.loadingMeters)} ·{' '}
                {formatKg(v.result.totalWeightKg)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="card-head" style={{ marginTop: '0.35rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem' }}>
          {fleet.vehicles[activeVehicle]?.label ?? 'Bil'}
        </h3>
        <span className="badge">
          {result.placed.length} placeret
          {result.unplaced.length > 0
            ? ` · ${result.unplaced.length} ude`
            : ''}
        </span>
      </div>

      <VehicleStats result={result} />
    </section>
  )
}
