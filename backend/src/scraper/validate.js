/**
 * Quality gates for a normalized listing row.
 * Returns { ok, errors: [{code, field, message}], warnings: [...] }.
 */

const DEFAULT_RULES = {
  required: ['name', 'listing_url'],
  anyOf: ['asking_price', 'annual_profit', 'annual_revenue'],
  ranges: {
    asking_price: [5_000, 1_000_000_000],
    annual_profit: [-10_000_000, 500_000_000],
    annual_revenue: [1_000, 5_000_000_000],
    years_established: [1800, new Date().getFullYear()],
  },
};

export function validateListing(row, recipeRules = {}) {
  const rules = {
    required: recipeRules.required || DEFAULT_RULES.required,
    anyOf: recipeRules.anyOf || DEFAULT_RULES.anyOf,
    ranges: { ...DEFAULT_RULES.ranges, ...(recipeRules.ranges || {}) },
  };
  const errors = [];
  const warnings = [];

  for (const f of rules.required) {
    if (row[f] == null || row[f] === '') errors.push({ code: 'required', field: f, message: `${f} is missing` });
  }
  if (rules.anyOf?.length && !rules.anyOf.some((f) => row[f] != null)) {
    errors.push({ code: 'anyOf', field: rules.anyOf.join('|'), message: `none of ${rules.anyOf.join(', ')} present` });
  }
  for (const [f, [lo, hi]] of Object.entries(rules.ranges)) {
    const val = row[f];
    if (val == null) continue;
    if (val < lo || val > hi) errors.push({ code: 'range', field: f, message: `${f}=${val} outside [${lo}, ${hi}]` });
  }
  if (row.annual_profit != null && row.annual_revenue != null && row.annual_profit > row.annual_revenue * 1.05) {
    warnings.push({ code: 'profit_gt_revenue', field: 'annual_profit', message: 'profit exceeds revenue' });
  }
  if (row.name && /^(home|listings?|businesses? for sale|search|page not found|404)$/i.test(row.name.trim())) {
    errors.push({ code: 'generic_name', field: 'name', message: `name looks like a page title: "${row.name}"` });
  }
  if (row.asking_price != null && row.annual_profit != null && row.asking_price === row.annual_profit) {
    warnings.push({ code: 'price_eq_profit', field: 'asking_price', message: 'price equals profit (label collision?)' });
  }
  return { ok: errors.length === 0, errors, warnings };
}
