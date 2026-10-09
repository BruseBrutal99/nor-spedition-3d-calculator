import { analyse } from './analyse'
import { fmt, fmtDateOnly, fmtDateTime, formatRanges } from './format'
import type { Plan, PlanUnit, UnitAnalysis } from './types'
import { renderViews, sideLabel } from './viewsSvg'

const CSS = `
  @page { size: A4; margin: 10mm; }
  :root{
    --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --soft:#f3f4f6;
    --brand:#b08d57; --accent:#1f2937; --ok:#059669; --warn:#d97706; --bad:#dc2626;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:#e5e7eb;color:var(--ink);
    font:9.5pt/1.35 -apple-system,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}
  .page{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:10mm;
    display:flex;flex-direction:column;gap:5mm;box-shadow:0 2px 10px rgba(0,0,0,.12)}
  @media print{
    body{background:#fff}
    .page{margin:0;box-shadow:none;width:auto;min-height:auto;padding:0;page-break-after:always}
    .page:last-child{page-break-after:auto}
    .no-print{display:none!important}
  }
  .hdr{display:grid;grid-template-columns:auto 1fr auto;gap:4mm;align-items:center;
    border-bottom:2px solid var(--ink);padding-bottom:3mm}
  .logo{font-weight:800;font-size:15pt;letter-spacing:.5px;color:var(--brand);line-height:1}
  .logo small{display:block;font-size:6.5pt;color:var(--muted);letter-spacing:2px}
  .hdr h1{margin:0;font-size:15pt}
  .hdr .sub{color:var(--muted);font-size:8.5pt}
  .unit{text-align:right}
  .unit .big{font-size:18pt;font-weight:800;line-height:1}
  .unit .sub{font-size:8pt}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:6px;overflow:hidden}
  .meta div{padding:2mm 3mm;border-right:1px solid var(--line)}
  .meta div:last-child{border-right:0}
  .meta b{display:block;font-size:7pt;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:600}
  .meta span{font-weight:600}
  .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:2.5mm}
  .kpi{border:1px solid var(--line);border-radius:6px;padding:2.5mm 3mm}
  .kpi b{display:block;font-size:7pt;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:600}
  .kpi .v{font-size:13pt;font-weight:800;line-height:1.15}
  .kpi .s{font-size:7.5pt;color:var(--muted)}
  .bar{height:4px;background:var(--soft);border-radius:2px;margin-top:1.5mm;overflow:hidden}
  .bar i{display:block;height:100%;background:var(--accent)}
  .bar i.warn{background:var(--warn)} .bar i.bad{background:var(--bad)}
  .tag{display:inline-block;font-size:7pt;font-weight:700;padding:.3mm 1.5mm;border-radius:3px;background:#fef3c7;color:#92400e;margin-top:1mm}
  .tag.ok{background:#d1fae5;color:#065f46}
  h2{font-size:8pt;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:0 0 1.5mm;font-weight:700}
  .view{border:1px solid var(--line);border-radius:6px;padding:2mm 3mm}
  svg{display:block;width:100%;height:auto}
  .views{display:grid;grid-template-columns:1fr;gap:3mm}
  table{width:100%;border-collapse:collapse;font-size:8.5pt}
  th{font-size:7pt;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);text-align:left;
    font-weight:600;border-bottom:1.5px solid var(--ink);padding:1.5mm 2mm}
  td{padding:1.6mm 2mm;border-bottom:1px solid var(--line);vertical-align:middle}
  td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:700;border-top:1.5px solid var(--ink);border-bottom:0}
  .sw{display:inline-block;width:3mm;height:3mm;border-radius:2px;vertical-align:-1px;margin-right:1.5mm}
  .flags span{font-size:6.8pt;border:1px solid var(--line);border-radius:3px;padding:0 1mm;margin-right:.8mm;color:#374151;white-space:nowrap}
  .two{display:grid;grid-template-columns:1.35fr 1fr;gap:4mm}
  ol.seq{margin:0;padding:0;list-style:none;columns:2;column-gap:4mm;font-size:8pt}
  ol.seq.cols3{columns:3}
  ol.seq li{break-inside:avoid;display:flex;gap:1.5mm;align-items:center;padding:.8mm 0;border-bottom:1px dotted var(--line)}
  ol.seq .no{font-weight:700;width:5mm;text-align:right;color:var(--muted)}
  .notes{font-size:8pt;color:#374151}
  .notes p{margin:0 0 1.5mm}
  .sign{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:3mm}
  .sign div{border-top:1px solid var(--ink);padding-top:1mm;font-size:7pt;color:var(--muted)}
  .ftr{margin-top:auto;display:flex;justify-content:space-between;font-size:7pt;color:var(--muted);
    border-top:1px solid var(--line);padding-top:2mm}
  .toolbar{position:sticky;top:0;z-index:10;background:#111827;color:#fff;padding:10px 16px;
    display:flex;gap:12px;align-items:center;justify-content:center;font-size:13px}
  .toolbar button{background:#b08d57;border:0;color:#111;font-weight:700;padding:8px 14px;border-radius:6px;cursor:pointer}
`

function barCls(v: number): string {
  if (v > 100) return 'bad'
  if (v > 90) return 'warn'
  return ''
}

function dimsLabel(T: { l: number; w: number; h: number; awb?: { l: number; w: number; h: number } }): string {
  const placed = `${T.l}×${T.w}×${T.h}`
  if (T.awb) return `${placed} <span style="color:#6b7280;font-weight:400">(AWB ${T.awb.l}×${T.awb.w})</span>`
  return placed
}

function renderPage(plan: Plan, u: PlanUnit, pageIndex: number, pageTotal: number): string {
  const A: UnitAnalysis = analyse(u)
  const V = renderViews(u, A)

  const groups = Object.entries(u.types)
    .map(([k, T]) => {
      const nos = A.its.filter((i) => i.t === k).map((i) => i.n)
      const n = nos.length
      return { k, T, n, kg: n * T.kgEach, nos }
    })
    .filter((g) => g.n > 0)

  const lvlTxt = { ok: 'OK', warn: 'Kontrollér', bad: 'Kritisk' }[A.cogLevel]
  const seqCols = A.its.length > 18 ? 'seq cols3' : 'seq'
  const defaultNotes = [
    'Alt gods surres iht. EN 12195-1.',
    A.weightLimited
      ? `Vægtbegrænset last: gulv brugt ${fmt(A.ldmFloor, 1)} m, opkrævet ${fmt(A.ldmCharged, 1)} LDM.`
      : '',
  ].filter(Boolean)
  const notes = (plan.notes?.length ? plan.notes : defaultNotes).filter(Boolean)

  return `<section class="page">
  <header class="hdr">
    <div class="logo">NOR<small>SPEDITION</small></div>
    <div>
      <h1>Lasteplan</h1>
      <div class="sub">${plan.company.name} · ${plan.company.system} · ${plan.company.email}</div>
    </div>
    <div class="unit">
      <div class="big">Bil ${u.index}/${u.total}</div>
      <div class="sub">${u.name} · ${fmt(u.L)}×${fmt(u.W)}×${fmt(u.H)} cm</div>
    </div>
  </header>

  <div class="meta">
    <div><b>Reference</b><span>${escapeHtml(plan.ref)}</span></div>
    <div><b>Kunde</b><span>${escapeHtml(plan.customer)}</span></div>
    <div><b>Rute</b><span>${escapeHtml(plan.route)}</span></div>
    <div><b>Læssedato</b><span>${fmtDateOnly(plan.loadDate)}</span></div>
  </div>

  <div class="kpis">
    <div class="kpi">
      <b>Vægt</b>
      <div class="v">${fmt(A.kg)} kg</div>
      <div class="s">af ${fmt(u.payload)} kg · ${fmt(A.wPct)}%</div>
      <div class="bar"><i class="${barCls(A.wPct)}" style="width:${Math.min(A.wPct, 100)}%"></i></div>
    </div>
    <div class="kpi">
      <b>Volumen</b>
      <div class="v">${fmt(A.vol / 1e6, 1)} m³</div>
      <div class="s">af ${fmt((u.L * u.W * u.H) / 1e6, 1)} m³ · ${fmt(A.vPct)}%</div>
      <div class="bar"><i style="width:${Math.min(A.vPct, 100)}%"></i></div>
    </div>
    <div class="kpi">
      <b>Ladmeter</b>
      <div class="v">${fmt(A.ldmCharged, 1)} LDM</div>
      <div class="s">gulv brugt ${fmt(A.ldmFloor, 1)} m</div>
      ${A.weightLimited ? '<span class="tag">Vægtbegrænset</span>' : ''}
    </div>
    <div class="kpi">
      <b>Kolli</b>
      <div class="v">${A.its.length}</div>
      <div class="s">${groups.length} varetyper</div>
    </div>
    <div class="kpi">
      <b>Tyngdepunkt</b>
      <div class="v">${fmt(A.cog.x / 100, 2)} m</div>
      <div class="s">fra front · side ${A.offY >= 0 ? '+' : ''}${fmt(A.offY, 1)}%</div>
      <span class="tag ${A.cogLevel === 'ok' ? 'ok' : ''}">${lvlTxt}</span>
    </div>
  </div>

  <div class="views">
    <div class="view"><h2>Set ovenfra</h2>${V.top}</div>
    <div class="view"><h2>Set fra siden</h2>${V.side}</div>
  </div>

  <div>
    <h2>Godsliste</h2>
    <table>
      <thead>
        <tr>
          <th></th><th>Varetype</th><th class="n">L×B×H cm</th>
          <th class="n">Antal</th><th class="n">Kg/stk</th><th class="n">Kg i alt</th>
          <th>Kolli-nr.</th><th>Håndtering</th>
        </tr>
      </thead>
      <tbody>
        ${groups
          .map(
            (g) => `<tr>
          <td><span class="sw" style="background:${g.T.color}"></span><b>${g.k}</b></td>
          <td>${escapeHtml(g.T.name)}</td>
          <td class="n">${dimsLabel(g.T)}</td>
          <td class="n">${g.n}</td>
          <td class="n">${fmt(g.T.kgEach)}</td>
          <td class="n">${fmt(g.kg)}</td>
          <td>${formatRanges(g.nos)}</td>
          <td class="flags">${g.T.flags.map((f) => `<span>${escapeHtml(f)}</span>`).join('')}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr>
          <td></td><td>I alt</td><td></td>
          <td class="n">${A.its.length}</td><td></td>
          <td class="n">${fmt(A.kg)}</td><td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="two">
    <div>
      <h2>Læsserækkefølge (front → døre)</h2>
      <ol class="${seqCols}">
        ${A.its
          .map((i) => {
            const side = sideLabel(i, u.W)
            return `<li>
            <span class="no">${i.n}</span>
            <span class="sw" style="background:${i.T.color}"></span>
            ${escapeHtml(i.T.name)}
            <span style="margin-left:auto;color:var(--muted)">${fmt(i.x / 100, 2)} m · ${side}</span>
          </li>`
          })
          .join('')}
      </ol>
    </div>
    <div class="notes">
      <h2>Bemærkninger</h2>
      ${notes.map((n) => `<p>${escapeHtml(n)}</p>`).join('')}
      <div class="sign"><div>Læsset af / dato</div><div>Chauffør / dato</div></div>
    </div>
  </div>

  <footer class="ftr">
    <span>${escapeHtml(plan.ref)} · Bil ${u.index}/${u.total}</span>
    <span>Udskrevet ${fmtDateTime(plan.created)}</span>
    <span>Side ${pageIndex} af ${pageTotal}</span>
  </footer>
</section>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Full printable HTML document — one A4 section per unit. */
export function renderPlanDocument(plan: Plan): string {
  const pages = plan.units.map((u, i) =>
    renderPage(plan, u, i + 1, plan.units.length),
  )
  return `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<title>Lasteplan ${escapeHtml(plan.ref)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style>
</head>
<body>
<div class="toolbar no-print">
  <span>Lasteplan ${escapeHtml(plan.ref)} — ${plan.units.length} bil${plan.units.length === 1 ? '' : 'er'}</span>
  <button type="button" onclick="window.print()">Udskriv / gem som PDF</button>
</div>
${pages.join('\n')}
</body>
</html>`
}
