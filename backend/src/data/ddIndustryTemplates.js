/**
 * Industry DD packs: Generic base + researched vertical overlays.
 * Wave 2 ships: generic, restaurant, healthcare, saas, services.
 * Other keys are matched but fall back to generic until their packs land.
 */
import { BUSINESS_ACQUISITION_DD_TEMPLATE } from './ddBusinessTemplate.js';

/** @typedef {{ title: string, requestsDocument?: boolean, description?: string }} DdItemDef */
/** @typedef {{ name: string, items: DdItemDef[] }} DdGroupDef */
/** @typedef {{ industryKey: string, name: string, assetType?: string, groups: DdGroupDef[] }} DdTemplateDef */

/** Append-only overlays: same group name merges items; new names add groups. */
const OVERLAYS = {
  restaurant: {
    industryKey: 'restaurant',
    name: 'Restaurant / Food Service DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'Food cost % and COGS by period (12–24 months)', requestsDocument: true },
          { title: 'Sales by daypart / category (POS reports)', requestsDocument: true },
          { title: 'Tip pooling / payroll tax compliance summary', requestsDocument: false }
        ]
      },
      {
        name: 'Licenses & Permits',
        items: [
          { title: 'Health department permit and latest inspection', requestsDocument: true },
          { title: 'Liquor license status and transferability', requestsDocument: true },
          { title: 'Business / occupancy / fire permits', requestsDocument: true }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'POS system and transfer/export plan', requestsDocument: false },
          { title: 'Food distributor / supplier contracts', requestsDocument: true },
          { title: 'Hood / grease trap / pest control contracts', requestsDocument: true }
        ]
      },
      {
        name: 'Real Estate & Facilities',
        items: [
          { title: 'Lease assignment / landlord consent requirements', requestsDocument: true },
          { title: 'Kitchen equipment owned vs leased schedule', requestsDocument: true }
        ]
      }
    ]
  },
  healthcare: {
    industryKey: 'healthcare',
    name: 'Healthcare / Dental / MedSpa DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'Payer mix and top payer contracts', requestsDocument: true },
          { title: 'Collections / AR by payer aging', requestsDocument: true },
          { title: 'Provider production reports (if applicable)', requestsDocument: true }
        ]
      },
      {
        name: 'Regulatory & Compliance',
        items: [
          { title: 'State / board licenses for practice and providers', requestsDocument: true },
          { title: 'HIPAA policies and BAA inventory', requestsDocument: true },
          { title: 'DEA / controlled substance licenses (if Rx)', requestsDocument: true },
          { title: 'Credentialing / payer enrollment status', requestsDocument: true }
        ]
      },
      {
        name: 'Insurance',
        items: [
          { title: 'Malpractice / professional liability and claims history', requestsDocument: true }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'EHR / practice management system and data export plan', requestsDocument: true },
          { title: 'Patient records transfer protocol', requestsDocument: false }
        ]
      },
      {
        name: 'HR & Benefits',
        items: [
          { title: 'Associate / provider employment and non-compete agreements', requestsDocument: true }
        ]
      }
    ]
  },
  saas: {
    industryKey: 'saas',
    name: 'SaaS / Software DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'ARR / MRR bridge and cohort retention', requestsDocument: true },
          { title: 'Churn, NRR, and logo vs revenue retention', requestsDocument: true },
          { title: 'Deferred revenue / contract liability schedule', requestsDocument: true }
        ]
      },
      {
        name: 'Customer & Revenue',
        items: [
          { title: 'Top customers, concentration, and renewal calendar', requestsDocument: true },
          { title: 'Sample MSA / SLA / order forms', requestsDocument: true }
        ]
      },
      {
        name: 'Legal & Corporate',
        items: [
          { title: 'IP assignments (employees and contractors)', requestsDocument: true },
          { title: 'Open-source / license compliance summary', requestsDocument: false }
        ]
      },
      {
        name: 'IT & Systems',
        items: [
          { title: 'SOC 2 / security questionnaire and pen test summary', requestsDocument: true },
          { title: 'Source code access / escrow / repo ownership', requestsDocument: true },
          { title: 'Infrastructure / cloud spend and vendor lock-in', requestsDocument: true },
          { title: 'Key-person / bus-factor engineering risk', requestsDocument: false }
        ]
      }
    ]
  },
  services: {
    industryKey: 'services',
    name: 'Professional / Field Services DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'Recurring maintenance / contract backlog schedule', requestsDocument: true },
          { title: 'WIP / unbilled jobs and retainage', requestsDocument: true },
          { title: 'Technician utilization / capacity metrics', requestsDocument: false }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'Vehicle and equipment fleet list with liens', requestsDocument: true },
          { title: 'Dispatch / FSM software and data export', requestsDocument: false }
        ]
      },
      {
        name: 'Legal & Corporate',
        items: [
          { title: 'Trade licenses, bonding, and certificates of insurance', requestsDocument: true },
          { title: 'Customer contract terms and termination rights', requestsDocument: true }
        ]
      },
      {
        name: 'Customer & Revenue',
        items: [
          { title: 'Customer concentration and top account retention', requestsDocument: true }
        ]
      },
      {
        name: 'HR & Benefits',
        items: [
          { title: 'Technician / crew non-solicit and hiring pipeline', requestsDocument: false }
        ]
      }
    ]
  },
  environmental: {
    industryKey: 'environmental',
    name: 'Environmental / Industrial Services DD',
    groups: [
      {
        name: 'Regulatory & Compliance',
        items: [
          { title: 'Operating licenses and certifications schedule', requestsDocument: true },
          { title: 'Lab accreditation / proficiency records (if applicable)', requestsDocument: true },
          { title: 'Chain-of-custody and QA/QC procedures', requestsDocument: true }
        ]
      },
      {
        name: 'Insurance',
        items: [
          { title: 'Pollution / professional liability and claims history', requestsDocument: true }
        ]
      },
      {
        name: 'Customer & Revenue',
        items: [
          { title: 'Top client SOWs and renewal / project pipeline', requestsDocument: true }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'Field equipment / vehicle list and calibration records', requestsDocument: true }
        ]
      }
    ]
  },
  retail: {
    industryKey: 'retail',
    name: 'Retail / eCommerce DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'Inventory aging and shrink history', requestsDocument: true },
          { title: 'Channel mix (store / marketplace / DTC) and contribution', requestsDocument: true },
          { title: 'Return / chargeback rates', requestsDocument: true }
        ]
      },
      {
        name: 'Real Estate & Facilities',
        items: [
          { title: 'Lease / CAM / landlord consent for assignment', requestsDocument: true }
        ]
      },
      {
        name: 'IT & Systems',
        items: [
          { title: 'POS / Shopify / marketplace account transfer plan', requestsDocument: true }
        ]
      },
      {
        name: 'Customer & Revenue',
        items: [
          { title: 'Customer / email list ownership and marketing consent', requestsDocument: false }
        ]
      }
    ]
  },
  manufacturing: {
    industryKey: 'manufacturing',
    name: 'Manufacturing DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'COGS / BOM and margin by product line', requestsDocument: true },
          { title: 'Capacity utilization and backlog', requestsDocument: true }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'Tooling / molds ownership and location', requestsDocument: true },
          { title: 'OSHA / safety records and open citations', requestsDocument: true }
        ]
      },
      {
        name: 'Real Estate & Facilities',
        items: [
          { title: 'Environmental permits and Phase I (if applicable)', requestsDocument: true }
        ]
      },
      {
        name: 'Customer & Revenue',
        items: [
          { title: 'Top customers, contracts, and concentration', requestsDocument: true }
        ]
      }
    ]
  },
  construction: {
    industryKey: 'construction',
    name: 'Construction / Trades DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'WIP schedule and retainage', requestsDocument: true },
          { title: 'Bonding capacity and surety relationship', requestsDocument: true }
        ]
      },
      {
        name: 'Legal & Corporate',
        items: [
          { title: 'Licenses, union agreements, and lien history', requestsDocument: true },
          { title: 'Equipment liens and vehicle titles', requestsDocument: true }
        ]
      },
      {
        name: 'Customer & Revenue',
        items: [
          { title: 'Backlog by job and customer concentration', requestsDocument: true }
        ]
      },
      {
        name: 'Insurance',
        items: [
          { title: 'GL / workers’ comp / builders risk certificates', requestsDocument: true }
        ]
      }
    ]
  },
  auto: {
    industryKey: 'auto',
    name: 'Automotive DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'Parts inventory turns and aging', requestsDocument: true },
          { title: 'Bay / lift utilization and RO volume', requestsDocument: true }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'OEM / dealer agreements and territory rights', requestsDocument: true },
          { title: 'Lift certifications and environmental (oil / waste) compliance', requestsDocument: true }
        ]
      },
      {
        name: 'Real Estate & Facilities',
        items: [
          { title: 'Lease assignment and environmental site conditions', requestsDocument: true }
        ]
      }
    ]
  },
  franchise: {
    industryKey: 'franchise',
    name: 'Franchise DD',
    groups: [
      {
        name: 'Legal & Corporate',
        items: [
          { title: 'Current FDD and franchise agreement', requestsDocument: true },
          { title: 'Franchisor transfer / approval requirements', requestsDocument: true },
          { title: 'Territory rights and protected radius', requestsDocument: true }
        ]
      },
      {
        name: 'Financial & QoE',
        items: [
          { title: 'Royalty, ad fund, and other recurring fees schedule', requestsDocument: true },
          { title: 'Remodel / CAPEX obligations and timeline', requestsDocument: true }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'Franchisee association / franchisee satisfaction notes', requestsDocument: false },
          { title: 'Required vendors and supply restrictions', requestsDocument: true }
        ]
      }
    ]
  },
  hvac: {
    industryKey: 'hvac',
    name: 'HVAC / Home Services DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'Maintenance agreement / recurring revenue schedule', requestsDocument: true },
          { title: 'Job costing vs quoted vs actual (12 months)', requestsDocument: true },
          { title: 'Seasonality of service vs install mix', requestsDocument: false }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'Technician roster, licenses, and overtime', requestsDocument: true },
          { title: 'Vehicle / van fleet list, titles, and liens', requestsDocument: true },
          { title: 'Dispatch software and customer data export', requestsDocument: false }
        ]
      },
      {
        name: 'Legal & Corporate',
        items: [
          { title: 'HVAC contractor license transferability', requestsDocument: true },
          { title: 'EPA 608 / refrigerant certifications', requestsDocument: true }
        ]
      }
    ]
  },
  trucking: {
    industryKey: 'trucking',
    name: 'Trucking / Logistics DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'Lane / customer revenue concentration', requestsDocument: true },
          { title: 'Owner-operator vs company-driver mix and pay', requestsDocument: true },
          { title: 'Fuel surcharge and accessorial recovery', requestsDocument: false }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'Equipment list (tractors/trailers) with liens', requestsDocument: true },
          { title: 'ELD / TMS data export and CSA scores', requestsDocument: true }
        ]
      },
      {
        name: 'Legal & Corporate',
        items: [
          { title: 'Authority (MC/DOT) transfer plan', requestsDocument: true },
          { title: 'Insurance (auto liability, cargo) and claims', requestsDocument: true }
        ]
      }
    ]
  },
  laundromat: {
    industryKey: 'laundromat',
    name: 'Laundromat / Car Wash DD',
    groups: [
      {
        name: 'Financial & QoE',
        items: [
          { title: 'Coin / card / app collections vs reported revenue', requestsDocument: true },
          { title: 'Utility (water/gas/electric) vs volume', requestsDocument: true }
        ]
      },
      {
        name: 'Operations',
        items: [
          { title: 'Machine schedule, age, and remaining useful life', requestsDocument: true },
          { title: 'POS / card system and unattended operations', requestsDocument: false }
        ]
      },
      {
        name: 'Real Estate & Facilities',
        items: [
          { title: 'Lease assignment, CAM, and remaining term', requestsDocument: true },
          { title: 'Water/sewer capacity and environmental permits', requestsDocument: true }
        ]
      }
    ]
  }
};

/** All system industry packs (Wave 2 + Wave 5). */
export const DD_SYSTEM_INDUSTRY_KEYS = [
  'generic',
  'restaurant',
  'healthcare',
  'saas',
  'services',
  'hvac',
  'trucking',
  'laundromat',
  'environmental',
  'retail',
  'manufacturing',
  'construction',
  'auto',
  'franchise'
];

/** @deprecated Use DD_SYSTEM_INDUSTRY_KEYS */
export const WAVE2_INDUSTRY_KEYS = DD_SYSTEM_INDUSTRY_KEYS;

/**
 * Merge base groups with overlay: append items into matching group names, else add groups.
 * @param {DdGroupDef[]} baseGroups
 * @param {DdGroupDef[]} overlayGroups
 */
export function mergeTemplateGroups(baseGroups, overlayGroups = []) {
  const merged = baseGroups.map((g) => ({
    name: g.name,
    items: [...(g.items || [])]
  }));

  for (const og of overlayGroups) {
    const existing = merged.find(
      (g) => g.name.toLowerCase() === String(og.name || '').toLowerCase()
    );
    if (existing) {
      for (const item of og.items || []) {
        const dup = existing.items.some(
          (i) => i.title.toLowerCase() === String(item.title || '').toLowerCase()
        );
        if (!dup) existing.items.push({ ...item });
      }
    } else {
      merged.push({
        name: og.name,
        items: (og.items || []).map((i) => ({ ...i }))
      });
    }
  }
  return merged;
}

/**
 * @param {string} industryKey
 * @returns {DdTemplateDef}
 */
export function buildDdTemplateForIndustry(industryKey) {
  const key = DD_SYSTEM_INDUSTRY_KEYS.includes(industryKey) ? industryKey : 'generic';
  const base = BUSINESS_ACQUISITION_DD_TEMPLATE;

  if (key === 'generic') {
    return {
      industryKey: 'generic',
      name: base.name,
      assetType: base.assetType || 'business',
      groups: base.groups.map((g) => ({
        name: g.name,
        items: g.items.map((i) => ({ ...i }))
      }))
    };
  }

  const overlay = OVERLAYS[key];
  if (!overlay) {
    return buildDdTemplateForIndustry('generic');
  }
  return {
    industryKey: key,
    name: overlay.name,
    assetType: 'business',
    groups: mergeTemplateGroups(base.groups, overlay.groups)
  };
}

export function listWave2TemplateDefs() {
  return DD_SYSTEM_INDUSTRY_KEYS.map((key) => buildDdTemplateForIndustry(key));
}
