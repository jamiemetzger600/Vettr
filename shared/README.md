# Vettr Shared Module

Shared business logic for Vettr v4.0.0+ (extension, web app, backend).

## Features

- **CORS allow-check**: `corsAllow.js` — which browser Origins may call the API (`vettr.pages.dev`, `*.vettr.pages.dev`, localhost list, chrome-extension)
- **Buy Box Matching**: Filter deals based on price, EBITDA, revenue, location, industry
- **Exclude Filtering**: Filter out deals by keywords
- **Hidden Deals**: Track and filter hidden deals
- **Deal Normalization**: Consistent deal data structure

## Usage

### In Web App or Backend

```javascript
import { 
  dealMatchesBuyBox, 
  filterDeals, 
  countMatchingDeals 
} from './shared/index.js';

const deals = [/* array of deals */];
const filters = {
  buyBox: {
    minPrice: 100000,
    maxPrice: 5000000,
    targetStates: ['CA', 'NY'],
    excludeStates: ['AK'],
    targetIndustries: ['SaaS', 'E-commerce']
  },
  excludeKeywords: ['restaurant', 'franchise'],
  hiddenIds: ['deal123', 'deal456'],
  showHidden: false
};

// Filter deals
const matchingDeals = filterDeals(deals, filters);

// Count matches
const count = countMatchingDeals(deals, filters);

// Check individual deal
const deal = { askingPrice: 250000, state: 'CA', industry: 'SaaS' };
const matches = dealMatchesBuyBox(deal, filters.buyBox); // true
```

### Functions

#### `dealMatchesBuyBox(deal, buyBox)`
Check if a deal matches buy box criteria (price, EBITDA, revenue, location, industry).

#### `dealPassesExcludeFilter(deal, excludeKeywords)`
Check if a deal should be included (not in exclude list).

#### `dealIsNotHidden(deal, hiddenIds)`
Check if a deal is not hidden.

#### `dealPassesAllFilters(deal, filters)`
Apply all filters at once.

#### `filterDeals(deals, filters)`
Filter an array of deals.

#### `countMatchingDeals(deals, filters)`
Count how many deals match filters.

#### `sanitizeDealForStorage(deal)`
Clean deal object for storage.

#### `generateDealId(url, name, source)`
Generate unique deal ID.

#### `calculateDealMetrics(deal)`
Calculate revenue/EBITDA multiples and margin.

## Buy Box Schema

```javascript
{
  minPrice: number,           // Minimum asking price
  maxPrice: number,           // Maximum asking price
  minEbitda: number,          // Minimum EBITDA
  maxEbitda: number,          // Maximum EBITDA
  minRevenue: number,         // Minimum revenue
  maxRevenue: number,         // Maximum revenue
  revenueMultiple: number,    // Max revenue multiple
  targetStates: string[],     // Include only these states
  excludeStates: string[],    // Exclude these states
  targetIndustries: string[], // Include only these industries
  minQuality: number          // Minimum quality score (optional)
}
```

## Testing

```bash
node shared/corsAllow.test.mjs
```

```bash
node --input-type=module -e "
import { dealMatchesBuyBox } from './buyBoxMatcher.js';
const deal = { askingPrice: 1000000, state: 'CA' };
const buyBox = { minPrice: 500000, maxPrice: 2000000 };
console.log(dealMatchesBuyBox(deal, buyBox)); // true
"
```
