/** Multi-slot buy boxes live in `user_settings.preferences.buyBoxes` (4 slots). */
export const BUY_BOX_SLOT_COUNT = 4;

/** Not part of buy_box JSON column or deal-matching criteria */
const SLOT_META_KEYS = new Set([
  'name',
  'feedSearch',
  'excludeKeywords',
  'excludeLists',
  'currentExcludeList',
  'currentSearchList'
]);

export function defaultBuyBoxSlotName(index) {
  return `Buy box ${index + 1}`;
}

/** Deep-clone named exclude list presets (name → keyword[]). */
export function cloneExcludeListsMap(lists) {
  if (!lists || typeof lists !== 'object' || Array.isArray(lists)) return {};
  const out = {};
  for (const [name, keywords] of Object.entries(lists)) {
    if (!name || !Array.isArray(keywords)) continue;
    out[String(name)] = keywords.map((k) => String(k));
  }
  return out;
}

/**
 * Named exclude presets shared across all buy box slots.
 * @param {object} preferences - user_settings.preferences
 * @param {object[]} buyBoxes - normalized buy box slots
 * @param {object} [legacy] - legacy exclude_lists column / top-level API field
 */
export function getExcludeListLibrary(preferences, buyBoxes, legacy = {}) {
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  if (
    prefs.excludeListLibrary &&
    typeof prefs.excludeListLibrary === 'object' &&
    !Array.isArray(prefs.excludeListLibrary)
  ) {
    return cloneExcludeListsMap(prefs.excludeListLibrary);
  }

  const merged = {};
  const top = legacy.excludeLists;
  if (top && typeof top === 'object' && !Array.isArray(top)) {
    Object.assign(merged, cloneExcludeListsMap(top));
  }

  if (Array.isArray(buyBoxes)) {
    for (const slot of buyBoxes) {
      if (slot?.excludeLists && typeof slot.excludeLists === 'object' && !Array.isArray(slot.excludeLists)) {
        for (const [name, keywords] of Object.entries(slot.excludeLists)) {
          if (!merged[name] && Array.isArray(keywords)) {
            merged[name] = keywords.map((k) => String(k));
          }
        }
      }
    }
  }
  return merged;
}

export function emptyBuyBoxCriteria() {
  return {
    minPrice: null,
    maxPrice: null,
    minEbitda: null,
    maxEbitda: null,
    minRevenue: null,
    maxRevenue: null,
    revenueMultiple: null,
    targetStates: [],
    excludeStates: [],
    targetIndustries: [],
    targetCOC: null,
    targetPayback: null,
    minBuyerSalary: null,
    includeNearMatchesPercent: 0,
    includeAbsenteeRemoteNearMatches: false
  };
}

export function emptySlotFeed() {
  return {
    feedSearch: '',
    excludeKeywords: [],
    excludeLists: {},
    currentExcludeList: '',
    currentSearchList: ''
  };
}

/**
 * Criteria only (for `buy_box` column and API `buyBox`), excluding name and feed fields.
 */
export function criteriaFromSlot(slot) {
  if (!slot || typeof slot !== 'object') return emptyBuyBoxCriteria();
  const out = { ...emptyBuyBoxCriteria() };
  for (const key of Object.keys(slot)) {
    if (!SLOT_META_KEYS.has(key)) {
      out[key] = slot[key];
    }
  }
  return out;
}

function hasCriteriaValue(v) {
  return v != null && v !== '' && (Array.isArray(v) ? v.length > 0 : true);
}

/** True when a slot has positive match filters (empty slots must not match the whole market). */
export function slotHasMatchCriteria(slot) {
  if (!slot || typeof slot !== 'object') return false;
  const c = criteriaFromSlot(slot);
  if (
    hasCriteriaValue(c.minPrice) ||
    hasCriteriaValue(c.maxPrice) ||
    hasCriteriaValue(c.minEbitda) ||
    hasCriteriaValue(c.maxEbitda) ||
    hasCriteriaValue(c.minRevenue) ||
    hasCriteriaValue(c.maxRevenue) ||
    hasCriteriaValue(c.revenueMultiple) ||
    hasCriteriaValue(c.targetStates) ||
    hasCriteriaValue(c.excludeStates) ||
    hasCriteriaValue(c.targetIndustries)
  ) {
    return true;
  }
  return typeof slot.feedSearch === 'string' && Boolean(slot.feedSearch.trim());
}

function mergeSlotFeed(i, stored, legacyFeed) {
  const lk = Array.isArray(legacyFeed.excludeKeywords) ? legacyFeed.excludeKeywords : [];
  const ll =
    legacyFeed.excludeLists && typeof legacyFeed.excludeLists === 'object' && !Array.isArray(legacyFeed.excludeLists)
      ? legacyFeed.excludeLists
      : {};
  const lc = legacyFeed.currentExcludeList != null ? String(legacyFeed.currentExcludeList) : '';

  const feedSearch = typeof stored.feedSearch === 'string' ? stored.feedSearch : '';
  const excludeKeywords = Array.isArray(stored.excludeKeywords) ? stored.excludeKeywords : i === 0 ? [...lk] : [];
  const excludeLists =
    stored.excludeLists && typeof stored.excludeLists === 'object' && !Array.isArray(stored.excludeLists)
      ? stored.excludeLists
      : i === 0
        ? { ...ll }
        : {};
  const currentExcludeList =
    typeof stored.currentExcludeList === 'string'
      ? stored.currentExcludeList
      : i === 0
        ? lc
        : '';

  const currentSearchList = typeof stored.currentSearchList === 'string' ? stored.currentSearchList : '';

  return { feedSearch, excludeKeywords, excludeLists, currentExcludeList, currentSearchList };
}

/**
 * @param {object} buy_box - legacy `user_settings.buy_box` JSON
 * @param {object} preferences - `user_settings.preferences` JSON
 * @param {object} [legacyFeed] - from `exclude_keywords` / `exclude_lists` / `current_exclude_list` columns for migration
 */
export function normalizeUserBuyBoxes(buy_box, preferences, legacyFeed = {}) {
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  const legacy = buy_box && typeof buy_box === 'object' ? buy_box : {};
  let buyBoxes = prefs.buyBoxes;
  const activeBuyBoxIndex = Math.min(
    BUY_BOX_SLOT_COUNT - 1,
    Math.max(0, Number(prefs.activeBuyBoxIndex) || 0)
  );

  if (!Array.isArray(buyBoxes) || buyBoxes.length === 0) {
    buyBoxes = [];
    for (let i = 0; i < BUY_BOX_SLOT_COUNT; i++) {
      const criteria = i === 0 ? { ...emptyBuyBoxCriteria(), ...legacy } : emptyBuyBoxCriteria();
      const feed = mergeSlotFeed(i, {}, legacyFeed);
      buyBoxes.push({
        name: defaultBuyBoxSlotName(i),
        ...criteria,
        ...feed
      });
    }
  } else {
    buyBoxes = buyBoxes.slice(0, BUY_BOX_SLOT_COUNT).map((slot, i) => {
      const s = slot && typeof slot === 'object' ? slot : {};
      const storedFeed = {
        feedSearch: s.feedSearch,
        excludeKeywords: s.excludeKeywords,
        excludeLists: s.excludeLists,
        currentExcludeList: s.currentExcludeList,
        currentSearchList: s.currentSearchList
      };
      const { name, feedSearch, excludeKeywords, excludeLists, currentExcludeList, currentSearchList, ...rest } = s;
      const criteria = { ...emptyBuyBoxCriteria(), ...rest };
      const feed = mergeSlotFeed(i, storedFeed, legacyFeed);
      return {
        name: typeof name === 'string' && name.trim() ? name.trim() : defaultBuyBoxSlotName(i),
        ...criteria,
        ...feed
      };
    });
    while (buyBoxes.length < BUY_BOX_SLOT_COUNT) {
      const i = buyBoxes.length;
      buyBoxes.push({
        name: defaultBuyBoxSlotName(i),
        ...emptyBuyBoxCriteria(),
        ...emptySlotFeed()
      });
    }
  }

  const activeSlot = buyBoxes[activeBuyBoxIndex] || buyBoxes[0];
  const activeCriteria = criteriaFromSlot(activeSlot);

  return { buyBoxes, activeBuyBoxIndex, activeCriteria };
}

/** Active slot feed for syncing `exclude_*` DB columns */
export function activeSlotExcludeColumns(buyBoxes, activeBuyBoxIndex) {
  if (!Array.isArray(buyBoxes) || buyBoxes.length !== BUY_BOX_SLOT_COUNT) return null;
  const idx = Math.min(BUY_BOX_SLOT_COUNT - 1, Math.max(0, Number(activeBuyBoxIndex) || 0));
  const slot = buyBoxes[idx] || {};
  return {
    excludeKeywords: Array.isArray(slot.excludeKeywords) ? slot.excludeKeywords : [],
    excludeLists:
      slot.excludeLists && typeof slot.excludeLists === 'object' && !Array.isArray(slot.excludeLists)
        ? slot.excludeLists
        : {},
    currentExcludeList: slot.currentExcludeList != null && slot.currentExcludeList !== '' ? slot.currentExcludeList : null
  };
}

/**
 * If merged preferences omit a valid `buyBoxes` array, rebuild from DB row (preserves per-slot feed).
 */
export function ensureBuyBoxesInMergedPreferences(prefsToWrite, row) {
  const merged = prefsToWrite && typeof prefsToWrite === 'object' ? { ...prefsToWrite } : {};
  if (Array.isArray(merged.buyBoxes) && merged.buyBoxes.length === BUY_BOX_SLOT_COUNT) return merged;
  const prefsSource =
    Array.isArray(merged.buyBoxes) && merged.buyBoxes.length > 0
      ? merged
      : row.preferences || {};
  const normalized = normalizeUserBuyBoxes(row.buy_box, prefsSource, {
    excludeKeywords: row.exclude_keywords,
    excludeLists: row.exclude_lists,
    currentExcludeList: row.current_exclude_list
  });
  merged.buyBoxes = normalized.buyBoxes;
  merged.activeBuyBoxIndex = Math.min(
    BUY_BOX_SLOT_COUNT - 1,
    Math.max(0, Number(merged.activeBuyBoxIndex ?? normalized.activeBuyBoxIndex) || 0)
  );
  return merged;
}
