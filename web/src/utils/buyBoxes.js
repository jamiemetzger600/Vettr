/** Client-side normalization (keep aligned with backend/src/lib/userBuyBoxes.js). */
export const BUY_BOX_SLOT_COUNT = 4;

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

/** Comma/& AND terms from the stored feedSearch string. API caps at 8. */
export function parseSearchKeywords(feedSearch) {
  if (typeof feedSearch !== 'string' || !feedSearch.trim()) return [];
  return Array.from(
    new Set(
      feedSearch
        .split(/\s*[,&]\s*/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  ).slice(0, 8);
}

export function joinSearchKeywords(keywords) {
  if (!Array.isArray(keywords)) return '';
  return keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 8).join(', ');
}

/**
 * Named search-keyword presets shared across all buy box slots.
 */
export function getSearchListLibrary(settings) {
  const prefs = settings?.preferences || {};
  if (
    prefs.searchListLibrary &&
    typeof prefs.searchListLibrary === 'object' &&
    !Array.isArray(prefs.searchListLibrary)
  ) {
    return cloneExcludeListsMap(prefs.searchListLibrary);
  }

  const merged = {};
  const { buyBoxes } = normalizeBuyBoxesState(settings);
  for (const slot of buyBoxes) {
    if (slot?.searchLists && typeof slot.searchLists === 'object' && !Array.isArray(slot.searchLists)) {
      for (const [name, keywords] of Object.entries(slot.searchLists)) {
        if (!merged[name] && Array.isArray(keywords)) {
          merged[name] = keywords.map((k) => String(k));
        }
      }
    }
  }
  return merged;
}

/**
 * Named exclude presets shared across all buy box slots.
 * Migrates from preferences.excludeListLibrary, legacy top-level excludeLists, or per-slot lists.
 */
export function getExcludeListLibrary(settings) {
  const prefs = settings?.preferences || {};
  if (
    prefs.excludeListLibrary &&
    typeof prefs.excludeListLibrary === 'object' &&
    !Array.isArray(prefs.excludeListLibrary)
  ) {
    return cloneExcludeListsMap(prefs.excludeListLibrary);
  }

  const merged = {};
  const top = settings?.excludeLists;
  if (top && typeof top === 'object' && !Array.isArray(top)) {
    Object.assign(merged, cloneExcludeListsMap(top));
  }

  const { buyBoxes } = normalizeBuyBoxesState(settings);
  for (const slot of buyBoxes) {
    if (slot?.excludeLists && typeof slot.excludeLists === 'object' && !Array.isArray(slot.excludeLists)) {
      for (const [name, keywords] of Object.entries(slot.excludeLists)) {
        if (!merged[name] && Array.isArray(keywords)) {
          merged[name] = keywords.map((k) => String(k));
        }
      }
    }
  }
  return merged;
}

/** Keyword/search filters stored on each buy-box slot (not sent as deal-matching criteria). */
export function snapshotSlotFeed(slot) {
  const s = slot && typeof slot === 'object' ? slot : {};
  return {
    feedSearch: typeof s.feedSearch === 'string' ? s.feedSearch : '',
    excludeKeywords: Array.isArray(s.excludeKeywords) ? [...s.excludeKeywords] : [],
    excludeLists:
      s.excludeLists && typeof s.excludeLists === 'object' && !Array.isArray(s.excludeLists)
        ? { ...s.excludeLists }
        : {},
    currentExcludeList: s.currentExcludeList != null ? String(s.currentExcludeList) : '',
    currentSearchList: s.currentSearchList != null ? String(s.currentSearchList) : ''
  };
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

/** True when deal-matching criteria on a slot are unset (default / empty buy box). */
export function isBuyBoxCriteriaEmpty(criteria) {
  if (!criteria || typeof criteria !== 'object') return true;
  const has = (v) => v != null && v !== '' && (Array.isArray(v) ? v.length > 0 : true);
  return (
    !has(criteria.minPrice) &&
    !has(criteria.maxPrice) &&
    !has(criteria.minEbitda) &&
    !has(criteria.maxEbitda) &&
    !has(criteria.minRevenue) &&
    !has(criteria.revenueMultiple) &&
    !has(criteria.targetStates) &&
    !has(criteria.excludeStates) &&
    !has(criteria.targetIndustries) &&
    !has(criteria.targetCOC) &&
    !has(criteria.targetPayback) &&
    !has(criteria.minBuyerSalary) &&
    !(Number(criteria.includeNearMatchesPercent) > 0) &&
    criteria.includeAbsenteeRemoteNearMatches !== true
  );
}

/** True if any slot has a custom name or non-empty criteria (used to avoid clobbering account buy boxes on login). */
export function buyBoxesHaveCustomization(buyBoxes) {
  if (!Array.isArray(buyBoxes)) return false;
  return buyBoxes.some((slot, i) => {
    if (!slot || typeof slot !== 'object') return false;
    const name = typeof slot.name === 'string' ? slot.name.trim() : '';
    if (name && name !== defaultBuyBoxSlotName(i)) return true;
    return !isBuyBoxCriteriaEmpty(criteriaFromSlot(slot));
  });
}

function legacyFeedFromSettings(settings) {
  if (!settings) return {};
  return {
    excludeKeywords: settings.excludeKeywords,
    excludeLists: settings.excludeLists,
    currentExcludeList: settings.currentExcludeList
  };
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
 * @param {object|null} settings - API settings
 */
export function normalizeBuyBoxesState(settings) {
  const legacyFeed = legacyFeedFromSettings(settings);

  if (!settings) {
    const buyBoxes = [];
    for (let i = 0; i < BUY_BOX_SLOT_COUNT; i++) {
      const criteria = i === 0 ? { ...emptyBuyBoxCriteria() } : emptyBuyBoxCriteria();
      const feed = mergeSlotFeed(i, {}, {});
      buyBoxes.push({ name: defaultBuyBoxSlotName(i), ...criteria, ...feed });
    }
    return {
      buyBoxes,
      activeBuyBoxIndex: 0,
      activeCriteria: criteriaFromSlot(buyBoxes[0])
    };
  }

  const legacy = settings.buyBox && typeof settings.buyBox === 'object' ? settings.buyBox : {};
  const prefs = settings.preferences || {};
  let buyBoxes = settings.buyBoxes;
  if (!Array.isArray(buyBoxes) || buyBoxes.length === 0) {
    buyBoxes = prefs.buyBoxes;
  }
  const activeBuyBoxIndex = Math.min(
    BUY_BOX_SLOT_COUNT - 1,
    Math.max(0, Number(settings.activeBuyBoxIndex ?? prefs.activeBuyBoxIndex) || 0)
  );

  if (!Array.isArray(buyBoxes) || buyBoxes.length === 0) {
    buyBoxes = [];
    for (let i = 0; i < BUY_BOX_SLOT_COUNT; i++) {
      const criteria = i === 0 ? { ...emptyBuyBoxCriteria(), ...legacy } : emptyBuyBoxCriteria();
      const feed = mergeSlotFeed(i, {}, legacyFeed);
      buyBoxes.push({ name: defaultBuyBoxSlotName(i), ...criteria, ...feed });
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
        ...mergeSlotFeed(i, {}, {})
      });
    }
  }

  const activeSlot = buyBoxes[activeBuyBoxIndex] || buyBoxes[0];
  const activeCriteria = criteriaFromSlot(activeSlot);

  return { buyBoxes, activeBuyBoxIndex, activeCriteria };
}

/** Persist near-match flexibility on the active slot + sync `buyBox` column. */
export function patchActiveBuyBoxFlexibility(settings, includeNearMatchesPercent) {
  const { buyBoxes, activeBuyBoxIndex } = normalizeBuyBoxesState(settings);
  const idx = activeBuyBoxIndex;
  const num = Math.min(100, Math.max(0, Number(includeNearMatchesPercent) || 0));
  const nextSlots = buyBoxes.map((slot, i) =>
    i === idx ? { ...slot, includeNearMatchesPercent: num } : slot
  );
  const crit = criteriaFromSlot(nextSlots[idx]);
  return {
    preferences: { buyBoxes: nextSlots, activeBuyBoxIndex: idx },
    buyBox: crit
  };
}

/**
 * Patch feed fields on the active buy box slot. Caller should send full payload to `updateSettings`.
 */
export function mergeActiveSlotFeedPatch(settings, patch = {}) {
  const { buyBoxes, activeBuyBoxIndex } = normalizeBuyBoxesState(settings);
  const idx = activeBuyBoxIndex;
  const prev = buyBoxes[idx] || {};
  const nextSlot = { ...prev };
  if (patch.feedSearch !== undefined) nextSlot.feedSearch = patch.feedSearch ?? '';
  if (patch.excludeKeywords !== undefined) nextSlot.excludeKeywords = patch.excludeKeywords;
  if (patch.currentExcludeList !== undefined) nextSlot.currentExcludeList = patch.currentExcludeList ?? '';
  if (patch.currentSearchList !== undefined) nextSlot.currentSearchList = patch.currentSearchList ?? '';
  const nextBoxes = buyBoxes.map((b, i) => (i === idx ? nextSlot : b));
  const library =
    patch.excludeLists !== undefined
      ? cloneExcludeListsMap(patch.excludeLists)
      : getExcludeListLibrary(settings);
  const searchLibrary =
    patch.searchLists !== undefined
      ? cloneExcludeListsMap(patch.searchLists)
      : getSearchListLibrary(settings);
  const preferences = { buyBoxes: nextBoxes, activeBuyBoxIndex: idx };
  if (patch.excludeLists !== undefined) {
    preferences.excludeListLibrary = library;
  }
  if (patch.searchLists !== undefined) {
    preferences.searchListLibrary = searchLibrary;
  }
  return {
    preferences,
    excludeKeywords: Array.isArray(nextSlot.excludeKeywords) ? nextSlot.excludeKeywords : [],
    excludeLists: library,
    currentExcludeList: nextSlot.currentExcludeList || null
  };
}
