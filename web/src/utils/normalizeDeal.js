/**
 * Normalizes saved deal data from API (snake_case) to frontend format (camelCase)
 * Maps legacy status values to extension-compatible status values
 */

import { displayStageLabel } from './pipelineStages.js';
const STATUS_MAP = {
  'new': 'none',
  'reviewing': 'warm',
  'contacted': 'warm',
  'due-diligence': 'hot',
  'offer': 'hot',
  'passed': 'pass',
  'hot': 'hot',
  'warm': 'warm',
  'cold': 'cold',
  'pass': 'pass',
  'none': 'none'
};

export function normalizeDeal(deal) {
  if (!deal) return null;

  return {
    // Identity
    id: deal.id,
    vettrId: deal.id,
    dealId: deal.deal_id || deal.dealId,
    marketDealId: deal.market_deal_id ?? deal.marketDealId ?? null,
    teamId: deal.team_id ?? deal.teamId ?? null,
    listingSnapshotAt: deal.listing_snapshot_at || deal.listingSnapshotAt,
    
    // Basic info
    name: deal.name,
    url: deal.url,
    description: deal.description,
    
    // Broker info
    broker: deal.broker,
    brokerName: deal.broker_name || deal.brokerName,
    brokerCompany: deal.broker_company || deal.brokerCompany,
    brokerEmail: deal.broker_email || deal.brokerEmail,
    brokerPhone: deal.broker_phone || deal.brokerPhone,
    
    // Source info
    source: deal.source,
    sourceType: deal.source_type || deal.sourceType,
    listingId: deal.listing_id || deal.listingId,
    
    // Dates
    discoveredAt: deal.discovered_at || deal.discoveredAt,
    savedAt: deal.saved_at || deal.savedAt,
    updatedAt: deal.updated_at || deal.updatedAt,
    
    // Financial data
    askingPrice: deal.asking_price ?? deal.askingPrice,
    ebitda: deal.ebitda,
    revenue: deal.revenue,
    
    // Location
    location: deal.location,
    city: deal.city,
    state: deal.state,
    county: deal.county,
    country: deal.country,
    
    // Business details
    industry: deal.industry,
    yearsEstablished: deal.years_established || deal.yearsEstablished,
    franchise: deal.franchise,
    remote: deal.remote,
    
    // Status and tracking
    status: normalizeStatus(deal.status),
    notes: deal.notes || '',
    progressStage: deal.progress_stage || deal.progressStage,
    progressHistory: parseProgressHistory(deal.progress_history || deal.progressHistory),

    calculatorState: parseCalculatorState(deal.calculator_state ?? deal.calculatorState),

    ownerUserId: deal.owner_user_id ?? deal.ownerUserId ?? null,
    closeTargetDate: deal.close_target_date || deal.closeTargetDate || null,
    referralSource: deal.referral_source || deal.referralSource || null,
    externalSourceType: deal.external_source_type || deal.externalSourceType || null,
    tags: Array.isArray(deal.tags) ? deal.tags : (deal.tags ? [].concat(deal.tags) : []),
    customStageLabel: deal.custom_stage_label || deal.customStageLabel || null,
    unseenFromTeam: Boolean(deal.unseen_from_team ?? deal.unseenFromTeam),
    
    // Computed fields (if available)
    qualityScore: deal.quality_score || deal.qualityScore,
    cocReturn: deal.coc_return || deal.cocReturn
  };
}

export function normalizeStatus(status) {
  if (!status) return 'none';
  return STATUS_MAP[status.toLowerCase()] || 'none';
}

export function denormalizeStatus(status) {
  // For API calls, keep the normalized status (extension format)
  return status;
}

function parseCalculatorState(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return typeof v === 'object' && v !== null ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseProgressHistory(history) {
  if (!history) return [];
  if (Array.isArray(history)) return history;
  if (typeof history === 'string') {
    try {
      return JSON.parse(history);
    } catch (e) {
      return [];
    }
  }
  return [];
}

export function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

export function formatMoney(value) {
  if (!value || value === 0) return '$0';
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${Math.round(value).toLocaleString()}`;
}

export function getStatusBadgeClass(status) {
  const classes = {
    'hot': 'hot',
    'warm': 'warm',
    'cold': 'cold',
    'pass': 'pass',
    'none': 'none'
  };
  return classes[status] || 'none';
}

export function getStatusLabel(status) {
  const labels = {
    'hot': 'Hot',
    'warm': 'Warm',
    'cold': 'Cold',
    'pass': 'Pass',
    'none': '—'
  };
  return labels[status] || '—';
}

/** Pipeline label for My Deals: latest progress history entry, else saved `progressStage`. */
export function getDealProgressLabel(deal) {
  if (!deal) return '';
  let stage = '';
  const h = deal.progressHistory;
  if (Array.isArray(h) && h.length > 0) {
    const last = h[h.length - 1];
    if (last?.stage != null && String(last.stage).trim()) stage = String(last.stage).trim();
  }
  if (!stage) {
    const p = deal.progressStage;
    if (p != null && String(p).trim()) stage = String(p).trim();
  }
  if (!stage) return '';
  return displayStageLabel(stage, deal.customStageLabel || deal.custom_stage_label);
}

/** True when the deal is marked Passed On (archived from Cards). */
export function isPassedOnDeal(deal) {
  const stage = String(getDealProgressLabel(deal) || deal?.progressStage || '').trim();
  return stage === 'Passed On Deal' || /^passed on/i.test(stage);
}
