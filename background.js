// Background script to handle extension icon clicks and auto-refresh
importScripts('utils/vettr-config.js', 'utils/vettr-cloud-sync.js');
console.log('🔧 Background service worker starting...');

const SESSION_EXPIRED = 'SESSION_EXPIRED';
let fullSyncInFlight = null;

async function resolveAndStoreDefaultTeamId(apiBase, token) {
  try {
    const res = await fetch(apiBase.replace(/\/+$/, '') + '/teams', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const teams = data.teams || [];
    if (!teams.length) {
      await chrome.storage.local.remove(['vettrTeamId']);
      return null;
    }
    // Prefer sole team; otherwise keep existing stored id if still valid
    const stored = await chrome.storage.local.get(['vettrTeamId']);
    let teamId = null;
    if (teams.length === 1) {
      teamId = Number(teams[0].id);
    } else if (stored.vettrTeamId && teams.some((t) => Number(t.id) === Number(stored.vettrTeamId))) {
      teamId = Number(stored.vettrTeamId);
    } else {
      teamId = Number(teams[0].id);
    }
    if (teamId) {
      await chrome.storage.local.set({ vettrTeamId: teamId });
      console.log('☁️ Vettr default team for extension saves:', teamId);
    }
    return teamId;
  } catch (err) {
    console.warn('☁️ resolve team failed:', err.message);
    return null;
  }
}

async function getVettrAuthConfig() {
  const stored = await chrome.storage.local.get([
    'vettrApiBaseUrl',
    'vettrAuthToken',
    'vettrWebAppUrl',
    'vettrTeamId'
  ]);
  const apiBase = VettrCloudSync.normalizeApiBaseUrl(
    stored.vettrApiBaseUrl || (typeof VettrConfig !== 'undefined' ? VettrConfig.getDefaultApiBaseUrl() : '')
  );
  return {
    vettrApiBaseUrl: apiBase,
    vettrAuthToken: stored.vettrAuthToken || '',
    vettrWebAppUrl: stored.vettrWebAppUrl || (typeof VettrConfig !== 'undefined' ? VettrConfig.getDefaultWebAppUrl() : 'http://localhost:5173'),
    vettrTeamId: stored.vettrTeamId ? Number(stored.vettrTeamId) : null
  };
}

async function vettrApiFetch(path, options = {}) {
  const { vettrApiBaseUrl, vettrAuthToken } = await getVettrAuthConfig();
  if (!vettrAuthToken || !vettrApiBaseUrl) {
    throw new Error('Not signed in to Vettr');
  }
  const url = vettrApiBaseUrl + path;
  const res = await fetch(url, Object.assign({}, options, {
    headers: Object.assign(
      { 'Content-Type': 'application/json', Authorization: 'Bearer ' + vettrAuthToken },
      options.headers || {}
    )
  }));
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (res.status === 401) {
    await chrome.storage.local.remove(['vettrAuthToken', 'vettrUserEmail']);
    throw new Error(SESSION_EXPIRED);
  }
  if (!res.ok) {
    throw new Error((data && data.error) || text || res.statusText);
  }
  return data;
}

function normalizeSaveResponse(data) {
  return {
    vettrId: data.vettrId || data.id || data.dealId,
    savedAt: data.savedAt || data.saved_at,
    updatedAt: data.updatedAt || data.updated_at || data.savedAt || data.saved_at,
    deal_id: data.deal_id
  };
}

async function postVettrSaveDeal(body) {
  const cfg = await getVettrAuthConfig();
  const payload = Object.assign({}, body);
  if (cfg.vettrTeamId && !payload.teamId) {
    payload.teamId = cfg.vettrTeamId;
  }
  const data = await vettrApiFetch('/deals', { method: 'POST', body: JSON.stringify(payload) });
  return normalizeSaveResponse(data);
}

async function putVettrDeal(vettrId, body) {
  const data = await vettrApiFetch('/deals/' + vettrId, { method: 'PUT', body: JSON.stringify(body) });
  return normalizeSaveResponse(data);
}

async function deleteVettrDeal(vettrId) {
  await vettrApiFetch('/deals/' + vettrId, { method: 'DELETE' });
  return { ok: true };
}

async function pullVettrDeals() {
  // Include personal + team deals so sync matches CRM visibility
  const data = await vettrApiFetch('/deals?scope=all');
  return data.deals || [];
}

async function updateCrmBadge() {
  try {
    const data = await vettrApiFetch('/crm/today');
    const n = data.badgeCount || 0;
    await chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
    await chrome.action.setBadgeText({ text: n > 0 ? String(Math.min(n, 99)) : '' });
  } catch (err) {
    if (err.message !== 'Not signed in to Vettr' && err.message !== SESSION_EXPIRED) {
      console.debug('[crm] badge update skipped:', err.message);
    }
  }
}

async function runFullSync() {
  if (fullSyncInFlight) return fullSyncInFlight;
  fullSyncInFlight = (async () => {
    const { savedDeals = [] } = await chrome.storage.local.get(['savedDeals']);
    const cloudRows = await pullVettrDeals();
    const plan = VettrCloudSync.mergeDealsForFullSync(savedDeals, cloudRows);
    let merged = plan.merged;

    for (let i = 0; i < plan.uploads.length; i++) {
      const local = plan.uploads[i];
      const body = VettrCloudSync.buildDashboardSavedDealRequest(local);
      try {
        const res = await postVettrSaveDeal(body);
        VettrCloudSync.applySaveResponse(local, res);
        if (!local.dealId) local.dealId = body.dealId;
        const idx = merged.findIndex((d) => VettrCloudSync.resolveDealId(d) === VettrCloudSync.resolveDealId(local));
        if (idx !== -1) merged[idx] = Object.assign({}, merged[idx], local);
      } catch (err) {
        console.warn('☁️ Vettr bulk upload failed for deal:', local.name, err.message);
      }
    }

    for (let j = 0; j < plan.cloudUpdates.length; j++) {
      const item = plan.cloudUpdates[j];
      try {
        const body = VettrCloudSync.buildUpdateRequest(item.local);
        const res = await putVettrDeal(item.vettrId, body);
        VettrCloudSync.applySaveResponse(item.local, res);
      } catch (err) {
        console.warn('☁️ Vettr cloud update failed:', item.local.name, err.message);
      }
    }

    await chrome.storage.local.set({
      savedDeals: merged,
      vettrLastSyncAt: Date.now()
    });
    console.log('☁️ Vettr full sync complete:', merged.length, 'deals');
    notifyExtensionDashboardRefresh();
    notifyWebAppTabs();
    updateCrmBadge().catch(() => {});
    return { ok: true, count: merged.length };
  })().finally(() => {
    fullSyncInFlight = null;
  });
  return fullSyncInFlight;
}

function scheduleFullSyncAfterLink() {
  runFullSync().catch((err) => {
    console.warn('☁️ Vettr full sync after link failed:', err.message);
  });
}

/** Tell open Vettr web tabs to refetch My Deals (extension saved/updated/deleted a deal). */
async function notifyWebAppTabs() {
  const cfg = await getVettrAuthConfig();
  const prefixes = new Set(
    [cfg.vettrWebAppUrl, 'http://localhost:5173', 'https://vettr.pages.dev']
      .filter(Boolean)
      .map((u) => String(u).replace(/\/+$/, ''))
  );
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const url = tab.url;
    const hit = [...prefixes].some((p) => url.startsWith(p));
    if (!hit) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'VETTR_NOTIFY_WEB_REFRESH' });
    } catch {
      /* content script not ready on this tab */
    }
  }
}

/** Tell extension dashboard pages to reload My Deals from storage. */
function notifyExtensionDashboardRefresh() {
  try {
    chrome.runtime.sendMessage({ type: 'VETTR_DEALS_REFRESH' }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    /* no listeners */
  }
}

async function handleVettrLogin(email, password, apiBaseUrl, webAppUrl) {
  const apiBase = VettrCloudSync.normalizeApiBaseUrl(
    apiBaseUrl || (typeof VettrConfig !== 'undefined' ? VettrConfig.getDefaultApiBaseUrl() : 'http://localhost:3001/api')
  );
  const res = await fetch(apiBase + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Login failed');
  }
  await chrome.storage.local.set({
    vettrAuthToken: data.token,
    vettrApiBaseUrl: apiBase,
    vettrUserEmail: data.user?.email || email,
    vettrWebAppUrl: webAppUrl || (typeof VettrConfig !== 'undefined' ? VettrConfig.getDefaultWebAppUrl() : 'http://localhost:5173')
  });
  await resolveAndStoreDefaultTeamId(apiBase, data.token);
  ensureVettrSyncAlarm();
  scheduleFullSyncAfterLink();
  return { ok: true, email: data.user?.email || email };
}

// ====== AUTO-REFRESH SCHEDULER ======
const ALARM_NAME = 'autoRefreshDeals';
const VETTR_SYNC_ALARM = 'vettrCloudSync';
const DEFAULT_REFRESH_INTERVAL = 60; // minutes
const VETTR_SYNC_INTERVAL_MIN = 1; // Chrome minimum alarm period

// Initialize auto-refresh on install/update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('📦 Extension installed/updated');
  
  // Load user preferences
  const { autoRefreshEnabled, refreshInterval } = await chrome.storage.local.get([
    'autoRefreshEnabled',
    'refreshInterval'
  ]);
  
  // Set defaults if not configured
  if (autoRefreshEnabled === undefined) {
    await chrome.storage.local.set({ 
      autoRefreshEnabled: true,
      refreshInterval: DEFAULT_REFRESH_INTERVAL,
      notifyNewDeals: true,
      lastRefreshTime: null,
      lastDealCount: 0
    });
  }
  
  // Schedule alarm if enabled
  if (autoRefreshEnabled !== false) {
    scheduleAutoRefresh(refreshInterval || DEFAULT_REFRESH_INTERVAL);
  }
  ensureVettrSyncAlarm();
});

// Schedule the auto-refresh alarm
function scheduleAutoRefresh(intervalMinutes) {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: intervalMinutes
    });
    console.log(`⏰ Auto-refresh scheduled every ${intervalMinutes} minutes`);
  });
}

// Handle alarm trigger
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('🔄 Auto-refresh triggered at', new Date().toLocaleTimeString());
    await refreshDealsInBackground();
  }
  if (alarm.name === VETTR_SYNC_ALARM) {
    const { vettrAuthToken } = await chrome.storage.local.get(['vettrAuthToken']);
    if (vettrAuthToken) {
      runFullSync().catch((err) => {
        console.warn('☁️ Scheduled Vettr sync failed:', err.message);
      });
    }
  }
});

async function ensureVettrSyncAlarm() {
  const { vettrAuthToken } = await chrome.storage.local.get(['vettrAuthToken']);
  if (vettrAuthToken) {
    chrome.alarms.create(VETTR_SYNC_ALARM, { periodInMinutes: VETTR_SYNC_INTERVAL_MIN });
  } else {
    chrome.alarms.clear(VETTR_SYNC_ALARM);
  }
}

// Refresh deals in background
async function refreshDealsInBackground() {
  try {
    console.log('📥 Fetching new deals...');
    
    // Get current settings
    const { 
      aggregatedDealsPool, 
      buyBoxSettings,
      lastDealCount,
      notifyNewDeals 
    } = await chrome.storage.local.get([
      'aggregatedDealsPool',
      'buyBoxSettings',
      'lastDealCount',
      'notifyNewDeals'
    ]);
    
    const previousDeals = aggregatedDealsPool || [];
    const previousCount = lastDealCount || previousDeals.length;
    
    // Send message to any open dashboard tabs to refresh
    const tabs = await chrome.tabs.query({});
    let refreshed = false;
    
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'backgroundRefresh',
          timestamp: Date.now()
        });
        refreshed = true;
        console.log('✅ Sent refresh signal to tab:', tab.id);
      } catch (err) {
        // Tab doesn't have our content script, skip
      }
    }
    
    // Wait a bit for refresh to complete
    if (refreshed) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check for new deals
      const { aggregatedDealsPool: updatedDeals } = await chrome.storage.local.get('aggregatedDealsPool');
      const newDeals = (updatedDeals || []).filter(deal => {
        const isNew = deal.discoveredAt > (Date.now() - 24 * 60 * 60 * 1000);
        return isNew && !previousDeals.some(pd => pd.id === deal.id);
      });
      
      // Filter by Buy Box if configured
      let matchingNewDeals = newDeals;
      if (buyBoxSettings && newDeals.length > 0) {
        matchingNewDeals = newDeals.filter(deal => dealMatchesBuyBox(deal, buyBoxSettings));
      }
      
      // Update last refresh time and count
      await chrome.storage.local.set({
        lastRefreshTime: Date.now(),
        lastDealCount: (updatedDeals || []).length
      });
      
      // Notify if new matching deals found
      if (notifyNewDeals && matchingNewDeals.length > 0) {
        showNewDealsNotification(matchingNewDeals.length);
      }
      
      console.log(`✅ Refresh complete: ${matchingNewDeals.length} new matching deals`);
    }
    
  } catch (error) {
    console.error('❌ Background refresh failed:', error);
  }
}

// Check if deal matches Buy Box criteria
function dealMatchesBuyBox(deal, buyBox) {
  if (!buyBox) return true;
  
  // Price filter
  if (buyBox.minPrice && deal.askingPrice < buyBox.minPrice) return false;
  if (buyBox.maxPrice && deal.askingPrice > buyBox.maxPrice) return false;
  
  // EBITDA filter
  if (buyBox.minEbitda && deal.ebitda < buyBox.minEbitda) return false;
  if (buyBox.maxEbitda && deal.ebitda > buyBox.maxEbitda) return false;
  
  // Revenue filter
  if (buyBox.minRevenue && deal.revenue < buyBox.minRevenue) return false;
  if (buyBox.maxRevenue && deal.revenue > buyBox.maxRevenue) return false;
  
  // Location filter (target states)
  if (buyBox.targetStates && buyBox.targetStates.length > 0) {
    const dealState = (deal.state || '').toUpperCase().trim();
    const hasTargetState = buyBox.targetStates.some(s => 
      s.toUpperCase().trim() === dealState
    );
    if (!hasTargetState) return false;
  }
  
  // Exclude states
  if (buyBox.excludeStates && buyBox.excludeStates.length > 0) {
    const dealState = (deal.state || '').toUpperCase().trim();
    const isExcluded = buyBox.excludeStates.some(s => 
      s.toUpperCase().trim() === dealState
    );
    if (isExcluded) return false;
  }
  
  // Industry filter
  if (buyBox.targetIndustries && buyBox.targetIndustries.length > 0) {
    const dealIndustry = (deal.industry || '').toLowerCase();
    const hasTargetIndustry = buyBox.targetIndustries.some(ind => 
      dealIndustry.includes(ind.toLowerCase())
    );
    if (!hasTargetIndustry) return false;
  }
  
  return true;
}

// Show notification for new deals
function showNewDealsNotification(count) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '🎯 New Deals Found!',
    message: `${count} new deal${count > 1 ? 's' : ''} matching your Buy Box criteria`,
    priority: 2,
    requireInteraction: false
  }, (notificationId) => {
    console.log('📬 Notification shown:', notificationId);
    
    // Auto-clear after 10 seconds
    setTimeout(() => {
      chrome.notifications.clear(notificationId);
    }, 10000);
  });
}

// Handle notification clicks - open dashboard
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('🖱️ Notification clicked:', notificationId);
  // Could open dashboard in new tab or focus existing tab
});

// Vettr web app (logged-in tab) pushes session — no manual token paste for users
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'VETTR_SET_SESSION' && message.token && message.apiBaseUrl) {
    const base = VettrCloudSync.normalizeApiBaseUrl(message.apiBaseUrl);
    const patch = {
      vettrAuthToken: message.token,
      vettrApiBaseUrl: base || message.apiBaseUrl.trim(),
      vettrUserEmail: message.email || undefined,
      vettrWebAppUrl: message.webAppUrl || (typeof VettrConfig !== 'undefined' ? VettrConfig.getDefaultWebAppUrl() : 'http://localhost:5173')
    };
    if (message.teamId != null && Number(message.teamId) > 0) {
      patch.vettrTeamId = Number(message.teamId);
    }
    chrome.storage.local.set(patch, () => {
      console.log('☁️ Vettr session received from web app (My Deals sync enabled)', {
        teamId: patch.vettrTeamId || null
      });
      const finish = () => {
        scheduleFullSyncAfterLink();
        ensureVettrSyncAlarm();
        sendResponse({ ok: true });
      };
      if (patch.vettrTeamId) {
        finish();
      } else {
        resolveAndStoreDefaultTeamId(patch.vettrApiBaseUrl, message.token).finally(finish);
      }
    });
    return true;
  }

  if (message?.type === 'VETTR_LOGIN' && message.email && message.password) {
    handleVettrLogin(message.email, message.password, message.apiBaseUrl, message.webAppUrl)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === 'VETTR_CLEAR_SESSION') {
    chrome.storage.local.remove(['vettrAuthToken', 'vettrUserEmail', 'vettrTeamId'], () => {
      console.log('☁️ Vettr session cleared (logout on web)');
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type === 'VETTR_REQUEST_SYNC') {
    runFullSync()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  return false;
});

// Handle messages from dashboard / content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'testNotification') {
    console.log('🧪 Test notification requested');
    showNewDealsNotification(3); // Show test with 3 deals
    sendResponse({ success: true });
    return true;
  }
  if (message.type === 'VETTR_SYNC_DEAL' && message.body) {
    postVettrSaveDeal(message.body)
      .then((result) => {
        console.log('☁️ Vettr Cloud: deal synced');
        notifyWebAppTabs();
        sendResponse({ ok: true, result: result });
      })
      .catch((err) => {
        console.warn('☁️ Vettr Cloud sync failed:', err.message);
        sendResponse({ ok: false, error: err.message, sessionExpired: err.message === SESSION_EXPIRED });
      });
    return true;
  }
  if (message.type === 'VETTR_UPDATE_DEAL' && message.vettrId && message.body) {
    putVettrDeal(message.vettrId, message.body)
      .then((result) => {
        notifyWebAppTabs();
        sendResponse({ ok: true, result: result });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message, sessionExpired: err.message === SESSION_EXPIRED }));
    return true;
  }
  if (message.type === 'VETTR_DELETE_DEAL' && message.vettrId) {
    deleteVettrDeal(message.vettrId)
      .then(() => {
        notifyWebAppTabs();
        sendResponse({ ok: true });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message, sessionExpired: err.message === SESSION_EXPIRED }));
    return true;
  }
  if (message.type === 'VETTR_PULL_DEALS') {
    pullVettrDeals()
      .then((deals) => sendResponse({ ok: true, deals: deals }))
      .catch((err) => sendResponse({ ok: false, error: err.message, sessionExpired: err.message === SESSION_EXPIRED }));
    return true;
  }
  if (message.type === 'VETTR_FULL_SYNC') {
    runFullSync()
      .then((result) => sendResponse({ ok: true, result: result }))
      .catch((err) => sendResponse({ ok: false, error: err.message, sessionExpired: err.message === SESSION_EXPIRED }));
    return true;
  }
  if (message.type === 'VETTR_REQUEST_SYNC') {
    runFullSync()
      .then((result) => sendResponse({ ok: true, result: result }))
      .catch((err) => sendResponse({ ok: false, error: err.message, sessionExpired: err.message === SESSION_EXPIRED }));
    return true;
  }
  if (message.type === 'VETTR_LINK_STATUS') {
    getVettrAuthConfig().then(async (cfg) => {
      const stored = await chrome.storage.local.get(['vettrUserEmail', 'vettrLastSyncAt']);
      sendResponse({
        linked: Boolean(cfg.vettrAuthToken),
        email: stored.vettrUserEmail || '',
        apiBase: cfg.vettrApiBaseUrl,
        webAppUrl: cfg.vettrWebAppUrl,
        lastSyncAt: stored.vettrLastSyncAt || null
      });
    });
    return true;
  }
  if (message.type === 'VETTR_LOGIN' && message.email && message.password) {
    handleVettrLogin(message.email, message.password, message.apiBaseUrl, message.webAppUrl)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === 'VETTR_SIGN_OUT') {
    chrome.storage.local.remove(['vettrAuthToken', 'vettrUserEmail', 'vettrTeamId'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.vettrAuthToken) {
      ensureVettrSyncAlarm();
    }
    if (changes.autoRefreshEnabled || changes.refreshInterval) {
      const enabled = changes.autoRefreshEnabled?.newValue ?? true;
      const interval = changes.refreshInterval?.newValue ?? DEFAULT_REFRESH_INTERVAL;
      
      if (enabled) {
        scheduleAutoRefresh(interval);
      } else {
        chrome.alarms.clear(ALARM_NAME);
        console.log('⏸️ Auto-refresh disabled');
      }
    }
  }
});

// ====== EXTENSION ICON CLICK ======
chrome.action.onClicked.addListener(async (tab) => {
  console.log('🖱️ Extension icon clicked on tab:', tab.id);
  
  // Try to send message to content script to toggle the popup overlay
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "toggleWindow" });
    console.log('✅ Toggle message sent to content script');
  } catch (error) {
    // Content script not available (chrome:// pages, new tab, PDF, etc.)
    console.log('⚠️ Content script not available, opening dashboard in new tab');
    console.log('   Reason:', error.message);
    
    // Check if dashboard is already open in any tab
    const tabs = await chrome.tabs.query({});
    const dashboardTab = tabs.find(t => t.url && t.url.includes('deals-dashboard.html'));
    
    if (dashboardTab) {
      // Focus existing dashboard tab
      console.log('✅ Dashboard already open, focusing tab:', dashboardTab.id);
      await chrome.tabs.update(dashboardTab.id, { active: true });
      await chrome.windows.update(dashboardTab.windowId, { focused: true });
    } else {
      // Open dashboard in new tab
      console.log('🚀 Opening dashboard in new tab');
      const dashboardUrl = chrome.runtime.getURL('deals-dashboard.html');
      await chrome.tabs.create({ url: dashboardUrl });
    }
  }
});

