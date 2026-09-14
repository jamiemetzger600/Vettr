import { useMemo, useState } from 'react';
import { formatMoney } from '../../utils/normalizeDeal';
import { getSavedDealCalculatorSummary } from '../../utils/savedDealCalculatorSummary';
import { getCalculatorDefaultsFromSettings } from '../../utils/calculatorDefaultsFromSettings';
import { sbaReadinessScore } from '../../utils/sbaReadiness';

function metric(deal, defaults) {
  const summary = getSavedDealCalculatorSummary(deal, defaults) || {};
  const sba = sbaReadinessScore(deal);
  return {
    id: deal.id,
    name: deal.name || 'Untitled',
    askingPrice: deal.askingPrice,
    ebitda: deal.ebitda,
    coc: summary.cocReturn,
    dscr: summary.dscr,
    payback: summary.paybackYears,
    sba: sba.score
  };
}

export default function CrmCompareDeals({ deals = [], settings = null, onSelectDeal }) {
  const defaults = useMemo(() => getCalculatorDefaultsFromSettings(settings), [settings]);
  const [picked, setPicked] = useState([]);

  const toggle = (id) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const rows = picked
    .map((id) => deals.find((d) => String(d.id) === String(id)))
    .filter(Boolean)
    .map((d) => metric(d, defaults));

  const fmtPct = (n) => (n != null && Number.isFinite(n) ? `${n.toFixed(1)}%` : '—');
  const fmtN = (n) => (n != null && Number.isFinite(n) ? n.toFixed(2) : '—');

  return (
    <div className="crm-compare">
      <h2>Compare deals</h2>
      <p className="crm-muted">Pick 2–3 saved deals. Compare asking price, CoC, DSCR, and payback.</p>
      <ul className="crm-compare__picks">
        {deals.slice(0, 80).map((d) => (
          <li key={d.id}>
            <label>
              <input
                type="checkbox"
                checked={picked.includes(d.id)}
                onChange={() => toggle(d.id)}
                disabled={!picked.includes(d.id) && picked.length >= 3}
              />
              {d.name || 'Untitled'}
            </label>
          </li>
        ))}
      </ul>
      {rows.length >= 2 ? (
        <div className="crm-compare__table-wrap">
          <table className="crm-compare__table">
            <thead>
              <tr>
                <th>Metric</th>
                {rows.map((r) => (
                  <th key={r.id}>
                    <button type="button" className="crm-compare__open" onClick={() => onSelectDeal?.(r.id)}>
                      {r.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Asking</th>
                {rows.map((r) => <td key={r.id}>{formatMoney(r.askingPrice)}</td>)}
              </tr>
              <tr>
                <th>EBITDA</th>
                {rows.map((r) => <td key={r.id}>{formatMoney(r.ebitda)}</td>)}
              </tr>
              <tr>
                <th>CoC</th>
                {rows.map((r) => <td key={r.id}>{fmtPct(r.coc)}</td>)}
              </tr>
              <tr>
                <th>DSCR</th>
                {rows.map((r) => <td key={r.id}>{fmtN(r.dscr)}</td>)}
              </tr>
              <tr>
                <th>Payback (yrs)</th>
                {rows.map((r) => <td key={r.id}>{fmtN(r.payback)}</td>)}
              </tr>
              <tr>
                <th>SBA score</th>
                {rows.map((r) => <td key={r.id}>{r.sba}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="crm-muted">Select at least two deals to compare.</p>
      )}
    </div>
  );
}
