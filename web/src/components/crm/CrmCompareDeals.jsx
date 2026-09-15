import { useMemo, useRef, useState } from 'react';
import { formatMoney, isPassedOnDeal, normalizeDeal } from '../../utils/normalizeDeal';
import { getSavedDealCalculatorSummary } from '../../utils/savedDealCalculatorSummary';
import { getCalculatorDefaultsFromSettings } from '../../utils/calculatorDefaultsFromSettings';
import { formatRatio, profitMultipleTier } from '../../utils/dealCardDisplay';
import { sbaReadinessScore } from '../../utils/sbaReadiness';
import {
  bestDealIndices,
  cocTier,
  dealMatchesCompareId,
  parseCompareIds,
  paybackTier,
  serializeCompareIds
} from '../../utils/dealCompare';
import {
  captureElementPdf,
  captureElementPng,
  copyText,
  downloadBlob,
  mailtoCompare,
  nativeShare
} from '../../utils/shareCapture';

const MAX_COMPARE = 3;

function formatPct(n) {
  return n != null && Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
}

function formatPayback(n) {
  return n > 0 && n < 100 ? `${n.toFixed(1)} yrs` : '—';
}

function formatFcf(n) {
  return n != null && Number.isFinite(n) ? formatMoney(n) : '—';
}

function dealMultiple(deal, asking, ebitda) {
  const listed = Number(deal?.profitMultiple);
  if (Number.isFinite(listed) && listed > 0) return listed;
  if (Number(asking) > 0 && Number(ebitda) > 0) return Number(asking) / Number(ebitda);
  return null;
}

function metric(deal, defaults) {
  const summary = getSavedDealCalculatorSummary(deal, defaults) || {};
  const asking = summary.askingPrice ?? deal.askingPrice;
  const ebitda = summary.ebitda ?? deal.ebitda;
  const multiple = dealMultiple(deal, asking, ebitda);
  const sba = sbaReadinessScore(deal);
  return {
    id: deal.id,
    name: deal.name || 'Untitled',
    askingPrice: asking,
    ebitda,
    multiple,
    coc: summary.cocReturn,
    dscr: summary.dscr,
    payback: summary.paybackYears,
    freeCashFlow: summary.freeCashFlow,
    qualityScore: summary.qualityScore,
    sba: sba.score
  };
}

function stampFilename(ext) {
  const day = new Date().toISOString().slice(0, 10);
  return `vettr-deal-compare-${day}.${ext}`;
}

export default function CrmCompareDeals({
  deals = [],
  settings = null,
  onSelectDeal,
  initialCompareIds = [],
  onCompareIdsChange = null
}) {
  const defaults = useMemo(() => getCalculatorDefaultsFromSettings(settings), [settings]);
  const captureRef = useRef(null);
  const [query, setQuery] = useState('');
  const picked = parseCompareIds(initialCompareIds);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [sharing, setSharing] = useState(false);

  const activeDeals = useMemo(
    () => (Array.isArray(deals) ? deals.map(normalizeDeal).filter((d) => d?.id && !isPassedOnDeal(d)) : []),
    [deals]
  );

  const toggle = (id) => {
    let next;
    if (picked.some((x) => String(x) === String(id))) {
      next = picked.filter((x) => String(x) !== String(id));
    } else if (picked.length >= MAX_COMPARE) {
      next = picked;
    } else {
      next = [...picked, id];
    }
    console.log('[CrmCompareDeals] toggle', id, next);
    onCompareIdsChange?.(next);
  };

  const rows = picked
    .map((id) => activeDeals.find((d) => dealMatchesCompareId(d, id)))
    .filter(Boolean)
    .map((d) => metric(d, defaults));

  const best = useMemo(() => bestDealIndices(rows), [rows]);
  const q = query.trim().toLowerCase();
  const chooser = activeDeals.filter((d) => {
    if (!q) return true;
    return String(d.name || '').toLowerCase().includes(q);
  });

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?tab=crm&crmSubview=compare&compareIds=${serializeCompareIds(picked)}`
    : '';

  const runShare = async (kind) => {
    if (rows.length < 2) return;
    setSharing(true);
    setShareStatus('');
    try {
      const el = captureRef.current;
      const title = 'Vettr deal compare';
      const text = rows.map((r) => r.name).join(' vs ');
      if (kind === 'link') {
        await copyText(shareUrl);
        setShareStatus('Link copied');
        return;
      }
      if (kind === 'email') {
        mailtoCompare({
          subject: title,
          body: `${text}\n\n${shareUrl}`
        });
        setShareStatus('Opened email');
        return;
      }
      if (kind === 'native') {
        let files;
        try {
          const png = await captureElementPng(el);
          files = [new File([png.blob], stampFilename('png'), { type: 'image/png' })];
        } catch (err) {
          console.warn('[CrmCompareDeals] capture for native share failed', err);
        }
        const ok = await nativeShare({ title, text, url: shareUrl, files });
        setShareStatus(ok ? 'Shared' : 'Share sheet unavailable — copy the link or download PNG/PDF');
        return;
      }
      if (kind === 'png') {
        const png = await captureElementPng(el);
        const file = new File([png.blob], stampFilename('png'), { type: 'image/png' });
        const shared = await nativeShare({ title, text, url: shareUrl, files: [file] });
        if (!shared) downloadBlob(png.blob, file.name);
        setShareStatus(shared ? 'Shared PNG' : 'Downloaded PNG');
        return;
      }
      if (kind === 'pdf') {
        const pdf = await captureElementPdf(el);
        const file = new File([pdf], stampFilename('pdf'), { type: 'application/pdf' });
        const shared = await nativeShare({ title, text, url: shareUrl, files: [file] });
        if (!shared) downloadBlob(pdf, file.name);
        setShareStatus(shared ? 'Shared PDF' : 'Downloaded PDF');
      }
    } catch (err) {
      console.error('[CrmCompareDeals] share failed', err);
      setShareStatus(err.message || 'Share failed');
    } finally {
      setSharing(false);
      setShareOpen(false);
    }
  };

  return (
    <div className="crm-compare">
      <div className="crm-compare__head">
        <div>
          <h2>Compare deals</h2>
          <p className="crm-muted">
            Pick 2–3 saved deals. Archived (passed on) deals stay out. Best ROI is the highest cash-on-cash.
          </p>
        </div>
        {rows.length >= 2 ? (
          <div className="crm-compare__share">
            <button
              type="button"
              className="btn-secondary"
              aria-expanded={shareOpen}
              disabled={sharing}
              onClick={() => setShareOpen((open) => !open)}
            >
              {sharing ? 'Sharing…' : 'Share'}
            </button>
            {shareOpen ? (
              <div className="crm-compare__share-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => runShare('native')}>
                  AirDrop, Messages, Email…
                </button>
                <button type="button" role="menuitem" onClick={() => runShare('png')}>
                  PNG
                </button>
                <button type="button" role="menuitem" onClick={() => runShare('pdf')}>
                  PDF
                </button>
                <button type="button" role="menuitem" onClick={() => runShare('link')}>
                  Copy link
                </button>
                <button type="button" role="menuitem" onClick={() => runShare('email')}>
                  Email link
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {shareStatus ? <p className="crm-compare__share-status">{shareStatus}</p> : null}

      {picked.length > 0 ? (
        <ul className="crm-compare__chips">
          {picked.map((id) => {
            const deal = activeDeals.find((d) => dealMatchesCompareId(d, id));
            return (
              <li key={id}>
                <button type="button" className="crm-chip" onClick={() => toggle(id)}>
                  {(deal?.name || `Deal ${id}`)} ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <label className="crm-compare__search">
        <input
          type="search"
          className="modal-input"
          placeholder="Search saved deals…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search saved deals to compare"
        />
      </label>
      <ul className="crm-compare__picks">
        {chooser.length === 0 ? (
          <li className="crm-muted">No saved deals match. Archive is hidden from compare.</li>
        ) : (
          chooser.slice(0, 60).map((d) => {
            const on = picked.some((id) => dealMatchesCompareId(d, id));
            const full = !on && picked.length >= MAX_COMPARE;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className={`crm-compare__pick${on ? ' crm-compare__pick--on' : ''}`}
                  disabled={full}
                  onClick={() => toggle(d.id)}
                >
                  <span>{d.name || 'Untitled'}</span>
                  <span className="crm-muted">{formatMoney(d.askingPrice)}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      {rows.length >= 2 ? (
        <div className="crm-compare__capture" ref={captureRef}>
          <div className="crm-compare__capture-kicker">Vettr deal compare</div>
          <div className="calc-scenario-compare" role="region" aria-label="Deal comparison">
            <table className="calc-scenario-compare-table">
              <thead>
                <tr>
                  <th scope="col" className="calc-scenario-compare-metric-head" />
                  {rows.map((row, index) => {
                    const isBest = best.has(index);
                    return (
                      <th
                        key={row.id}
                        scope="col"
                        className={isBest ? 'calc-scenario-compare-col--best' : undefined}
                      >
                        <button
                          type="button"
                          className="crm-compare__open"
                          onClick={() => onSelectDeal?.(row.id)}
                        >
                          <span className="calc-scenario-compare-col-label">{row.name}</span>
                        </button>
                        {isBest ? <span className="calc-scenario-best-pill">Best ROI</span> : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="calc-scenario-compare-metric-label">Cash-on-Cash</th>
                  {rows.map((row, index) => (
                    <td
                      key={`coc-${row.id}`}
                      className={`${best.has(index) ? 'calc-scenario-compare-col--best' : ''} calc-compare-coc calc-coc-value`.trim()}
                      data-tier={cocTier(row.coc) || undefined}
                    >
                      {formatPct(row.coc)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="calc-scenario-compare-metric-label">Payback</th>
                  {rows.map((row, index) => (
                    <td
                      key={`pb-${row.id}`}
                      className={`${best.has(index) ? 'calc-scenario-compare-col--best' : ''} calc-compare-payback calc-payback-value`.trim()}
                      data-tier={paybackTier(row.payback) || undefined}
                    >
                      {formatPayback(row.payback)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="calc-scenario-compare-metric-label">Free Cash Flow</th>
                  {rows.map((row, index) => (
                    <td
                      key={`fcf-${row.id}`}
                      className={best.has(index) ? 'calc-scenario-compare-col--best' : undefined}
                    >
                      {formatFcf(row.freeCashFlow)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="calc-scenario-compare-metric-label">Asking</th>
                  {rows.map((row, index) => (
                    <td key={`ask-${row.id}`} className={best.has(index) ? 'calc-scenario-compare-col--best' : undefined}>
                      {formatMoney(row.askingPrice)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="calc-scenario-compare-metric-label">EBITDA</th>
                  {rows.map((row, index) => (
                    <td key={`eb-${row.id}`} className={best.has(index) ? 'calc-scenario-compare-col--best' : undefined}>
                      {formatMoney(row.ebitda)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="calc-scenario-compare-metric-label">Multiple</th>
                  {rows.map((row, index) => {
                    const ok = row.multiple != null && Number.isFinite(row.multiple);
                    return (
                      <td
                        key={`mult-${row.id}`}
                        className={best.has(index) ? 'calc-scenario-compare-col--best' : undefined}
                        data-tier={ok ? profitMultipleTier(row.multiple) : undefined}
                      >
                        {ok ? `${formatRatio(row.multiple)}X` : '—'}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <th scope="row" className="calc-scenario-compare-metric-label">DSCR</th>
                  {rows.map((row, index) => (
                    <td key={`dscr-${row.id}`} className={best.has(index) ? 'calc-scenario-compare-col--best' : undefined}>
                      {row.dscr != null && Number.isFinite(row.dscr) ? `${row.dscr.toFixed(2)}x` : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="calc-scenario-compare-metric-label">Quality</th>
                  {rows.map((row, index) => (
                    <td key={`q-${row.id}`} className={best.has(index) ? 'calc-scenario-compare-col--best' : undefined}>
                      {row.qualityScore != null ? row.qualityScore : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="calc-scenario-compare-metric-label">SBA score</th>
                  {rows.map((row, index) => (
                    <td key={`sba-${row.id}`} className={best.has(index) ? 'calc-scenario-compare-col--best' : undefined}>
                      {row.sba}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="crm-muted">Select at least two saved deals to compare.</p>
      )}
    </div>
  );
}
