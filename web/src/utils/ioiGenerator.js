import { analyzeDealScenario, resolveSellerNoteTermYears, resolveSellerStandbyYears } from './dealCalculatorMath';

export const DEFAULT_IOI_TIMELINE = '30-45 days from accepted offer';

const EMAIL_IN_TEXT = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function firstEmailInText(value) {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  if (!s) return '';
  const mailto = s.match(/^mailto:([^?]+)/i);
  const haystack = mailto ? mailto[1] : s;
  const m = haystack.match(EMAIL_IN_TEXT);
  return m ? m[0] : '';
}

/** Prefer explicit broker fields; fall back to first email found in contact / description text. */
export function getBrokerEmailFromDeal(deal) {
  if (!deal) return '';

  const explicitFields = [
    deal.brokerEmail,
    deal.broker_email,
    deal.listingBrokerEmail,
    deal.listing_broker_email,
    deal.contactEmail,
    deal.contact_email
  ];
  for (const c of explicitFields) {
    const email = firstEmailInText(c);
    if (email) return email;
  }

  const textFields = [
    deal.brokerPhone,
    deal.broker_contact,
    deal.brokerContact,
    deal.contact,
    deal.broker,
    deal.brokerName,
    deal.broker_name,
    deal.brokerCompany,
    deal.broker_company,
    deal.description
  ];
  for (const field of textFields) {
    const email = firstEmailInText(field);
    if (email) return email;
  }

  return '';
}

/** Stable keys so broker email / closing notes / scenario picks persist per listing. */
export function ioiDealKeys(deal) {
  if (!deal) return [];
  const keys = [];
  const add = (value) => {
    const key = String(value || '').trim();
    if (key && !keys.includes(key)) keys.push(key);
  };
  if (deal.dbId != null && String(deal.dbId).trim() !== '') add(`md:${deal.dbId}`);
  if (deal.savedDealId != null && String(deal.savedDealId).trim() !== '') add(`sd:${deal.savedDealId}`);
  if (deal.id != null && String(deal.id).trim() !== '') add(String(deal.id));
  return keys;
}

export function ioiDealKey(deal) {
  return ioiDealKeys(deal)[0] || '';
}

function fmt(value) {
  if (value == null || Number.isNaN(value)) return '$0';
  return `$${Math.round(value).toLocaleString()}`;
}

function pct(value) {
  const n = parseFloat(value);
  if (!n || Number.isNaN(n)) return '0%';
  return `${n}%`;
}

/**
 * Principal + interest the seller collects on the note over the full term.
 * Interest-only: interest accrues each year; principal is repaid at maturity.
 * Amortizing: fully amortizing monthly payments over `years`.
 * annualPrincipal / annualInterest are averages (total / years) so they sum to the annual payment.
 */
export function sellerNoteLifetime(principal, rateDecimal, years, paymentType) {
  const P = Number(principal) || 0;
  const nYears = Number(years) || 0;
  const empty = {
    interest: 0,
    totalFromNote: 0,
    years: nYears,
    annualPrincipal: 0,
    annualInterest: 0
  };
  if (P <= 0 || nYears <= 0) return empty;
  if (paymentType === 'interest-only') {
    const interest = P * (Number(rateDecimal) || 0) * nYears;
    return {
      interest,
      totalFromNote: P + interest,
      years: nYears,
      annualPrincipal: 0,
      annualInterest: interest / nYears
    };
  }
  const n = Math.round(nYears * 12);
  if (!rateDecimal || rateDecimal <= 0) {
    return {
      interest: 0,
      totalFromNote: P,
      years: nYears,
      annualPrincipal: P / nYears,
      annualInterest: 0
    };
  }
  const r = rateDecimal / 12;
  const monthly = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const totalPayments = monthly * n;
  const interest = totalPayments - P;
  return {
    interest,
    totalFromNote: totalPayments,
    years: nYears,
    annualPrincipal: P / nYears,
    annualInterest: interest / nYears
  };
}

export function generateIOISubject(deal) {
  return `Indication of Interest - ${deal.name || 'Business Acquisition'}`;
}

/**
 * Build a single scenario block for the IOI body.
 * `scenario` is the raw scenario object, `analysis` is the analyzeDealScenario result.
 */
function buildScenarioBlock(scenario, analysis, label) {
  const fin = analysis.fin;
  const lines = [];
  const hasSellerNote = Boolean(fin.sellerEnabled && analysis.sellerNoteAmt > 0);
  const receivedAtClose = analysis.purchasePrice - (hasSellerNote ? analysis.sellerNoteAmt : 0);

  lines.push(`--- ${label} ---`);
  lines.push(`Total Consideration: ${fmt(analysis.purchasePrice)}`);
  lines.push(`Total Received at Close: ${fmt(receivedAtClose)}`);

  if (hasSellerNote) {
    lines.push(`(Seller note of ${fmt(analysis.sellerNoteAmt)} is not paid at close)`);
  }

  lines.push(`SBA Loan (${pct(fin.sbaPercent)}): ${fmt(analysis.sbaLoanSize)}`);
  lines.push(`Buyer Equity (${pct(fin.equityPercent)}): ${fmt(analysis.equityAmount)}`);

  if (hasSellerNote) {
    const termYears = resolveSellerNoteTermYears(scenario);
    const rateDisplay = (fin.sellerRate * 100).toFixed(1);
    const standbyYears = resolveSellerStandbyYears(scenario, termYears);
    const standbyNote = fin.sellerStandby === 'yes'
      ? (standbyYears > 0 ? ` (${standbyYears}-year standby)` : ' (full standby)')
      : '';
    const lifetime = sellerNoteLifetime(
      analysis.sellerNoteAmt,
      fin.sellerRate,
      termYears,
      fin.sellerPaymentType
    );
    const totalReceived = receivedAtClose + lifetime.totalFromNote;
    const isAmortizing = fin.sellerPaymentType !== 'interest-only';
    lines.push(`Seller Note (${pct(fin.sellerPercent)}): ${fmt(analysis.sellerNoteAmt)} at ${rateDisplay}% - ${fin.sellerPaymentType}, ${termYears} year term${standbyNote}`);
    if (isAmortizing) {
      lines.push(`Total Annual Payment: Principal ${fmt(lifetime.annualPrincipal)} / Interest ${fmt(lifetime.annualInterest)}`);
    } else {
      lines.push(`Interest over ${termYears} years: ${fmt(lifetime.interest)} (${fmt(lifetime.annualInterest)}/year)`);
    }
    lines.push(`Total Received (at close + note principal + interest): ${fmt(totalReceived)}`);
    console.log('[IOI] seller note totals', {
      consideration: analysis.purchasePrice,
      receivedAtClose,
      notePrincipal: analysis.sellerNoteAmt,
      termYears,
      paymentType: fin.sellerPaymentType,
      annualPrincipal: Math.round(lifetime.annualPrincipal),
      annualInterest: Math.round(lifetime.annualInterest),
      totalReceived: Math.round(totalReceived)
    });
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Generate the full IOI email body text.
 * @param {object} opts
 * @param {object} opts.deal - deal object with name, brokerName, etc.
 * @param {Array}  opts.scenarios - array of raw scenario objects
 * @param {Array}  opts.selectedIndices - which scenario indices to include (0-based)
 * @param {object} opts.qualityPrefs - { targetCOC, targetPayback } for analysis
 * @param {string} opts.timeline - timeline to close text
 * @param {string} opts.closingNotes - user's custom closing paragraph
 * @param {string} opts.signature - user's signature
 * @param {string} opts.companyName - buyer company (optional)
 */
export function generateIOIText({
  deal,
  scenarios,
  selectedIndices,
  qualityPrefs = {},
  timeline = '30-45 days from accepted offer',
  closingNotes = '',
  signature = '',
  companyName = ''
}) {
  const brokerName = deal.brokerName || deal.broker || 'Broker';
  const dealName = deal.name || 'the business';

  const lines = [];
  lines.push(`Dear ${brokerName},`);
  lines.push('');

  if (selectedIndices.length === 1) {
    lines.push(`I am writing to express my interest in acquiring ${dealName}. After reviewing the listing and financials, I would like to present the following deal structure for your consideration:`);
  } else {
    lines.push(`I am writing to express my interest in acquiring ${dealName}. After reviewing the listing and financials, I would like to present the following deal structures for your consideration:`);
  }
  lines.push('');

  selectedIndices.forEach((idx, i) => {
    const scenario = scenarios[idx];
    if (!scenario) return;
    const analysis = analyzeDealScenario(scenario, qualityPrefs);
    const label = selectedIndices.length === 1
      ? 'Proposed Deal Structure'
      : `Structure ${i + 1}`;
    lines.push(buildScenarioBlock(scenario, analysis, label));
  });

  lines.push(`Timeline to Close: ${timeline}`);
  lines.push('');

  if (closingNotes.trim()) {
    lines.push(closingNotes.trim());
    lines.push('');
  }

  lines.push('Best regards,');
  if (signature.trim()) {
    lines.push(signature.trim());
  }
  if (companyName.trim()) {
    lines.push(companyName.trim());
  }

  return lines.join('\n');
}
