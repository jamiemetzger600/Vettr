/**
 * Map free-text deal industry labels → Vettr DD industry_key.
 * Keyword rules are ordered; first match wins. Franchise is checked as overlay hint separately.
 */

const RULES = [
  {
    key: 'restaurant',
    patterns: [
      /\brestaurant/i,
      /\bcafe\b/i,
      /\bcoffee\b/i,
      /\bbar\b/i,
      /\bpub\b/i,
      /\bqsr\b/i,
      /\bfood\s*truck/i,
      /\bcatering/i,
      /\bbakery/i,
      /\bpizza/i,
      /\bfast\s*food/i,
      /\btavern/i,
      /\bbrewery/i
    ]
  },
  {
    key: 'healthcare',
    patterns: [
      /\bdental/i,
      /\bdentist/i,
      /\bmedical/i,
      /\bclinic/i,
      /\bmed\s*spa/i,
      /\bmedspa/i,
      /\bchiropract/i,
      /\bhealthcare/i,
      /\bhealth\s*care/i,
      /\bphysician/i,
      /\bveterinary/i,
      /\bvet\s*clinic/i,
      /\boptometr/i,
      /\bphysical\s*therapy/i
    ]
  },
  {
    key: 'saas',
    patterns: [
      /\bsaas\b/i,
      /\bsoftware/i,
      /\btechnology/i,
      /\btech\b/i,
      /\bapp\b/i,
      /\bplatform/i,
      /\bit\s*services/i,
      /\bmsp\b/i,
      /\bcloud\b/i
    ]
  },
  {
    key: 'hvac',
    patterns: [
      /\bhvac\b/i,
      /\bheating\b/i,
      /\bair\s*conditioning/i,
      /\bplumbing/i,
      /\belectrician/i,
      /\bhome\s*services/i,
      /\bfield\s*services/i
    ]
  },
  {
    key: 'trucking',
    patterns: [
      /\btruck/i,
      /\blogistic/i,
      /\bfreight/i,
      /\bcarrier\b/i,
      /\btransportation/i,
      /\bdelivery\s*service/i
    ]
  },
  {
    key: 'laundromat',
    patterns: [
      /\blaundr/i,
      /\bcar\s*wash/i,
      /\bcoin\s*op/i,
      /\bwash.*fold/i
    ]
  },
  {
    key: 'services',
    patterns: [
      /\bcleaning/i,
      /\blandscap/i,
      /\bjanitorial/i,
      /\bconsulting/i,
      /\bprofessional\s*services/i,
      /\bstaffing/i,
      /\baccounting/i,
      /\blaw\s*firm/i,
      /\bmarketing\s*agency/i
    ]
  },
  {
    key: 'environmental',
    patterns: [
      /\benvironmental/i,
      /\bremediation/i,
      /\bsoil\s*vapor/i,
      /\blaboratory/i,
      /\btesting\s*lab/i,
      /\bhazardous/i,
      /\bwaste\s*management/i
    ]
  },
  {
    key: 'manufacturing',
    patterns: [/\bmanufactur/i, /\bfabricat/i, /\bindustrial\s*product/i, /\bmachine\s*shop/i]
  },
  {
    key: 'construction',
    patterns: [/\bconstruction/i, /\bcontractor/i, /\broofing/i, /\bgeneral\s*contract/i]
  },
  {
    key: 'auto',
    patterns: [/\bauto\s*repair/i, /\bautomotive/i, /\bdealership/i, /\bgarage\b/i]
  },
  {
    key: 'retail',
    patterns: [/\bretail/i, /\be-?commerce/i, /\becommerce/i, /\bstore\b/i, /\bshop\b/i]
  }
];

function normalizeIndustryInput(industry) {
  if (industry == null) return '';
  if (Array.isArray(industry)) return industry.filter(Boolean).join(' ');
  return String(industry);
}

/** @returns {'generic'|string} */
export function matchIndustryKey(industry) {
  const text = normalizeIndustryInput(industry).trim();
  if (!text) return 'generic';

  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(text))) return rule.key;
  }
  return 'generic';
}

export function isFranchiseTagged(industry) {
  return /\bfranchise/i.test(normalizeIndustryInput(industry));
}

export const INDUSTRY_LABELS = {
  generic: 'Generic Business Acquisition',
  restaurant: 'Restaurant / Food Service',
  healthcare: 'Healthcare / Dental / MedSpa',
  saas: 'SaaS / Software',
  services: 'Professional / Field Services',
  hvac: 'HVAC / Home Services',
  trucking: 'Trucking / Logistics',
  laundromat: 'Laundromat / Car Wash',
  environmental: 'Environmental / Industrial Services',
  manufacturing: 'Manufacturing',
  construction: 'Construction / Trades',
  auto: 'Automotive',
  retail: 'Retail / eCommerce',
  franchise: 'Franchise'
};
