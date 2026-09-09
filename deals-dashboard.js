// Deals Dashboard JavaScript

// ===== DARK MODE - Load immediately on page load =====
(function() {
    console.log('🌓 Dark mode script starting...');
    
    function applyDarkMode(enabled) {
        console.log('🌓 Applying dark mode:', enabled);
        if (enabled) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
    
    function loadDarkMode() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['userPreferences'], (result) => {
                const darkMode = result.userPreferences?.darkMode === true;
                console.log('🌓 User preferences:', result.userPreferences);
                console.log('🌓 Dark mode enabled:', darkMode);
                applyDarkMode(darkMode);
            });
        }
    }
    
    // Load immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadDarkMode);
    } else {
        loadDarkMode();
    }
    
    // Listen for changes
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.userPreferences) {
                const darkMode = changes.userPreferences.newValue?.darkMode === true;
                console.log('🌓 Dark mode changed to:', darkMode);
                applyDarkMode(darkMode);
            }
        });
    }
    
    // Poll every 500ms as backup
    setInterval(() => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['userPreferences'], (result) => {
                const darkMode = result.userPreferences?.darkMode === true;
                const currentlyDark = document.body.classList.contains('dark-mode');
                if (darkMode !== currentlyDark) {
                    console.log('🌓 Polling detected change to:', darkMode);
                    applyDarkMode(darkMode);
                }
            });
        }
    }, 500);
})();

// ===== TAB NAVIGATION & JOURNEY INDICATOR =====
let currentJourneyStage = 'data'; // data, information, knowledge, insight, wisdom
let currentTab = 'aggregator'; // aggregator, my-deals

// Update journey indicator
function updateJourneyStage(stage) {
    console.log('🎯 Updating journey stage to:', stage);
    currentJourneyStage = stage;
    
    const stages = document.querySelectorAll('.journey-stage');
    stages.forEach(stageEl => {
        const stageData = stageEl.getAttribute('data-stage');
        stageEl.classList.remove('active', 'completed');
        
        if (stageData === stage) {
            stageEl.classList.add('active');
        } else {
            // Mark previous stages as completed
            const stageOrder = ['data', 'information', 'knowledge', 'insight', 'wisdom'];
            const currentIndex = stageOrder.indexOf(stage);
            const stageIndex = stageOrder.indexOf(stageData);
            if (stageIndex < currentIndex) {
                stageEl.classList.add('completed');
            }
        }
    });
}

// Switch between tabs
function switchTab(tabName) {
    console.log('📑 Switching to tab:', tabName);
    currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) {
        targetTab.classList.add('active');
        console.log('✅ Tab switched to:', tabName);
    } else {
        console.error('❌ Tab not found:', `tab-${tabName}`);
    }
    
    // Update journey stage based on tab
    if (tabName === 'aggregator') {
        updateJourneyStage('data');
    } else if (tabName === 'my-deals') {
        updateJourneyStage('wisdom');
        loadMyDeals();
        maybeVettrFullSync();
        refreshVettrAccountBar();
        startVettrMyDealsPoll();
    } else {
        stopVettrMyDealsPoll();
    }
}

// Initialize tabs on load
async function initializeDashboard() {
    // Get version from centralized version.js (fallback: manifest)
    const version = window.EXTENSION_VERSION || (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '3.0.0';
    
    // Update header version display (must use central version, no hardcoding)
    const headerVersionEl = document.getElementById('header-version');
    if (headerVersionEl) headerVersionEl.textContent = `v${version}`;
    
    console.log(`Initializing Deal Aggregator v${version}`);
    
    // Load Buy Box configuration FIRST before anything else
    console.log('📦 Loading Buy Box configuration...');
    await loadBuyBoxConfig();
    console.log('✅ Buy Box configuration loaded:', currentBuyBox);
    
    // Initialize default source and auto-fetch on first launch
    console.log('🔍 Checking for first launch...');
    const isFirstLaunch = await initializeDefaultSource();
    if (isFirstLaunch) {
        console.log('🎉 First launch detected - auto-fetching real business listings...');
        // Wait a moment for UI to be ready, then auto-fetch
        setTimeout(async () => {
            try {
                await startAggregation(null, true); // true = silent mode, no button state changes
                showToast('Welcome! Loaded 100+ real business listings to get you started. Add your own sources anytime!', 'success', 6000);
            } catch (error) {
                console.error('❌ Auto-fetch failed:', error);
                showToast('Welcome! Click "🔄 Fetch Deals" to load business listings.', 'info', 5000);
            }
        }, 1000);
    }
    
    // Add global test functions for debugging
    window.testSourceModal = function() {
        console.log('🧪 Testing source modal...');
        const modal = document.getElementById('source-management-modal');
        if (modal) {
            console.log('✅ Modal found');
            console.log('   Current styles:', {
                display: modal.style.display,
                visibility: modal.style.visibility,
                zIndex: modal.style.zIndex,
                computed: window.getComputedStyle(modal).display
            });
            modal.style.display = 'flex';
            modal.style.visibility = 'visible';
            modal.style.zIndex = '99999';
            console.log('   After setting:', {
                display: modal.style.display,
                visibility: modal.style.visibility,
                zIndex: modal.style.zIndex
            });
        } else {
            console.error('❌ Modal not found');
        }
    };
    
    window.testManualModal = function() {
        console.log('🧪 Testing manual deal modal...');
        const modal = document.getElementById('manual-deal-modal');
        if (modal) {
            console.log('✅ Modal found');
            modal.style.display = 'flex';
            modal.style.visibility = 'visible';
            modal.style.zIndex = '99999';
        } else {
            console.error('❌ Modal not found');
        }
    };
    
    console.log('🧪 Test functions available: window.testSourceModal() and window.testManualModal()');
    
    // Verify required functions are available
    console.log('📦 Checking dependencies...');
    console.log('  ℹ️  RSS feeds disabled - Google Sheets only mode');
    console.log('  ℹ️  Storage limit: 100,000 most recent deals');
    console.log('  addDealsToPool:', typeof addDealsToPool !== 'undefined' ? '✅' : '❌');
    console.log('  loadAggregatedDeals:', typeof loadAggregatedDeals !== 'undefined' ? '✅' : '❌');
    console.log('  getCustomSources:', typeof getCustomSources !== 'undefined' ? '✅' : '❌');
    console.log('  addCustomSource:', typeof addCustomSource !== 'undefined' ? '✅' : '❌');

    initVettrAccountBar();
    console.log('  fetchAllCustomSources:', typeof fetchAllCustomSources !== 'undefined' ? '✅' : '❌');
    console.log('  openSourceManagementModal:', typeof openSourceManagementModal !== 'undefined' ? '✅' : '❌');
    console.log('  openManualDealModal:', typeof openManualDealModal !== 'undefined' ? '✅' : '❌');
    
    // ====== GLOBAL ACTION BUTTONS (Header) ======
    // These buttons are always visible and accessible regardless of tab
    
    // Fetch Deals button
    const fetchDealsBtn = document.getElementById('fetch-deals-btn');
    if (fetchDealsBtn) {
        console.log('✅ Setting up Fetch Deals button');
        fetchDealsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔄 Fetch Deals button clicked');
            startAggregation(fetchDealsBtn);
        });
    }
    
    // Manage Sources button
    const manageSourcesBtn = document.getElementById('manage-sources-btn');
    if (manageSourcesBtn) {
        console.log('✅ Setting up Manage Sources button');
        manageSourcesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('📥 Manage Sources button clicked');
            console.log('📥 window.openSourceManagementModal type:', typeof window.openSourceManagementModal);
            if (window.openSourceManagementModal) {
                window.openSourceManagementModal();
            } else {
                console.error('❌ openSourceManagementModal not found on window');
                alert('Source management modal not available. Please refresh.');
            }
        });
    } else {
        console.error('❌ manage-sources-btn not found in DOM');
    }
    
    // Add Deal button
    const addDealBtn = document.getElementById('add-deal-btn');
    if (addDealBtn) {
        console.log('✅ Setting up Add Deal button');
        addDealBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('➕ Add Deal button clicked');
            console.log('➕ window.openManualDealModal type:', typeof window.openManualDealModal);
            if (window.openManualDealModal) {
                window.openManualDealModal();
            } else {
                console.error('❌ openManualDealModal not found on window');
                alert('Manual deal modal not available. Please refresh.');
            }
        });
    } else {
        console.error('❌ add-deal-btn not found in DOM');
    }
    
    // Configure Buy Box button
    const configureBuyBoxBtn = document.getElementById('configure-buybox-btn');
    if (configureBuyBoxBtn) {
        console.log('✅ Setting up Configure Buy Box button');
        configureBuyBoxBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('⚙️ Configure Buy Box button clicked');
            console.log('⚙️ window.openBuyBoxModal type:', typeof window.openBuyBoxModal);
            if (window.openBuyBoxModal) {
                window.openBuyBoxModal();
            } else {
                console.error('❌ openBuyBoxModal not found on window');
                alert('Buy Box modal not available. Please refresh.');
            }
        });
    } else {
        console.error('❌ configure-buybox-btn not found in DOM');
    }
    
    console.log('✅ Global action buttons initialized');
    
    // Show Hidden Deals toggle
    const showHiddenToggle = document.getElementById('show-hidden-deals-toggle');
    if (showHiddenToggle) {
        console.log('✅ Setting up Show Hidden Deals toggle');
        showHiddenToggle.addEventListener('change', () => {
            console.log('👁️ Show hidden deals toggled:', showHiddenToggle.checked);
            applyAggregatorFilters();
        });
    }
    
    // Update hidden count on load
    updateHiddenDealsCount();
    
    // Set up tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    // Set up journey stage clickability (for navigation hints)
    document.querySelectorAll('.journey-stage').forEach(stage => {
        stage.addEventListener('click', () => {
            const stageName = stage.getAttribute('data-stage');
            console.log('Journey stage clicked:', stageName);
            // Future: Navigate to appropriate view based on stage
        });
    });
    
    // Start aggregation button function (make it accessible globally)
    window.startAggregation = async function(btn, silentMode = false) {
        if (!silentMode) {
            showToast('Starting deal aggregation from Google Sheets...', 'info');
        }
        
        if (btn) {
            btn.disabled = true;
            btn.classList.add('loading');
        }
        
        try {
            console.log('🔄 Fetching deals from Google Sheets only...');
            const allDeals = [];
            let customCount = 0;
            
            // Fetch custom sources (Google Sheets only for now - RSS disabled)
            try {
                if (typeof fetchAllCustomSources !== 'undefined') {
                    const customResults = await fetchAllCustomSources();
                    const customDeals = customResults.flatMap(r => r.deals);
                    allDeals.push(...customDeals);
                    customCount = customDeals.length;
                    console.log(`📥 Fetched ${customCount} deals from Google Sheets`);
                }
            } catch (error) {
                console.error('Error fetching Google Sheets:', error);
                if (!silentMode) {
                    showToast('⚠️ Google Sheets fetch failed: ' + error.message, 'error');
                }
            }
            
            // Add all deals to storage
            if (allDeals.length > 0) {
                const stats = await addDealsToPool(allDeals);
                console.log(`📊 Added ${stats.added} new, updated ${stats.updated}, unchanged ${stats.unchanged}, total: ${stats.total}`);
                
                if (!silentMode) {
                    // Build summary message
                    const parts = [];
                    if (stats.added > 0) parts.push(`${stats.added} new`);
                    if (stats.updated > 0) parts.push(`${stats.updated} updated`);
                    if (stats.unchanged > 0) parts.push(`${stats.unchanged} unchanged`);
                    
                    const summary = parts.length > 0 ? parts.join(', ') : 'No changes';
                    showToast(`✅ ${summary}. Total: ${stats.total} deals`, 'success', 5000);
                }
            } else {
                if (!silentMode) {
                    showToast('ℹ️ No deals found. Add Google Sheet in "Manage Sources"', 'info', 5000);
                }
            }
            
            // Update UI
            await loadAggregatorDeals();
            await updateHiddenDealsCount(); // Update hidden count
            
        } catch (error) {
            console.error('Error aggregating deals:', error);
            if (!silentMode) {
                showToast('❌ Error aggregating deals: ' + error.message, 'error');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('loading');
            }
        }
    };
    
    // Start aggregation button (bottom - in empty state)
    const startBtn = document.getElementById('start-aggregation');
    if (startBtn) {
        startBtn.addEventListener('click', () => startAggregation(startBtn));
    }
    
    // Load aggregated deals on tab switch
    loadAggregatorDeals();
    
    // Load My Deals on initial page load (so table is ready even if not visible)
    // This ensures rows are clickable when user switches to My Deals tab
    loadMyDeals();
    
    // Set up aggregator table sorting (multi-level with Shift+Click)
    initializeAggregatorSorting();
    
    // Set up aggregator search
    const searchInput = document.getElementById('aggregator-search');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                applyAggregatorFilters();
            }, 300);
        });
    }
    
    // Set up exclude keywords with tags UI
    initializeExcludeKeywords();
    
    // Set up column visibility and clear/refresh
    initializeColumnVisibility();
    initializeClearRefresh();
    
    // Set up column drag & drop and resizing
    setTimeout(() => {
        initializeColumnDragDrop();
    }, 500); // Delay to ensure table is rendered
    
    // Set up deal details panel
    initializeDealPanel();
    
    // Set up pagination buttons
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderAggregatorTable();
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredAggregatedDeals.length / DEALS_PER_PAGE);
            if (currentPage < totalPages) {
                currentPage++;
                renderAggregatorTable();
            }
        });
    }
    
    // ====== MY DEALS TAB EVENT LISTENERS ======
    
    // Search
    const myDealsSearch = document.getElementById('search');
    if (myDealsSearch) {
        let searchTimeout;
        myDealsSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchMyDeals(e.target.value);
            }, 300);
        });
    }
    
    // Status filter
    const statusFilter = document.getElementById('filter-status');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            filterMyDealsByStatus(e.target.value);
        });
    }
    
    // Sort
    const sortSelect = document.getElementById('sort-by');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const [field, direction] = e.target.value.split('-');
            currentMyDealsSort = { field, direction };
            renderMyDealsTable();
        });
    }
    
    // Export all button
    const exportAllBtn = document.getElementById('export-btn');
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', () => {
            exportDealsToCSV(filteredMyDeals);
        });
    }
    
    // Backup button (saves JSON to Downloads - survives extension reinstall)
    const backupBtn = document.getElementById('backup-btn');
    if (backupBtn) {
        backupBtn.addEventListener('click', () => exportBackup());
    }
    
    // Restore button (import from backup file)
    const restoreBtn = document.getElementById('restore-btn');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => importBackup());
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadMyDeals();
        });
    }
    
    // Bulk export button
    const bulkExportBtn = document.getElementById('bulk-export');
    if (bulkExportBtn) {
        bulkExportBtn.addEventListener('click', bulkExportDeals);
    }
    
    // Bulk delete button
    const bulkDeleteBtn = document.getElementById('bulk-delete');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', bulkDeleteDeals);
    }
    
    // Bulk deselect button
    const bulkDeselectBtn = document.getElementById('bulk-deselect');
    if (bulkDeselectBtn) {
        bulkDeselectBtn.addEventListener('click', () => {
            selectedMyDeals.clear();
            document.querySelectorAll('.deal-checkbox').forEach(cb => cb.checked = false);
            updateBulkActionsBar();
        });
    }
    
    console.log('✅ My Deals event listeners initialized');
    
    // Initialize with Deal Aggregator tab
    switchTab('aggregator');
    
    // Verify global buttons are set up (for debugging)
    setTimeout(() => {
        console.log('🔍 Verifying global button setup...');
        const buttons = {
            'fetch-deals-btn': 'Fetch Deals',
            'manage-sources-btn': 'Manage Sources',
            'add-deal-btn': 'Add Deal',
            'configure-buybox-btn': 'Configure Buy Box'
        };
        
        let allFound = true;
        for (const [id, name] of Object.entries(buttons)) {
            const btn = document.getElementById(id);
            if (btn) {
                console.log(`  ✅ ${name} button found (${id})`);
            } else {
                console.error(`  ❌ ${name} button NOT found (${id})`);
                allFound = false;
            }
        }
        
        if (allFound) {
            console.log('✅ All global action buttons found and handlers attached');
        } else {
            console.error('❌ Some buttons are missing!');
        }
    }, 100);
}

// Run initialization - handle case where DOMContentLoaded already fired
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeDashboard().catch(err => {
            console.error('❌ Dashboard initialization failed:', err);
        });
    });
} else {
    // DOM already loaded, run immediately
    console.log('🚀 DOM already ready, initializing immediately...');
    initializeDashboard().catch(err => {
        console.error('❌ Dashboard initialization failed:', err);
    });
}

// Update hidden deals count display
async function updateHiddenDealsCount() {
    try {
        const count = await getHiddenDealsCount();
        const countEl = document.getElementById('hidden-count');
        if (countEl) {
            countEl.textContent = count;
        }
    } catch (error) {
        console.error('Error updating hidden count:', error);
    }
}

// Load and display aggregated deals
let aggregatedDeals = [];
let filteredAggregatedDeals = [];
let currentPage = 1;
const DEALS_PER_PAGE = 50;
// Multi-level sorting: array of {field, direction} objects
let currentAggregatorSort = [{ field: 'date', direction: 'desc' }];

async function loadAggregatorDeals() {
    try {
        // Load Buy Box configuration first
        await loadBuyBoxConfig();
        
        const deals = await loadAggregatedDeals();
        console.log(`📊 Loaded ${deals.length} aggregated deals`);
        
        // DEBUG: Show breakdown by source type
        const sourceBreakdown = {};
        deals.forEach(deal => {
            const sourceType = deal.sourceType || 'unknown';
            sourceBreakdown[sourceType] = (sourceBreakdown[sourceType] || 0) + 1;
        });
        console.log(`📊 Deals by source type:`, sourceBreakdown);
        
        // DEBUG: Log first 2 deals to see structure
        if (deals.length > 0) {
            console.log(`🔍 Sample deal 1:`, {
                name: deals[0].name?.substring(0, 50),
                askingPrice: deals[0].askingPrice,
                ebitda: deals[0].ebitda,
                location: deals[0].location,
                industry: deals[0].industry,
                sourceType: deals[0].sourceType,
                keys: Object.keys(deals[0]).slice(0, 15)
            });
        }
        if (deals.length > 1) {
            console.log(`🔍 Sample deal 2:`, {
                name: deals[1].name?.substring(0, 50),
                askingPrice: deals[1].askingPrice,
                ebitda: deals[1].ebitda,
                location: deals[1].location,
                industry: deals[1].industry,
                sourceType: deals[1].sourceType
            });
        }
        
        aggregatedDeals = deals;
        
        // Update stats
        document.getElementById('total-aggregated').textContent = formatNumber(deals.length);
        document.getElementById('aggregator-count').textContent = formatNumber(deals.length);
        document.getElementById('total-count').textContent = formatNumber(deals.length);
        
        // Calculate today's new deals
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const newToday = deals.filter(d => d.discoveredAt > oneDayAgo).length;
        document.getElementById('new-today').textContent = formatNumber(newToday);
        
        // Update sources count
        const sources = new Set(deals.map(d => d.source));
        document.getElementById('sources-active').textContent = formatNumber(sources.size);
        
        // If we have deals, show table and hide empty state
        const emptyState = document.getElementById('aggregator-empty');
        const tableContainer = document.getElementById('aggregator-table-container');
        
        if (deals.length > 0) {
            if (emptyState) emptyState.style.display = 'none';
            if (tableContainer) tableContainer.classList.add('active');
            
            // IMPORTANT: Apply filters (including Buy Box) immediately
            applyAggregatorFilters();
        } else {
            if (emptyState) emptyState.style.display = 'block';
            if (tableContainer) tableContainer.classList.remove('active');
        }
        
    } catch (error) {
        console.error('Error loading aggregated deals:', error);
        showToast('Error loading deals: ' + error.message, 'error');
    }
}

// Render aggregator table
function renderAggregatorTable() {
    const tbody = document.getElementById('aggregator-tbody');
    if (!tbody) return;
    
    // Sort deals
    const sortedDeals = sortAggregatorDeals(filteredAggregatedDeals, currentAggregatorSort);
    
    // Update showing count stat
    const showingCountElem = document.getElementById('showing-count');
    if (showingCountElem) {
        showingCountElem.textContent = formatNumber(sortedDeals.length);
    }
    
    // Paginate
    const startIdx = (currentPage - 1) * DEALS_PER_PAGE;
    const endIdx = startIdx + DEALS_PER_PAGE;
    const pageDeals = sortedDeals.slice(startIdx, endIdx);
    
    // Clear table
    tbody.innerHTML = '';
    
    // Render rows
    pageDeals.forEach(deal => {
        const row = createAggregatorDealRow(deal);
        tbody.appendChild(row);
    });
    
    // Update pagination
    updateAggregatorPagination(sortedDeals.length);
    
    // IMPORTANT: Update column visibility after rendering
    updateTableColumns();
    
    // IMPORTANT: Update sort indicators after rendering
    updateSortIndicators();
}

// Create table row for a deal
function createAggregatorDealRow(deal) {
    // DEBUG: Log first few deals to see what data we have
    if (window._debugDealCount === undefined) window._debugDealCount = 0;
    if (window._debugDealCount < 3) {
        console.log(`🔍 DEBUG Deal ${window._debugDealCount + 1}:`, {
            id: deal.id,
            name: deal.name?.substring(0, 50),
            askingPrice: deal.askingPrice,
            ebitda: deal.ebitda,
            location: deal.location,
            city: deal.city,
            state: deal.state,
            industry: deal.industry,
            source: deal.source,
            sourceType: deal.sourceType,
            url: deal.url?.substring(0, 50),
            allKeys: Object.keys(deal)
        });
        window._debugDealCount++;
    }
    
    const row = document.createElement('tr');
    row.dataset.dealId = deal.id;
    
    // Helper to check if column is visible
    const isVisible = (colId) => visibleColumns[colId] !== false;
    
    // Helper to create a cell
    const createCell = (colId, content, className = '') => {
        const cell = document.createElement('td');
        cell.dataset.col = colId;
        if (className) cell.className = className;
        if (typeof content === 'string') {
            cell.innerHTML = content;
        }
        // Name always visible, others check visibility
        if (colId !== 'name') {
            cell.style.display = isVisible(colId) ? '' : 'none';
        }
        return cell;
    };
    
    // Create cells map for all columns
    const cells = {};
    
    // Name (always visible)
    const nameCell = createCell('name', '');
    const matchesBuyBox = dealMatchesBuyBox(deal);
    nameCell.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <button class="hide-deal-btn" data-deal-id="${escapeHtml(deal.id)}" title="Hide this deal" onclick="event.stopPropagation();" style="padding: 4px 8px; font-size: 11px; border: none; background: var(--bg-tertiary); color: var(--text-secondary); cursor: pointer; border-radius: 4px;">👁️‍🗨️</button>
            <div class="aggregator-deal-name">
                ${escapeHtml(deal.name || 'Unnamed Deal')}
            </div>
        </div>
    `;
    cells['name'] = nameCell;
    
    // Date Added
    cells['date'] = createCell('date', formatRelativeTime(deal.discoveredAt));
    
    // Industry
    const industryContent = deal.industry ? 
        `<span class="aggregator-industry-tag">${escapeHtml(deal.industry)}</span>` : '-';
    cells['industry'] = createCell('industry', industryContent);
    
    // Description
    const descText = deal.description || '';
    const truncatedDesc = descText.length > 80 ? descText.substring(0, 80) + '...' : descText || '-';
    cells['description'] = createCell('description', escapeHtml(truncatedDesc));
    
    // City, County, State, Country
    cells['city'] = createCell('city', escapeHtml(deal.city || '-'));
    cells['county'] = createCell('county', escapeHtml(deal.county || '-'));
    cells['state'] = createCell('state', escapeHtml(deal.state || '-'));
    cells['country'] = createCell('country', escapeHtml(deal.country || '-'));
    
    // Years Established
    cells['yearsEstablished'] = createCell('yearsEstablished', escapeHtml(deal.yearsEstablished || '-'));
    
    // Asking Price - MUST match "price" column
    cells['price'] = createCell('price', `<span class="aggregator-price">${formatPrice(deal.askingPrice)}</span>`);
    
    // EBITDA - MUST match "ebitda" column  
    cells['ebitda'] = createCell('ebitda', `<span class="aggregator-price positive">${formatPrice(deal.ebitda)}</span>`);
    
    // Revenue - MUST match "revenue" column
    cells['revenue'] = createCell('revenue', `<span class="aggregator-price">${formatPrice(deal.revenue)}</span>`);
    
    // Profit Multiple
    cells['profitMultiple'] = createCell('profitMultiple', deal.profitMultiple ? `${deal.profitMultiple.toFixed(1)}x` : '-');
    
    // Revenue Multiple
    cells['revenueMultiple'] = createCell('revenueMultiple', deal.revenueMultiple ? `${deal.revenueMultiple.toFixed(1)}x` : '-');
    
    // Remote/Relocatable/Absentee-Run
    cells['remote'] = createCell('remote', escapeHtml(deal.remote || '-'));
    
    // Franchise
    cells['franchise'] = createCell('franchise', escapeHtml(deal.franchise || '-'));
    
    // 5+ Years In Business
    cells['fiveYearsInBusiness'] = createCell('fiveYearsInBusiness', escapeHtml(deal.fiveYearsInBusiness || '-'));
    
    // Location
    cells['location'] = createCell('location', escapeHtml(deal.location || '-'));
    
    // Broker
    cells['broker'] = createCell('broker', escapeHtml(deal.broker || deal.brokerName || '-'));
    
    // Broker Company
    cells['brokerCompany'] = createCell('brokerCompany', escapeHtml(deal.brokerCompany || '-'));
    
    // Broker Phone
    cells['brokerPhone'] = createCell('brokerPhone', escapeHtml(deal.brokerPhone || '-'));
    
    // Broker Email
    cells['brokerEmail'] = createCell('brokerEmail', escapeHtml(deal.brokerEmail || '-'));
    
    // Source
    cells['source'] = createCell('source', escapeHtml(deal.source || deal.sourceType || '-'));
    
    // URL
    const urlContent = deal.url ? 
        `<a href="${escapeHtml(deal.url)}" target="_blank" class="deal-link" onclick="event.stopPropagation()">View</a>` : '-';
    cells['url'] = createCell('url', urlContent);
    
    // Add cells for rawColumns if they exist
    if (deal.rawColumns && typeof deal.rawColumns === 'object') {
        Object.entries(deal.rawColumns).forEach(([colName, value]) => {
            const colId = 'raw_' + colName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (COLUMN_CONFIG[colId]) {
                cells[colId] = createCell(colId, escapeHtml(String(value || '-')));
            }
        });
    }
    
    // Append cells in the same order as headers (COLUMN_ORDER)
    COLUMN_ORDER.forEach(colId => {
        if (cells[colId]) {
            row.appendChild(cells[colId]);
        }
    });
    
    // Add any rawColumn cells not in COLUMN_ORDER
    Object.keys(cells).forEach(colId => {
        if (colId.startsWith('raw_') && !COLUMN_ORDER.includes(colId)) {
            row.appendChild(cells[colId]);
        }
    });
    
    // Row click to view details
    row.addEventListener('click', () => {
        viewDealDetails(deal);
    });
    
    // Hide button click handler
    const hideBtn = nameCell.querySelector('.hide-deal-btn');
    if (hideBtn) {
        hideBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await hideDeal(deal.id);
            showToast(`Deal hidden: ${deal.name}`, 'success', 2000);
            await loadAggregatorDeals(); // Reload to apply filter
        });
    }
    
    return row;
}

// Initialize/reinitialize sorting event listeners on aggregator table headers
function initializeAggregatorSorting() {
    // Remove existing listeners by cloning and replacing (prevents double-binding)
    document.querySelectorAll('.aggregator-table th.sortable').forEach(th => {
        const newTh = th.cloneNode(true);
        th.parentNode.replaceChild(newTh, th);
    });
    
    // Attach fresh event listeners
    document.querySelectorAll('.aggregator-table th.sortable').forEach(th => {
        th.addEventListener('click', (e) => {
            const sortField = th.getAttribute('data-sort');
            
            console.log('🔄 Sort clicked:', sortField, 'Shift:', e.shiftKey);
            
            if (e.shiftKey) {
                // Shift+Click: Add to multi-level sort
                const existingIndex = currentAggregatorSort.findIndex(s => s.field === sortField);
                
                if (existingIndex >= 0) {
                    // Field already in sort - toggle direction
                    currentAggregatorSort[existingIndex].direction = 
                        currentAggregatorSort[existingIndex].direction === 'asc' ? 'desc' : 'asc';
                } else {
                    // Add new sort level
                    currentAggregatorSort.push({ field: sortField, direction: 'asc' });
                }
            } else {
                // Regular click: Single-level sort (or toggle if already sorting by this field)
                const isSingleSort = currentAggregatorSort.length === 1 && currentAggregatorSort[0].field === sortField;
                
                if (isSingleSort) {
                    // Toggle direction
                    currentAggregatorSort[0].direction = currentAggregatorSort[0].direction === 'asc' ? 'desc' : 'asc';
                } else {
                    // New single sort
                    currentAggregatorSort = [{ field: sortField, direction: 'asc' }];
                }
            }
            
            console.log('🔄 Current sort config:', currentAggregatorSort);
            
            // Update UI with sort indicators
            updateSortIndicators();
            
            // Re-render
            renderAggregatorTable();
        });
    });
    
    console.log('✅ Initialized sorting on', document.querySelectorAll('.aggregator-table th.sortable').length, 'columns');
}

// Sort aggregator deals
function sortAggregatorDeals(deals, sortConfig) {
    const sorted = [...deals];
    
    sorted.sort((a, b) => {
        // Multi-level sorting: iterate through sort levels
        for (let i = 0; i < sortConfig.length; i++) {
            const sort = sortConfig[i];
            let aVal, bVal;
            
            switch (sort.field) {
                case 'name':
                    aVal = (a.name || '').toLowerCase();
                    bVal = (b.name || '').toLowerCase();
                    break;
                case 'price':
                    aVal = a.askingPrice || 0;
                    bVal = b.askingPrice || 0;
                    break;
                case 'ebitda':
                    aVal = a.ebitda || 0;
                    bVal = b.ebitda || 0;
                    break;
                case 'revenue':
                    aVal = a.revenue || 0;
                    bVal = b.revenue || 0;
                    break;
                case 'location':
                    aVal = (a.location || a.city || '').toLowerCase();
                    bVal = (b.location || b.city || '').toLowerCase();
                    break;
                case 'industry':
                    aVal = (a.industry || '').toLowerCase();
                    bVal = (b.industry || '').toLowerCase();
                    break;
                case 'source':
                    aVal = (a.source || '').toLowerCase();
                    bVal = (b.source || '').toLowerCase();
                    break;
                case 'date':
                    aVal = a.discoveredAt || 0;
                    bVal = b.discoveredAt || 0;
                    break;
                case 'description':
                    aVal = (a.description || '').toLowerCase();
                    bVal = (b.description || '').toLowerCase();
                    break;
                case 'city':
                    aVal = (a.city || '').toLowerCase();
                    bVal = (b.city || '').toLowerCase();
                    break;
                case 'county':
                    aVal = (a.county || '').toLowerCase();
                    bVal = (b.county || '').toLowerCase();
                    break;
                case 'state':
                    aVal = (a.state || '').toLowerCase();
                    bVal = (b.state || '').toLowerCase();
                    break;
                case 'country':
                    aVal = (a.country || '').toLowerCase();
                    bVal = (b.country || '').toLowerCase();
                    break;
                case 'yearsEstablished':
                    aVal = parseInt(a.yearsEstablished) || 0;
                    bVal = parseInt(b.yearsEstablished) || 0;
                    break;
                case 'profitMultiple':
                    aVal = a.profitMultiple || 0;
                    bVal = b.profitMultiple || 0;
                    break;
                case 'revenueMultiple':
                    aVal = a.revenueMultiple || 0;
                    bVal = b.revenueMultiple || 0;
                    break;
                case 'remote':
                    aVal = (a.remote || '').toLowerCase();
                    bVal = (b.remote || '').toLowerCase();
                    break;
                case 'franchise':
                    aVal = (a.franchise || '').toLowerCase();
                    bVal = (b.franchise || '').toLowerCase();
                    break;
                case 'fiveYearsInBusiness':
                    aVal = (a.fiveYearsInBusiness || '').toLowerCase();
                    bVal = (b.fiveYearsInBusiness || '').toLowerCase();
                    break;
                case 'broker':
                    aVal = (a.broker || a.brokerName || '').toLowerCase();
                    bVal = (b.broker || b.brokerName || '').toLowerCase();
                    break;
                case 'brokerCompany':
                    aVal = (a.brokerCompany || '').toLowerCase();
                    bVal = (b.brokerCompany || '').toLowerCase();
                    break;
                case 'brokerPhone':
                    aVal = (a.brokerPhone || '').toLowerCase();
                    bVal = (b.brokerPhone || '').toLowerCase();
                    break;
                case 'brokerEmail':
                    aVal = (a.brokerEmail || '').toLowerCase();
                    bVal = (b.brokerEmail || '').toLowerCase();
                    break;
                case 'url':
                    aVal = (a.url || '').toLowerCase();
                    bVal = (b.url || '').toLowerCase();
                    break;
                default:
                    // Handle dynamic rawColumns
                    if (sort.field.startsWith('raw_')) {
                        const colName = sort.field.replace('raw_', '').replace(/_/g, ' ');
                        aVal = (a.rawColumns?.[colName] || '').toString().toLowerCase();
                        bVal = (b.rawColumns?.[colName] || '').toString().toLowerCase();
                    } else {
                        continue; // Skip unknown fields
                    }
            }
            
            // Compare values
            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            // Values equal, continue to next sort level
        }
        
        return 0; // All sort levels equal
    });
    
    return sorted;
}

// Update sort indicators on table headers
function updateSortIndicators() {
    // Clear all indicators
    document.querySelectorAll('.aggregator-table th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        // Remove existing priority badges
        const existingBadge = th.querySelector('.sort-priority');
        if (existingBadge) existingBadge.remove();
    });
    
    // Add indicators for each sort level
    currentAggregatorSort.forEach((sort, index) => {
        const header = document.querySelector(`.aggregator-table th[data-sort="${sort.field}"]`);
        if (header) {
            header.classList.add(`sorted-${sort.direction}`);
            
            // Add priority badge if multi-level sort
            if (currentAggregatorSort.length > 1) {
                const badge = document.createElement('span');
                badge.className = 'sort-priority';
                badge.textContent = index + 1;
                badge.title = `Sort priority ${index + 1}`;
                header.appendChild(badge);
            }
        }
    });
}

// Update pagination controls
function updateAggregatorPagination(totalDeals) {
    const totalPages = Math.ceil(totalDeals / DEALS_PER_PAGE);
    const startIdx = (currentPage - 1) * DEALS_PER_PAGE + 1;
    const endIdx = Math.min(currentPage * DEALS_PER_PAGE, totalDeals);
    
    // Update info text
    const infoEl = document.getElementById('pagination-info');
    if (infoEl) {
        infoEl.textContent = `Showing ${formatNumber(startIdx)}-${formatNumber(endIdx)} of ${formatNumber(totalDeals)} deals`;
    }
    
    // Update buttons
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');
    
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    
    // TODO: Update page number buttons dynamically
}

// ====== EXCLUDE KEYWORDS FEATURE ======
let currentExcludeKeywords = [];
let savedExcludeLists = {};

let currentSelectedList = ''; // Track which list is currently selected

function initializeExcludeKeywords() {
    const keywordInput = document.getElementById('exclude-keyword-input');
    const addBtn = document.getElementById('add-exclude-keyword');
    const saveBtn = document.getElementById('save-exclude-list');
    const updateBtn = document.getElementById('update-exclude-list');
    const deleteBtn = document.getElementById('delete-exclude-list');
    const listSelect = document.getElementById('exclude-list-select');
    
    // Set up collapsible toggle
    const headerToggle = document.getElementById('exclude-header-toggle');
    const excludeContent = document.getElementById('exclude-content');
    const toggleIcon = document.getElementById('exclude-toggle-icon');
    
    // Load collapse state from storage
    chrome.storage.local.get(['excludeKeywordsExpanded'], (result) => {
        const isExpanded = result.excludeKeywordsExpanded !== false; // Default to expanded
        excludeContent.style.display = isExpanded ? 'block' : 'none';
        toggleIcon.textContent = isExpanded ? '▼' : '▶';
    });
    
    if (headerToggle) {
        headerToggle.addEventListener('click', (e) => {
            // Don't toggle if clicking on buttons or select
            if (e.target.closest('.exclude-list-controls')) return;
            
            const isCurrentlyVisible = excludeContent.style.display !== 'none';
            excludeContent.style.display = isCurrentlyVisible ? 'none' : 'block';
            toggleIcon.textContent = isCurrentlyVisible ? '▶' : '▼';
            
            // Save state
            chrome.storage.local.set({ excludeKeywordsExpanded: !isCurrentlyVisible });
        });
    }
    
    // Load saved data
    chrome.storage.local.get(['currentExcludeKeywords', 'savedExcludeLists', 'currentSelectedList'], (result) => {
        currentExcludeKeywords = result.currentExcludeKeywords || [];
        savedExcludeLists = result.savedExcludeLists || {};
        currentSelectedList = result.currentSelectedList || '';
        renderExcludeTags();
        populateExcludeListSelect();
        // Restore selected list in dropdown
        if (listSelect && currentSelectedList && savedExcludeLists[currentSelectedList]) {
            listSelect.value = currentSelectedList;
            updateExcludeListButtons();
        }
        applyAggregatorFilters();
    });
    
    // Add keyword on Enter or button click
    if (keywordInput) {
        keywordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addExcludeKeyword(keywordInput.value);
                keywordInput.value = '';
            }
        });
    }
    
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            addExcludeKeyword(keywordInput.value);
            keywordInput.value = '';
            keywordInput.focus();
        });
    }
    
    // Save as new list
    if (saveBtn) {
        saveBtn.addEventListener('click', saveExcludeList);
    }
    
    // Update existing list
    if (updateBtn) {
        updateBtn.addEventListener('click', updateExcludeList);
    }
    
    // Delete list
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteExcludeList);
    }
    
    // Clear all keywords
    const clearBtn = document.getElementById('clear-exclude-keywords');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllExcludeKeywords);
    }
    
    // Load list on selection
    if (listSelect) {
        listSelect.addEventListener('change', (e) => {
            currentSelectedList = e.target.value;
            chrome.storage.local.set({ currentSelectedList });
            updateExcludeListButtons();
            if (e.target.value) {
                loadExcludeList(e.target.value);
            }
        });
    }
}

function updateExcludeListButtons() {
    const updateBtn = document.getElementById('update-exclude-list');
    const deleteBtn = document.getElementById('delete-exclude-list');
    
    if (updateBtn) {
        // Show Update button only when a list is selected
        updateBtn.style.display = currentSelectedList ? 'inline-block' : 'none';
    }
    if (deleteBtn) {
        // Optionally disable delete if no list selected
        deleteBtn.style.opacity = currentSelectedList ? '1' : '0.5';
    }
}

function addExcludeKeyword(keyword) {
    keyword = keyword.trim();
    if (!keyword) return;
    
    // Handle comma-separated input
    const keywords = keyword.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    keywords.forEach(kw => {
        const lowerKw = kw.toLowerCase();
        if (!currentExcludeKeywords.includes(lowerKw)) {
            currentExcludeKeywords.push(lowerKw);
        }
    });
    
    saveCurrentExcludeKeywords();
    renderExcludeTags();
    applyAggregatorFilters();
}

function removeExcludeKeyword(keyword) {
    currentExcludeKeywords = currentExcludeKeywords.filter(k => k !== keyword);
    saveCurrentExcludeKeywords();
    renderExcludeTags();
    applyAggregatorFilters();
}

function saveCurrentExcludeKeywords() {
    chrome.storage.local.set({ currentExcludeKeywords });
}

function renderExcludeTags() {
    const container = document.getElementById('exclude-tags');
    if (!container) return;
    
    if (currentExcludeKeywords.length === 0) {
        container.innerHTML = '<span class="exclude-tags-empty">No keywords excluded. Add keywords above to filter out unwanted deals.</span>';
        return;
    }
    
    container.innerHTML = currentExcludeKeywords.map(keyword => `
        <span class="exclude-tag">
            ${escapeHtml(keyword)}
            <span class="exclude-tag-remove" data-keyword="${escapeHtml(keyword)}" title="Remove">&times;</span>
        </span>
    `).join('');
    
    // Add click handlers for remove buttons
    container.querySelectorAll('.exclude-tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            removeExcludeKeyword(btn.dataset.keyword);
        });
    });
}

function saveExcludeList() {
    if (currentExcludeKeywords.length === 0) {
        showToast('Add some keywords first before saving a list', 'error');
        return;
    }
    
    const listName = prompt('Enter a name for this exclude list:', '');
    if (!listName || !listName.trim()) return;
    
    const name = listName.trim();
    savedExcludeLists[name] = [...currentExcludeKeywords];
    currentSelectedList = name;
    
    chrome.storage.local.set({ savedExcludeLists, currentSelectedList }, () => {
        populateExcludeListSelect();
        document.getElementById('exclude-list-select').value = name;
        updateExcludeListButtons();
        showToast(`Exclude list "${name}" saved with ${currentExcludeKeywords.length} keywords`, 'success');
    });
}

function updateExcludeList() {
    if (!currentSelectedList) {
        showToast('Select a list to update first', 'error');
        return;
    }
    
    if (currentExcludeKeywords.length === 0) {
        showToast('Add some keywords first before updating', 'error');
        return;
    }
    
    savedExcludeLists[currentSelectedList] = [...currentExcludeKeywords];
    
    chrome.storage.local.set({ savedExcludeLists }, () => {
        populateExcludeListSelect();
        // Keep the same list selected
        document.getElementById('exclude-list-select').value = currentSelectedList;
        showToast(`List "${currentSelectedList}" updated with ${currentExcludeKeywords.length} keywords`, 'success');
    });
}

function deleteExcludeList() {
    if (!currentSelectedList) {
        showToast('Select a list to delete', 'error');
        return;
    }
    
    if (!confirm(`Delete exclude list "${currentSelectedList}"?`)) return;
    
    const deletedName = currentSelectedList;
    delete savedExcludeLists[currentSelectedList];
    currentSelectedList = '';
    
    chrome.storage.local.set({ savedExcludeLists, currentSelectedList }, () => {
        populateExcludeListSelect();
        updateExcludeListButtons();
        showToast(`Exclude list "${deletedName}" deleted`, 'success');
    });
}

function clearAllExcludeKeywords() {
    if (currentExcludeKeywords.length === 0) {
        showToast('No keywords to clear', 'info');
        return;
    }
    
    currentExcludeKeywords = [];
    currentSelectedList = '';
    
    // Reset dropdown
    const listSelect = document.getElementById('exclude-list-select');
    if (listSelect) listSelect.value = '';
    
    saveCurrentExcludeKeywords();
    chrome.storage.local.set({ currentSelectedList });
    renderExcludeTags();
    updateExcludeListButtons();
    applyAggregatorFilters();
    
    showToast('All exclude keywords cleared', 'success');
}

function loadExcludeList(listName) {
    if (!savedExcludeLists[listName]) return;
    
    currentExcludeKeywords = [...savedExcludeLists[listName]];
    saveCurrentExcludeKeywords();
    renderExcludeTags();
    applyAggregatorFilters();
    showToast(`Loaded exclude list "${listName}" with ${currentExcludeKeywords.length} keywords`, 'info');
}

function populateExcludeListSelect() {
    const select = document.getElementById('exclude-list-select');
    if (!select) return;
    
    const listNames = Object.keys(savedExcludeLists).sort();
    
    select.innerHTML = '<option value="">-- Select List --</option>' + 
        listNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${savedExcludeLists[name].length})</option>`).join('');
}

// ====== COLUMN VISIBILITY FEATURE ======
// Define all possible columns with display names
const COLUMN_CONFIG = {
    name: { label: 'Name', default: true, required: true },
    date: { label: 'Date Added', default: true },
    industry: { label: 'Industry', default: true },
    description: { label: 'Description', default: false },
    city: { label: 'City', default: false },
    county: { label: 'County', default: false },
    state: { label: 'State', default: false },
    country: { label: 'Country', default: false },
    yearsEstablished: { label: 'Years Established', default: false },
    ebitda: { label: 'Annual Profit', default: true },
    revenue: { label: 'Annual Revenue', default: false },
    price: { label: 'Asking Price', default: true },
    profitMultiple: { label: 'Profit Multiple', default: false },
    revenueMultiple: { label: 'Revenue Multiple', default: false },
    remote: { label: 'Remote/Relocatable/Absentee-Run', default: false },
    franchise: { label: 'Franchise', default: false },
    fiveYearsInBusiness: { label: '5+ Years In Business', default: false },
    broker: { label: 'Broker Name', default: false },
    brokerCompany: { label: 'Broker Company', default: false },
    brokerPhone: { label: 'Broker Contact', default: false },
    brokerEmail: { label: 'Broker Email', default: false },
    location: { label: 'Location', default: true },
    source: { label: 'Source', default: true },
    url: { label: 'Listing URL', default: false }
    // Note: Dynamic columns from rawColumns will be added at runtime
};

let visibleColumns = {};
let availableColumns = []; // Columns that have data

function initializeColumnVisibility() {
    const toggleBtn = document.getElementById('toggle-columns-btn');
    const closeBtn = document.getElementById('close-columns-panel');
    const panel = document.getElementById('column-visibility-panel');
    
    // Load saved column visibility
    chrome.storage.local.get(['visibleColumns'], (result) => {
        if (result.visibleColumns) {
            visibleColumns = result.visibleColumns;
        } else {
            // Set defaults
            Object.keys(COLUMN_CONFIG).forEach(colId => {
                visibleColumns[colId] = COLUMN_CONFIG[colId].default;
            });
        }
        renderColumnCheckboxes();
    });
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            // Refresh available columns before showing
            detectAvailableColumns();
            renderColumnCheckboxes();
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }
}

// Detect which columns actually have data
function detectAvailableColumns() {
    availableColumns = ['name']; // Always available
    
    if (aggregatedDeals.length === 0) {
        // Show all possible columns if no data yet
        availableColumns = Object.keys(COLUMN_CONFIG);
        return;
    }
    
    // Check first 50 deals to see what data exists
    const sampleDeals = aggregatedDeals.slice(0, 50);
    
    // Map column IDs to deal property names
    const fieldMap = {
        date: 'discoveredAt',
        industry: 'industry',
        description: 'description',
        city: 'city',
        county: 'county',
        state: 'state',
        country: 'country',
        yearsEstablished: 'yearsEstablished',
        ebitda: 'ebitda',
        revenue: 'revenue',
        price: 'askingPrice',
        profitMultiple: 'profitMultiple',
        revenueMultiple: 'revenueMultiple',
        remote: 'remote',
        franchise: 'franchise',
        fiveYearsInBusiness: 'fiveYearsInBusiness',
        broker: 'broker',
        brokerCompany: 'brokerCompany',
        brokerPhone: 'brokerPhone',
        brokerEmail: 'brokerEmail',
        location: 'location',
        source: 'source',
        url: 'url'
    };
    
    Object.entries(fieldMap).forEach(([colId, fieldName]) => {
        const hasData = sampleDeals.some(deal => {
            const val = deal[fieldName];
            return val !== null && val !== undefined && val !== '' && val !== '-';
        });
        if (hasData) {
            availableColumns.push(colId);
        }
    });
    
    // Detect columns from rawColumns (additional Google Sheets columns)
    const rawColumnNames = new Set();
    sampleDeals.forEach(deal => {
        if (deal.rawColumns && typeof deal.rawColumns === 'object') {
            Object.keys(deal.rawColumns).forEach(colName => {
                // Only add if it has non-empty data and isn't already mapped
                const val = deal.rawColumns[colName];
                if (val !== null && val !== undefined && val !== '' && val !== '-') {
                    rawColumnNames.add(colName);
                }
            });
        }
    });
    
    console.log(`📋 Detected ${rawColumnNames.size} additional columns from rawColumns:`, Array.from(rawColumnNames));
    
    // Add rawColumn-based columns to COLUMN_CONFIG dynamically
    rawColumnNames.forEach(colName => {
        const colId = 'raw_' + colName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (!COLUMN_CONFIG[colId]) {
            COLUMN_CONFIG[colId] = {
                label: colName,
                default: false,
                rawColumnKey: colName
            };
            availableColumns.push(colId);
        }
    });
    
    console.log(`📊 Total available columns: ${availableColumns.length}`, availableColumns);
}

function renderColumnCheckboxes() {
    const container = document.getElementById('column-checkboxes');
    if (!container) return;
    
    detectAvailableColumns();
    
    // Show only columns that have data
    container.innerHTML = availableColumns.map(colId => {
        const config = COLUMN_CONFIG[colId];
        const isChecked = visibleColumns[colId] !== false;
        const isRequired = config.required;
        
        return `
            <label>
                <input type="checkbox" 
                       data-column="${colId}" 
                       ${isChecked ? 'checked' : ''} 
                       ${isRequired ? 'disabled' : ''} />
                ${config.label}
            </label>
        `;
    }).join('');
    
    // Add change handlers
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            visibleColumns[cb.dataset.column] = cb.checked;
            chrome.storage.local.set({ visibleColumns });
            updateTableColumns();
            renderAggregatorTable();
        });
    });
    
    // Add dynamic headers to table for rawColumns
    addDynamicHeaders();
}

// Add headers for dynamic rawColumns
function addDynamicHeaders() {
    const thead = document.querySelector('.aggregator-table thead tr');
    if (!thead) return;
    
    // Remove old dynamic headers
    thead.querySelectorAll('th[data-col^="raw_"]').forEach(th => th.remove());
    
    // Add new headers for each rawColumn
    Object.keys(COLUMN_CONFIG).forEach(colId => {
        if (colId.startsWith('raw_') && !thead.querySelector(`th[data-col="${colId}"]`)) {
            const config = COLUMN_CONFIG[colId];
            const th = document.createElement('th');
            th.dataset.col = colId;
            th.dataset.sort = colId; // Make it sortable
            th.className = 'sortable'; // Add sortable class
            th.textContent = config.label.toUpperCase();
            th.style.display = visibleColumns[colId] ? '' : 'none';
            thead.appendChild(th);
        }
    });
    
    // Reinitialize sorting after adding dynamic headers
    initializeAggregatorSorting();
}

function updateTableColumns() {
    // Update header visibility
    document.querySelectorAll('.aggregator-table th[data-col]').forEach(th => {
        const colId = th.dataset.col;
        if (colId === 'name') {
            th.style.display = '';
        } else {
            th.style.display = visibleColumns[colId] ? '' : 'none';
        }
    });
    
    // Update cell visibility
    document.querySelectorAll('.aggregator-table td[data-col]').forEach(td => {
        const colId = td.dataset.col;
        if (colId === 'name') {
            td.style.display = '';
        } else {
            td.style.display = visibleColumns[colId] ? '' : 'none';
        }
    });
}

// ====== COLUMN DRAG & DROP REORDERING ======
// Define the canonical column order (matches Google Sheets A:Q order)
const COLUMN_ORDER = [
    'name',              // Column B
    'date',              // Column A - Date Added
    'industry',          // Column C
    'description',       // Column D
    'city',              // Column E
    'county',            // Column F
    'state',             // Column G
    'country',           // Column H
    'yearsEstablished',  // Column I
    'ebitda',            // Column J - Annual Profit
    'revenue',           // Column K - Annual Revenue
    'price',             // Column L - Asking Price
    'profitMultiple',    // Column M
    'revenueMultiple',   // Column N
    'remote',            // Column O - Remote/Relocatable/Absentee-Run
    'franchise',         // Column P
    'fiveYearsInBusiness', // Column Q
    'broker',            // Broker fields
    'brokerCompany',
    'brokerPhone',
    'brokerEmail',
    'location',          // Derived
    'source',
    'url'
    // Dynamic rawColumns will be appended at runtime
];

function ensureColumnOrder() {
    // Ensure headers are in correct order
    const thead = document.querySelector('.aggregator-table thead tr');
    if (!thead) return;
    
    const headers = Array.from(thead.querySelectorAll('th[data-col]'));
    const headerMap = {};
    headers.forEach(th => {
        headerMap[th.dataset.col] = th;
    });
    
    // Reorder headers
    thead.innerHTML = '';
    COLUMN_ORDER.forEach(colId => {
        if (headerMap[colId]) {
            thead.appendChild(headerMap[colId]);
        }
    });
    
    console.log('✅ Column order reset to default');
}

// Guard to prevent multiple initializations
let dragDropInitialized = false;

function initializeColumnDragDrop() {
    if (dragDropInitialized) {
        console.log('⚠️ Drag & drop already initialized, skipping');
        return;
    }
    
    // First, ensure columns are in correct order
    ensureColumnOrder();
    
    // ONLY make aggregator table headers draggable (not My Deals table)
    const headers = document.querySelectorAll('.aggregator-table th[data-col]');
    
    if (headers.length === 0) {
        console.log('⚠️ No aggregator table headers found, skipping drag & drop init');
        return;
    }
    
    let draggedColumn = null;
    
    console.log('🎯 Initializing drag & drop for', headers.length, 'aggregator columns');
    
    headers.forEach(th => {
        // Skip if already initialized (check for resize handle)
        if (th.querySelector('.resize-handle')) {
            console.log('⚠️ Header already has resize handle, skipping:', th.dataset.col);
            return;
        }
        
        // Make draggable
        th.draggable = true;
        
        // Add resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        th.appendChild(resizeHandle);
        
        // Prevent dragging when clicking for sort (only drag when holding for 200ms)
        let dragStartTimeout;
        let isDragEnabled = false;
        
        th.addEventListener('mousedown', (e) => {
            // Don't enable drag if clicking resize handle
            if (e.target.classList.contains('resize-handle')) return;
            
            isDragEnabled = false;
            dragStartTimeout = setTimeout(() => {
                isDragEnabled = true;
            }, 200); // 200ms delay before drag is enabled
        });
        
        th.addEventListener('mouseup', () => {
            clearTimeout(dragStartTimeout);
            isDragEnabled = false;
        });
        
        // Drag start
        th.addEventListener('dragstart', (e) => {
            if (!isDragEnabled) {
                e.preventDefault();
                return false;
            }
            draggedColumn = th;
            th.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', th.innerHTML);
        });
        
        // Drag over
        th.addEventListener('dragover', (e) => {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';
            th.classList.add('drag-over');
            return false;
        });
        
        // Drag enter
        th.addEventListener('dragenter', (e) => {
            th.classList.add('drag-over');
        });
        
        // Drag leave
        th.addEventListener('dragleave', (e) => {
            th.classList.remove('drag-over');
        });
        
        // Drop
        th.addEventListener('drop', (e) => {
            if (e.stopPropagation) {
                e.stopPropagation();
            }
            
            if (draggedColumn !== th) {
                // Reorder columns
                reorderTableColumns(draggedColumn, th);
            }
            
            th.classList.remove('drag-over');
            return false;
        });
        
        // Drag end
        th.addEventListener('dragend', (e) => {
            headers.forEach(header => {
                header.classList.remove('dragging', 'drag-over');
            });
            draggedColumn = null;
        });
        
        // Column resizing
        initializeColumnResize(th, resizeHandle);
    });
    
    dragDropInitialized = true;
    console.log('✅ Drag & drop initialization complete');
}

function reorderTableColumns(draggedTh, targetTh) {
    const draggedIndex = Array.from(draggedTh.parentNode.children).indexOf(draggedTh);
    const targetIndex = Array.from(targetTh.parentNode.children).indexOf(targetTh);
    
    if (draggedIndex === targetIndex) return;
    
    // Reorder header
    const thead = draggedTh.parentNode;
    if (draggedIndex < targetIndex) {
        thead.insertBefore(draggedTh, targetTh.nextSibling);
    } else {
        thead.insertBefore(draggedTh, targetTh);
    }
    
    // Reorder all body cells
    const tbody = document.getElementById('aggregator-tbody');
    const rows = tbody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const cells = Array.from(row.children);
        const draggedCell = cells[draggedIndex];
        const targetCell = cells[targetIndex];
        
        if (draggedCell && targetCell) {
            if (draggedIndex < targetIndex) {
                row.insertBefore(draggedCell, targetCell.nextSibling);
            } else {
                row.insertBefore(draggedCell, targetCell);
            }
        }
    });
    
    console.log('✅ Columns reordered');
}

// ====== COLUMN RESIZING ======
function initializeColumnResize(th, resizeHandle) {
    let startX, startWidth;
    
    resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // Prevent sorting when resizing
        startX = e.pageX;
        startWidth = th.offsetWidth;
        
        th.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        const onMouseMove = (e) => {
            const width = startWidth + (e.pageX - startX);
            if (width > 50) { // Minimum width
                th.style.width = width + 'px';
                th.style.minWidth = width + 'px';
            }
        };
        
        const onMouseUp = () => {
            th.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// ====== CLEAR & REFRESH FEATURE ======
function initializeClearRefresh() {
    const clearBtn = document.getElementById('clear-refresh-btn');
    
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            // Offer choice: clear and refresh vs clear only
            const choice = confirm(
                'Clear all cached deals?\n\n' +
                'OK = Clear and re-import from sources\n' +
                'Cancel = Just clear (no re-import)\n\n' +
                'To completely purge all data, click Cancel.'
            );
            
            showToast('Clearing all cached deals...', 'info');
            
            // Clear aggregated deals from storage (use correct key!)
            await new Promise((resolve) => {
                chrome.storage.local.remove(['aggregatedDealsPool', 'aggregatedDeals'], resolve);
            });
            console.log('🗑️ Cleared aggregatedDealsPool from storage');
            
            // Reset in-memory data
            aggregatedDeals = [];
            filteredAggregatedDeals = [];
            
            // Update UI
            renderAggregatorTable();
            updateAggregatorStats();
            
            if (choice) {
                showToast('Cache cleared! Re-importing deals from sources...', 'success');
                
                // Trigger re-fetch from sources
                setTimeout(() => {
                    const fetchBtn = document.getElementById('fetch-deals-btn');
                    if (fetchBtn) {
                        startAggregation(fetchBtn);
                    }
                }, 500);
            } else {
                showToast('All deals cleared! Click "Fetch Deals" when ready to import.', 'success');
            }
        });
    }
}

// Update aggregator stats display
function updateAggregatorStats() {
    const total = aggregatedDeals.length;
    const showing = filteredAggregatedDeals.length;
    
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const newToday = aggregatedDeals.filter(d => d.discoveredAt > oneDayAgo).length;
    
    const sources = new Set(aggregatedDeals.map(d => d.source));
    
    document.getElementById('total-aggregated').textContent = formatNumber(total);
    document.getElementById('aggregator-count').textContent = formatNumber(total);
    document.getElementById('total-count').textContent = formatNumber(total);
    document.getElementById('showing-count').textContent = formatNumber(showing);
    document.getElementById('new-today').textContent = formatNumber(newToday);
    document.getElementById('sources-active').textContent = formatNumber(sources.size);
}

// Apply all aggregator filters (search + exclude keywords + hidden deals)
async function applyAggregatorFilters() {
    let filtered = [...aggregatedDeals];
    console.log(`🔍 Starting filter with ${filtered.length} deals`);
    
    // STEP 0: Apply hidden deals filter (unless "Show Hidden" is checked)
    const showHiddenToggle = document.getElementById('show-hidden-deals-toggle');
    const showHidden = showHiddenToggle?.checked || false;
    
    if (!showHidden) {
        const hiddenIds = await getHiddenDealIds();
        if (hiddenIds.size > 0) {
            const beforeHidden = filtered.length;
            filtered = filtered.filter(deal => !hiddenIds.has(deal.id));
            console.log(`👁️‍🗨️ Hidden deals filter: ${beforeHidden} → ${filtered.length} deals (removed ${beforeHidden - filtered.length} hidden)`);
        }
    } else {
        console.log(`👁️ Showing hidden deals (toggle ON)`);
    }
    
    // STEP 1: Apply Buy Box filter
    const beforeBuyBox = filtered.length;
    filtered = filtered.filter(deal => dealMatchesBuyBox(deal));
    console.log(`📦 Buy Box filter: ${beforeBuyBox} → ${filtered.length} deals (removed ${beforeBuyBox - filtered.length})`);
    
    // STEP 2: Apply exclude keywords filter
    if (currentExcludeKeywords.length > 0) {
        const beforeExclude = filtered.length;
        filtered = filtered.filter(deal => {
            const searchableText = [
                deal.name || '',
                deal.description || '',
                deal.industry || '',
                deal.location || ''
            ].join(' ').toLowerCase();
            
            // Exclude if ANY keyword is found
            return !currentExcludeKeywords.some(keyword => searchableText.includes(keyword));
        });
        console.log(`🚫 Exclude keywords filter: ${beforeExclude} → ${filtered.length} deals (removed ${beforeExclude - filtered.length})`);
    }
    
    // STEP 3: Apply search filter (user's manual search)
    const searchInput = document.getElementById('aggregator-search');
    const searchQuery = searchInput ? searchInput.value.trim() : '';
    
    if (searchQuery) {
        const beforeSearch = filtered.length;
        const lowerQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(deal => {
            return (
                (deal.name || '').toLowerCase().includes(lowerQuery) ||
                (deal.description || '').toLowerCase().includes(lowerQuery) ||
                (deal.location || '').toLowerCase().includes(lowerQuery) ||
                (deal.city || '').toLowerCase().includes(lowerQuery) ||
                (deal.state || '').toLowerCase().includes(lowerQuery) ||
                (deal.industry || '').toLowerCase().includes(lowerQuery)
            );
        });
        console.log(`🔎 Search filter: ${beforeSearch} → ${filtered.length} deals (removed ${beforeSearch - filtered.length})`);
    }
    
    filteredAggregatedDeals = filtered;
    currentPage = 1;
    renderAggregatorTable();
}

// Legacy function for compatibility
function searchAggregatorDeals(query) {
    applyAggregatorFilters();
}

// Save deal from aggregator to My Deals
async function saveDealFromAggregator(deal) {
    try {
        showToast('Saving deal...', 'info');
        
        // Convert aggregator deal to saved deal format
        const savedDeal = convertAggregatorDealToSaved(deal);
        
        // Load existing saved deals
        const existingDeals = await new Promise((resolve) => {
            chrome.storage.local.get(['savedDeals'], (result) => {
                resolve(result.savedDeals || []);
            });
        });
        
        // Check for duplicates
        const exists = existingDeals.some(d => d.url === deal.url);
        if (exists) {
            showToast('Deal already saved!', 'warning');
            return;
        }
        
        // Add new deal
        existingDeals.unshift(savedDeal);
        
        // Save
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({ savedDeals: existingDeals }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
        
        showToast('✅ Deal saved to My Deals!', 'success');
        queueVettrPostDeal(savedDeal, { aggregator: deal });
        
        // Update My Deals count
        document.getElementById('my-deals-count').textContent = formatNumber(existingDeals.length);
        
    } catch (error) {
        console.error('Error saving deal:', error);
        showToast('Error saving deal: ' + error.message, 'error');
    }
}

// Convert aggregator deal to saved deal format
function convertAggregatorDealToSaved(deal) {
        return {
        name: deal.name || 'Unnamed Deal',
        url: deal.url || '',
        savedAt: Date.now(),
        dealId: deal.id || (deal.url && typeof VettrCloudSync !== 'undefined' ? VettrCloudSync.extensionDealIdFromUrl(deal.url) : undefined),
        status: 'none',
        inputs: {
            businessName: deal.name || '',
            askingPrice: deal.askingPrice || 0,
            ebitdaSDE: deal.ebitda || 0,
            targetOwnerSalary: 0,
            targetDSCR: 1.25
        },
        results: {
            maxPrice: 0,
            debtPayment: 0,
            cashFlowAnnual: 0,
            ownerTakeHome: 0,
            cocReturn: 0,
            paybackPeriod: 0
        },
        location: deal.location || deal.city || '',
        industry: deal.industry || '',
        source: deal.source || 'Deal Aggregator',
        description: deal.description || '',
        notes: ''
    };
}

// ====== MY DEALS TAB FUNCTIONALITY ======

// Variables for My Deals tab
let myDeals = [];
let filteredMyDeals = [];
let selectedMyDeals = new Set();
let currentMyDealsSort = { field: 'date', direction: 'desc' };

// Load My Deals from storage
async function loadMyDeals() {
    console.log('💼 Loading My Deals...');
    
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(['savedDeals'], (result) => {
                resolve(result.savedDeals || []);
            });
        });
        
        // Use the old system variables that renderDeals() expects
        allDeals = result;
        filteredDeals = [...allDeals];
        
        // Also update the new system for stats
        myDeals = result;
        filteredMyDeals = [...myDeals];
        
        console.log(`✅ Loaded ${myDeals.length} deals`);
        
        // Update UI using the old rendering system (has Quality Score & COC)
        updateStats(); // Use the old stats function that works with allDeals
        
        // Update the My Deals tab badge
        const countBadge = document.getElementById('my-deals-count');
        if (countBadge) {
            countBadge.textContent = formatNumber(allDeals.length);
        }
        
        renderDeals(); // Use the old detailed renderer instead of renderMyDealsTable()
        
        // Show/hide table based on deal count
        const table = document.getElementById('deals-table');
        const emptyState = document.getElementById('empty-state');
        if (allDeals.length === 0) {
            if (table) table.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
        } else {
            if (table) table.style.display = 'table';
            if (emptyState) emptyState.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error loading My Deals:', error);
        showToast('Error loading deals: ' + error.message, 'error');
    }
}

// Load just the My Deals count (lightweight version for initial page load)
async function loadMyDealsCount() {
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(['savedDeals'], (result) => {
                resolve(result.savedDeals || []);
            });
        });
        
        const count = result.length;
        console.log(`💼 Loaded My Deals count: ${count}`);
        
        // Update the badge count
        const countBadge = document.getElementById('my-deals-count');
        if (countBadge) {
            countBadge.textContent = formatNumber(count);
        }
    } catch (error) {
        console.error('Error loading My Deals count:', error);
    }
}

// Update stats cards
function updateMyDealsStats() {
    const stats = {
        total: myDeals.length,
        hot: myDeals.filter(d => d.status === 'hot').length,
        warm: myDeals.filter(d => d.status === 'warm').length,
        cold: myDeals.filter(d => d.status === 'cold').length
    };
    
    document.getElementById('stat-total').textContent = formatNumber(stats.total);
    document.getElementById('stat-hot').textContent = formatNumber(stats.hot);
    document.getElementById('stat-warm').textContent = formatNumber(stats.warm);
    document.getElementById('stat-cold').textContent = formatNumber(stats.cold);
    document.getElementById('my-deals-count').textContent = formatNumber(stats.total);
}

// Render My Deals table
function renderMyDealsTable() {
    const tbody = document.getElementById('deals-tbody');
    const table = document.getElementById('deals-table');
    const emptyState = document.getElementById('empty-state');
    
    if (!tbody) {
        console.error('Table body not found');
        return;
    }
    
    tbody.innerHTML = '';
    
    // Apply sort
    sortMyDeals();
    
    // Check if we have deals
    if (filteredMyDeals.length === 0) {
        // Hide table, show empty state
        if (table) table.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: #999;">
                    ${myDeals.length === 0 
                        ? '📭 No deals saved yet. Save deals from the Deal Aggregator!<br><small style="margin-top:8px;display:block;">Tip: Use <strong>Restore</strong> to recover from a backup file after reinstalling the extension.</small>' 
                        : '🔍 No deals match your filters'}
                </td>
            </tr>
        `;
        return;
    }
    
    // Show table, hide empty state
    if (table) table.style.display = 'table';
    if (emptyState) emptyState.style.display = 'none';
    
    // Render each deal
    filteredMyDeals.forEach(deal => {
        const row = createMyDealRow(deal);
        tbody.appendChild(row);
    });
    
    console.log(`✅ Rendered ${filteredMyDeals.length} deals`);
}

// Create a table row for a deal
function createMyDealRow(deal) {
    const row = document.createElement('tr');
    
    // Checkbox
    const checkboxCell = document.createElement('td');
    checkboxCell.innerHTML = `<input type="checkbox" class="deal-checkbox" data-deal-id="${deal.savedAt}">`;
    if (selectedMyDeals.has(deal.savedAt)) {
        checkboxCell.querySelector('input').checked = true;
    }
    row.appendChild(checkboxCell);
    
    // Status
    const statusCell = document.createElement('td');
    statusCell.innerHTML = getStatusBadge(deal.status);
    row.appendChild(statusCell);
    
    // Deal Name
    const nameCell = document.createElement('td');
    nameCell.innerHTML = `<strong>${escapeHtml(deal.name || 'Unnamed Deal')}</strong>`;
    nameCell.style.cursor = 'pointer';
    nameCell.title = 'Click to view details';
    row.appendChild(nameCell);
    
    // Date
    const dateCell = document.createElement('td');
    dateCell.textContent = formatDate(deal.savedAt);
    row.appendChild(dateCell);
    
    // Asking Price
    const priceCell = document.createElement('td');
    priceCell.textContent = formatCurrency(deal.inputs?.askingPrice || 0);
    row.appendChild(priceCell);
    
    // EBITDA
    const ebitdaCell = document.createElement('td');
    ebitdaCell.textContent = formatCurrency(deal.inputs?.ebitdaSDE || 0);
    row.appendChild(ebitdaCell);
    
    // Quality Score (if available)
    const scoreCell = document.createElement('td');
    if (deal.qualityScore !== undefined) {
        scoreCell.innerHTML = `<span class="score-badge score-${getScoreClass(deal.qualityScore)}">${deal.qualityScore}</span>`;
    } else {
        scoreCell.textContent = '-';
    }
    row.appendChild(scoreCell);
    
    // COC Return
    const cocCell = document.createElement('td');
    const coc = deal.results?.cocReturn || 0;
    cocCell.textContent = coc > 0 ? `${coc.toFixed(1)}%` : '-';
    if (coc < 0) {
        cocCell.style.color = '#ff4444';
    }
    row.appendChild(cocCell);
    
    // Actions
    const actionsCell = document.createElement('td');
    actionsCell.innerHTML = `
        <div class="actions">
            <button class="action-btn" title="View Details">👁️</button>
            <button class="action-btn" title="Export">📤</button>
            <button class="action-btn danger" title="Delete">🗑️</button>
        </div>
    `;
    row.appendChild(actionsCell);
    
    // Event listeners
    const checkbox = checkboxCell.querySelector('input');
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleDealSelection(deal.savedAt, checkbox.checked);
    });
    
    nameCell.addEventListener('click', (e) => {
        console.log('💼 Name cell clicked for deal:', deal.name);
        e.stopPropagation();
        openDealModal(deal);
    });
    
    const [viewBtn, exportBtn, deleteBtn] = actionsCell.querySelectorAll('.action-btn');
    viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDealModal(deal);
    });
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportSingleDeal(deal);
    });
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSingleDeal(deal);
    });
    
    return row;
}

// Get status badge HTML
function getStatusBadge(status) {
    const badges = {
        hot: '<span class="status-badge hot">🔥 Hot</span>',
        warm: '<span class="status-badge warm">🌡️ Warm</span>',
        cold: '<span class="status-badge cold">❄️ Cold</span>',
        pass: '<span class="status-badge pass">❌ Pass</span>',
        none: '<span class="status-badge none">-</span>'
    };
    return badges[status] || badges.none;
}

// Get score class for coloring
function getScoreClass(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'weak';
}

// Format date
function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

// Format currency
function formatCurrency(value) {
    if (!value || value === 0) return '$0';
    if (value >= 1000000) {
        const millions = (value / 1000000).toFixed(2);
        return '$' + parseFloat(millions).toLocaleString() + 'M';
    }
    if (value >= 1000) {
        const thousands = (value / 1000).toFixed(0);
        return '$' + parseFloat(thousands).toLocaleString() + 'K';
    }
    return '$' + Math.round(value).toLocaleString();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Sort My Deals
function sortMyDeals() {
    const { field, direction } = currentMyDealsSort;
    
    filteredMyDeals.sort((a, b) => {
        let valA, valB;
        
        switch (field) {
            case 'date':
                valA = a.savedAt || 0;
                valB = b.savedAt || 0;
                break;
            case 'name':
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
                break;
            case 'price':
                valA = a.inputs?.askingPrice || 0;
                valB = b.inputs?.askingPrice || 0;
                break;
            case 'ebitda':
                valA = a.inputs?.ebitdaSDE || 0;
                valB = b.inputs?.ebitdaSDE || 0;
                break;
            case 'score':
                valA = a.qualityScore || 0;
                valB = b.qualityScore || 0;
                break;
            case 'coc':
                valA = a.results?.cocReturn || 0;
                valB = b.results?.cocReturn || 0;
                break;
            default:
                return 0;
        }
        
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// Search My Deals
function searchMyDeals(query) {
    const lowerQuery = query.toLowerCase();
    
    if (!query.trim()) {
        filteredMyDeals = [...myDeals];
    } else {
        filteredMyDeals = myDeals.filter(deal => {
            return (
                (deal.name || '').toLowerCase().includes(lowerQuery) ||
                (deal.url || '').toLowerCase().includes(lowerQuery) ||
                (deal.notes || '').toLowerCase().includes(lowerQuery) ||
                (deal.location || '').toLowerCase().includes(lowerQuery) ||
                (deal.industry || '').toLowerCase().includes(lowerQuery)
            );
        });
    }
    
    renderMyDealsTable();
}

// Filter My Deals by status
function filterMyDealsByStatus(status) {
    if (!status) {
        filteredMyDeals = [...myDeals];
    } else {
        filteredMyDeals = myDeals.filter(deal => deal.status === status);
    }
    
    renderMyDealsTable();
}

// Toggle deal selection
function toggleDealSelection(dealId, selected) {
    if (selected) {
        selectedMyDeals.add(dealId);
    } else {
        selectedMyDeals.delete(dealId);
    }
    
    updateBulkActionsBar();
}

// Update bulk actions bar
function updateBulkActionsBar() {
    const bulkActions = document.getElementById('bulk-actions');
    const bulkText = document.getElementById('bulk-text');
    
    if (selectedMyDeals.size > 0) {
        bulkActions.style.display = 'flex';
        bulkText.textContent = `${selectedMyDeals.size} deal${selectedMyDeals.size > 1 ? 's' : ''} selected`;
    } else {
        bulkActions.style.display = 'none';
    }
}

// Delete single deal
async function deleteSingleDeal(deal) {
    if (!confirm(`Delete "${deal.name}"?`)) return;
    
    try {
        myDeals = myDeals.filter(d => d.savedAt !== deal.savedAt);
        
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({ savedDeals: myDeals }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
        
        showToast('Deal deleted', 'success');
        queueVettrDeleteDeal(deal);
        await loadMyDeals();
        
    } catch (error) {
        console.error('Error deleting deal:', error);
        showToast('Error deleting deal', 'error');
    }
}

// Export single deal
function exportSingleDeal(deal) {
    exportDealsToCSV([deal]);
}

// Bulk delete deals
async function bulkDeleteDeals() {
    if (selectedMyDeals.size === 0) return;
    
    if (!confirm(`Delete ${selectedMyDeals.size} selected deals?`)) return;
    
    try {
        const deleted = myDeals.filter(d => selectedMyDeals.has(d.savedAt));
        myDeals = myDeals.filter(d => !selectedMyDeals.has(d.savedAt));
        
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({ savedDeals: myDeals }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
        
        showToast(`${selectedMyDeals.size} deals deleted`, 'success');
        deleted.forEach((d) => queueVettrDeleteDeal(d));
        selectedMyDeals.clear();
        await loadMyDeals();
        
    } catch (error) {
        console.error('Error deleting deals:', error);
        showToast('Error deleting deals', 'error');
    }
}

// Bulk export deals
function bulkExportDeals() {
    if (selectedMyDeals.size === 0) return;
    
    const dealsToExport = myDeals.filter(d => selectedMyDeals.has(d.savedAt));
    exportDealsToCSV(dealsToExport);
}

// Export deals to CSV
function exportDealsToCSV(deals) {
    const headers = [
        'Deal Name',
        'Status',
        'Saved Date',
        'URL',
        'Asking Price',
        'EBITDA',
        'Quality Score',
        'COC Return',
        'Payback Period',
        'Max Price',
        'Total Debt',
        'FCF Annual',
        'Owner Take-Home',
        'Notes'
    ];
    
    const rows = deals.map(deal => [
        deal.name || '',
        deal.status || '',
        formatDate(deal.savedAt),
        deal.url || '',
        deal.inputs?.askingPrice || 0,
        deal.inputs?.ebitdaSDE || 0,
        deal.qualityScore || '',
        deal.results?.cocReturn || '',
        deal.results?.paybackPeriod || '',
        deal.results?.maxPrice || '',
        deal.results?.totalDebt || '',
        deal.results?.cashFlowAnnual || '',
        deal.results?.ownerTakeHome || '',
        (deal.notes || '').replace(/"/g, '""')
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-deals-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${deals.length} deals to CSV`, 'success');
}

// Export full backup to JSON file (saves to Downloads - survives extension reinstall)
async function exportBackup() {
    try {
        // Get all user data from storage
        const data = await new Promise((resolve) => {
            chrome.storage.local.get([
                'savedDeals',
                'buyBoxConfig',
                'userPreferences',
                'visibleColumns',
                'dealViewStyle',
                'currentExcludeKeywords',
                'savedExcludeLists',
                'currentSelectedList',
                'excludeKeywordsExpanded',
                'lastSMSNumber',
                'windowGeometry',
                'autoRefreshEnabled',
                'refreshInterval',
                'notifyNewDeals',
                'customSources',
                'hiddenDealIds'
            ], (result) => {
                resolve(result);
            });
        });
        
        const backup = {
            version: window.EXTENSION_VERSION || '3.0.0',
            exportedAt: new Date().toISOString(),
            savedDeals: data.savedDeals || [],
            buyBoxConfig: data.buyBoxConfig || null,
            userPreferences: data.userPreferences || null,
            visibleColumns: data.visibleColumns || null,
            dealViewStyle: data.dealViewStyle || null,
            currentExcludeKeywords: data.currentExcludeKeywords || null,
            savedExcludeLists: data.savedExcludeLists || null,
            currentSelectedList: data.currentSelectedList || null,
            excludeKeywordsExpanded: data.excludeKeywordsExpanded || null,
            lastSMSNumber: data.lastSMSNumber || null,
            windowGeometry: data.windowGeometry || null,
            autoRefreshEnabled: data.autoRefreshEnabled !== undefined ? data.autoRefreshEnabled : null,
            refreshInterval: data.refreshInterval || null,
            notifyNewDeals: data.notifyNewDeals !== undefined ? data.notifyNewDeals : null,
            customSources: data.customSources || null,
            hiddenDealIds: data.hiddenDealIds || null
        };
        
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deal-analyzer-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast(`Backup saved: ${backup.savedDeals.length} deals + all settings → Downloads folder`, 'success', 4000);
        console.log('💾 Backup exported:', backup.savedDeals.length, 'deals + all user settings');
    } catch (error) {
        console.error('Backup export error:', error);
        showToast('Error creating backup: ' + error.message, 'error');
    }
}

// Restore from backup file
async function importBackup() {
    const input = document.getElementById('restore-file-input');
    if (!input) return;
    
    input.value = '';
    input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const backup = JSON.parse(text);
            
            if (!backup.savedDeals || !Array.isArray(backup.savedDeals)) {
                showToast('Invalid backup file: missing savedDeals array', 'error');
                return;
            }
            
            // Get existing deals for merge
            const existingDeals = await new Promise((resolve) => {
                chrome.storage.local.get(['savedDeals'], (result) => {
                    resolve(result.savedDeals || []);
                });
            });
            
            // Merge: backup deals first, then add existing deals not in backup
            const backupKeys = new Set(backup.savedDeals.map(d => (d.url || d.savedAt || '').toString()));
            const extraExisting = existingDeals.filter(d => {
                const key = (d.url || d.savedAt || '').toString();
                return key && !backupKeys.has(key);
            });
            const mergedDeals = [...backup.savedDeals, ...extraExisting];
            
            // Prepare all data to restore
            const dataToRestore = {
                savedDeals: mergedDeals
            };
            
            // Restore all available settings from backup
            if (backup.buyBoxConfig !== undefined && backup.buyBoxConfig !== null) {
                dataToRestore.buyBoxConfig = backup.buyBoxConfig;
            }
            if (backup.userPreferences !== undefined && backup.userPreferences !== null) {
                dataToRestore.userPreferences = backup.userPreferences;
            }
            if (backup.visibleColumns !== undefined && backup.visibleColumns !== null) {
                dataToRestore.visibleColumns = backup.visibleColumns;
            }
            if (backup.dealViewStyle !== undefined && backup.dealViewStyle !== null) {
                dataToRestore.dealViewStyle = backup.dealViewStyle;
            }
            if (backup.currentExcludeKeywords !== undefined && backup.currentExcludeKeywords !== null) {
                dataToRestore.currentExcludeKeywords = backup.currentExcludeKeywords;
            }
            if (backup.savedExcludeLists !== undefined && backup.savedExcludeLists !== null) {
                dataToRestore.savedExcludeLists = backup.savedExcludeLists;
            }
            if (backup.currentSelectedList !== undefined && backup.currentSelectedList !== null) {
                dataToRestore.currentSelectedList = backup.currentSelectedList;
            }
            if (backup.excludeKeywordsExpanded !== undefined && backup.excludeKeywordsExpanded !== null) {
                dataToRestore.excludeKeywordsExpanded = backup.excludeKeywordsExpanded;
            }
            if (backup.lastSMSNumber !== undefined && backup.lastSMSNumber !== null) {
                dataToRestore.lastSMSNumber = backup.lastSMSNumber;
            }
            if (backup.windowGeometry !== undefined && backup.windowGeometry !== null) {
                dataToRestore.windowGeometry = backup.windowGeometry;
            }
            if (backup.autoRefreshEnabled !== undefined && backup.autoRefreshEnabled !== null) {
                dataToRestore.autoRefreshEnabled = backup.autoRefreshEnabled;
            }
            if (backup.refreshInterval !== undefined && backup.refreshInterval !== null) {
                dataToRestore.refreshInterval = backup.refreshInterval;
            }
            if (backup.notifyNewDeals !== undefined && backup.notifyNewDeals !== null) {
                dataToRestore.notifyNewDeals = backup.notifyNewDeals;
            }
            if (backup.customSources !== undefined && backup.customSources !== null) {
                dataToRestore.customSources = backup.customSources;
            }
            if (backup.hiddenDealIds !== undefined && backup.hiddenDealIds !== null) {
                dataToRestore.hiddenDealIds = backup.hiddenDealIds;
            }
            
            // Restore everything to storage
            await new Promise((resolve, reject) => {
                chrome.storage.local.set(dataToRestore, () => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve();
                });
            });
            
            const fromBackup = backup.savedDeals.length;
            const total = mergedDeals.length;
            const settingsCount = Object.keys(dataToRestore).length - 1; // Minus savedDeals
            
            showToast(`Restored: ${fromBackup} deals + ${settingsCount} settings (${total} total deals)`, 'success', 5000);
            console.log('📥 Backup restored:', fromBackup, 'from backup,', total, 'total deals,', settingsCount, 'settings restored');
            
            // Reload the page to apply all settings
            loadMyDeals();
            loadBuyBox(); // Refresh Buy Box if settings changed
        } catch (error) {
            console.error('Restore error:', error);
            showToast('Error restoring backup: ' + error.message, 'error');
        }
    };
    
    input.click();
}

// Open deal modal with full details (for My Deals tab)
function openDealModal(deal) {
    console.log('📋 [My Deals] Opening deal modal for:', deal?.name || deal);
    console.log('📋 [My Deals] Deal object:', deal);
    
    // Handle both deal object and deal name string
    if (typeof deal === 'string') {
        console.log('📋 Received string, redirecting to legacy function');
        openDealModalLegacy(deal);
        return;
    }
    
    const modal = document.getElementById('deal-modal');
    if (!modal) {
        console.error('❌ Deal modal not found in DOM');
        showToast('Modal not found - please refresh the page', 'error');
        return;
    }
    
    console.log('✅ Modal found, populating data...');
    
    // Store current deal for updates
    window.currentDeal = deal;
    
    // Populate modal with deal data
    document.getElementById('modal-deal-name').textContent = deal.name || 'Unnamed Deal';
    
    // Status with edit capability
    const statusEl = document.getElementById('modal-status');
    if (statusEl) {
        const statusBadges = {
            hot: '🔥 Hot',
            warm: '🌡️ Warm',
            cold: '❄️ Cold',
            pass: '❌ Pass',
            none: 'No Status'
        };
        statusEl.innerHTML = `
            <select id="modal-status-select" style="padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary);">
                <option value="none" ${deal.status === 'none' ? 'selected' : ''}>No Status</option>
                <option value="hot" ${deal.status === 'hot' ? 'selected' : ''}>🔥 Hot</option>
                <option value="warm" ${deal.status === 'warm' ? 'selected' : ''}>🌡️ Warm</option>
                <option value="cold" ${deal.status === 'cold' ? 'selected' : ''}>❄️ Cold</option>
                <option value="pass" ${deal.status === 'pass' ? 'selected' : ''}>❌ Pass</option>
            </select>
        `;
        
        // Add change listener
        const statusSelect = document.getElementById('modal-status-select');
        if (statusSelect) {
            statusSelect.addEventListener('change', async (e) => {
                await updateDealStatus(deal, e.target.value);
            });
        }
    }
    
    // Date
    document.getElementById('modal-saved-date').textContent = formatDate(deal.savedAt);
    
    // Financial overview
    document.getElementById('modal-asking-price').textContent = formatCurrency(deal.inputs?.askingPrice || 0);
    document.getElementById('modal-ebitda').textContent = formatCurrency(deal.inputs?.ebitdaSDE || 0);
    document.getElementById('modal-quality').textContent = deal.qualityScore !== undefined ? deal.qualityScore : 'N/A';
    document.getElementById('modal-coc').textContent = deal.results?.cocReturn ? `${deal.results.cocReturn.toFixed(1)}%` : 'N/A';
    
    // URL
    const urlEl = document.getElementById('modal-url');
    if (urlEl) {
        if (deal.url) {
            urlEl.href = deal.url;
            urlEl.textContent = deal.url;
            urlEl.style.display = 'block';
        } else {
            urlEl.textContent = 'No URL (Off-market deal)';
            urlEl.href = '#';
            urlEl.style.pointerEvents = 'none';
        }
    }
    
    // Financial details
    document.getElementById('modal-max-price').textContent = formatCurrency(deal.results?.maxPrice || 0);
    document.getElementById('modal-total-debt').textContent = formatCurrency(deal.results?.totalDebt || 0);
    document.getElementById('modal-fcf').textContent = formatCurrency(deal.results?.cashFlowAnnual || 0);
    document.getElementById('modal-takehome').textContent = formatCurrency(deal.results?.ownerTakeHome || 0);
    document.getElementById('modal-payback').textContent = deal.results?.paybackPeriod ? `${deal.results.paybackPeriod.toFixed(1)} years` : 'N/A';
    
    // Notes section
    const notesTextarea = document.getElementById('modal-notes');
    if (notesTextarea) {
        notesTextarea.value = deal.notes || '';
        
        // Auto-save notes
        notesTextarea.addEventListener('input', () => {
            clearTimeout(notesTextarea.saveTimeout);
            notesTextarea.saveTimeout = setTimeout(async () => {
                await updateDealNotes(deal, notesTextarea.value);
            }, 1000);
        });
    }
    
    // Show modal
    modal.style.display = 'flex';
}

// Close deal modal
function closeDealModal() {
    const modal = document.getElementById('deal-modal');
    if (modal) modal.style.display = 'none';
    window.currentDeal = null;
}

// Update deal status
async function updateDealStatus(deal, newStatus) {
    try {
        // Update deal object
        deal.status = newStatus;
        
        // Save to storage
        const existingDeals = await new Promise((resolve) => {
            chrome.storage.local.get(['savedDeals'], (result) => {
                resolve(result.savedDeals || []);
            });
        });
        
        const dealIndex = existingDeals.findIndex(d => d.savedAt === deal.savedAt);
        if (dealIndex !== -1) {
            existingDeals[dealIndex].status = newStatus;
            
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({ savedDeals: existingDeals }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
            
            showToast('Status updated', 'success');
            queueVettrUpdateDeal(deal);
            
            // Refresh My Deals if visible
            if (currentTab === 'my-deals') {
                await loadMyDeals();
            }
        }
        
    } catch (error) {
        console.error('Error updating status:', error);
        showToast('Error updating status', 'error');
    }
}

// Update deal notes
async function updateDealNotes(deal, newNotes) {
    try {
        deal.notes = newNotes;
        
        const existingDeals = await new Promise((resolve) => {
            chrome.storage.local.get(['savedDeals'], (result) => {
                resolve(result.savedDeals || []);
            });
        });
        
        const dealIndex = existingDeals.findIndex(d => d.savedAt === deal.savedAt);
        if (dealIndex !== -1) {
            existingDeals[dealIndex].notes = newNotes;
            
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({ savedDeals: existingDeals }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
            
            console.log('✅ Notes auto-saved');
            queueVettrUpdateDealDebounced(deal);
        }
        
    } catch (error) {
        console.error('Error updating notes:', error);
        showToast('Error saving notes', 'error');
    }
}

// Initialize deal modal handlers
document.addEventListener('DOMContentLoaded', () => {
    // Add live formatting to modal calculator inputs
    const modalCalcFields = ['calc-purchase-price', 'calc-ebitda'];
    modalCalcFields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            el.addEventListener('input', liveFormatDashboardInput);
        }
    });
    
    // Close button
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDealModal);
    }
    
    // Click outside to close
    const modal = document.getElementById('deal-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeDealModal();
            }
        });
    }
});



// View deal details (placeholder - will open modal in future)
// ====== DEAL DETAILS PANEL ======
let currentViewedDeal = null;
let dealViewStyle = 'popup'; // 'popup' or 'sidebar'

function viewDealDetails(deal) {
    console.log('View deal details:', deal);
    currentViewedDeal = deal;
    
    // Get view style preference
    chrome.storage.local.get(['dealViewStyle'], (result) => {
        dealViewStyle = result.dealViewStyle || 'popup';
        showDealPanel(deal);
    });
}

function showDealPanel(deal) {
    const overlay = document.getElementById('deal-details-overlay');
    const panel = document.getElementById('deal-details-panel');
    
    if (!panel) {
        console.error('Deal panel not found');
        return;
    }
    
    // Set panel mode
    panel.classList.remove('popup-mode', 'sidebar-mode');
    panel.classList.add(dealViewStyle + '-mode');
    
    // Populate deal info
    document.getElementById('deal-panel-title').textContent = deal.name || 'Deal Details';
    
    // Deal Info Grid
    const infoGrid = document.getElementById('deal-info-grid');
    infoGrid.innerHTML = `
        <div class="deal-info-item">
            <div class="deal-info-label">Asking Price</div>
            <div class="deal-info-value price">${formatPrice(deal.askingPrice)}</div>
        </div>
        <div class="deal-info-item">
            <div class="deal-info-label">EBITDA/SDE</div>
            <div class="deal-info-value price">${formatPrice(deal.ebitda)}</div>
        </div>
        <div class="deal-info-item">
            <div class="deal-info-label">Revenue</div>
            <div class="deal-info-value">${formatPrice(deal.revenue)}</div>
        </div>
        <div class="deal-info-item">
            <div class="deal-info-label">Multiple</div>
            <div class="deal-info-value">${deal.askingPrice && deal.ebitda ? (deal.askingPrice / deal.ebitda).toFixed(2) + 'x' : '-'}</div>
        </div>
        <div class="deal-info-item">
            <div class="deal-info-label">Location</div>
            <div class="deal-info-value">${escapeHtml(deal.location || deal.city || '-')}</div>
        </div>
        <div class="deal-info-item">
            <div class="deal-info-label">State</div>
            <div class="deal-info-value">${escapeHtml(deal.state || '-')}</div>
        </div>
        <div class="deal-info-item">
            <div class="deal-info-label">Industry</div>
            <div class="deal-info-value">${escapeHtml(deal.industry || '-')}</div>
        </div>
        <div class="deal-info-item">
            <div class="deal-info-label">Source</div>
            <div class="deal-info-value">${escapeHtml(deal.source || deal.sourceType || '-')}</div>
        </div>
    `;
    
    // Broker Info - Enhanced with contact details
    const brokerInfo = document.getElementById('deal-broker-info');
    const brokerName = deal.brokerName || deal.broker || '-';
    const brokerCompany = deal.brokerCompany || deal.source || '-';
    const brokerEmail = deal.brokerEmail || deal.contactEmail || '';
    const brokerPhone = deal.brokerPhone || deal.contactPhone || '';
    const listedDate = deal.discoveredAt ? new Date(deal.discoveredAt).toLocaleDateString() : '-';
    
    brokerInfo.innerHTML = `
        <div class="broker-grid">
            <div class="broker-item">
                <span class="broker-label">Broker Name</span>
                <span class="broker-value">${escapeHtml(brokerName)}</span>
            </div>
            <div class="broker-item">
                <span class="broker-label">Company</span>
                <span class="broker-value">${escapeHtml(brokerCompany)}</span>
            </div>
            <div class="broker-item">
                <span class="broker-label">Email</span>
                <span class="broker-value">${brokerEmail ? `<a href="mailto:${escapeHtml(brokerEmail)}">${escapeHtml(brokerEmail)}</a>` : '-'}</span>
            </div>
            <div class="broker-item">
                <span class="broker-label">Phone</span>
                <span class="broker-value">${brokerPhone ? `<a href="tel:${escapeHtml(brokerPhone)}">${escapeHtml(brokerPhone)}</a>` : '-'}</span>
            </div>
            <div class="broker-item full-width">
                <span class="broker-label">Listed</span>
                <span class="broker-value">${listedDate}</span>
            </div>
        </div>
    `;
    
    // Description
    const descEl = document.getElementById('deal-description');
    descEl.textContent = deal.description || 'No description available.';
    
    // Set calculator initial values
    const ebitdaEl = document.getElementById('calc-ebitda');
    const askingEl = document.getElementById('calc-asking');
    if (ebitdaEl) ebitdaEl.value = deal.ebitda ? fmtCalc(deal.ebitda) : '';
    if (askingEl) askingEl.value = deal.askingPrice ? fmtCalc(deal.askingPrice) : '';
    
    // View listing button - validate URL before setting
    const viewBtn = document.getElementById('view-listing-btn');
    console.log('Deal URL debug:', { url: deal.url, deal: deal });
    
    // Check if URL is valid (starts with http/https)
    const isValidUrl = deal.url && typeof deal.url === 'string' && 
        (deal.url.startsWith('http://') || deal.url.startsWith('https://'));
    
    // Always show the button, but style differently if no valid URL
    viewBtn.style.display = '';
    if (isValidUrl) {
        viewBtn.href = deal.url;
        viewBtn.classList.remove('disabled');
        viewBtn.textContent = 'View Original Listing';
        console.log('✅ View listing URL set to:', deal.url);
    } else {
        viewBtn.href = '#';
        viewBtn.classList.add('disabled');
        viewBtn.textContent = 'No Listing URL Available';
        console.warn('⚠️ Invalid or missing deal URL:', deal.url);
    }
    
    // Hide target offer result initially
    const targetResult = document.getElementById('target-offer-result');
    if (targetResult) targetResult.style.display = 'none';
    
    // Reset scenarios for this deal
    resetScenarios();
    
    // Ensure calculator is collapsed by default to save space
    const calcHeader = document.getElementById('calc-header');
    const calcBody = document.getElementById('calc-body');
    if (calcHeader) calcHeader.classList.add('collapsed');
    if (calcBody) calcBody.classList.add('collapsed');
    
    // Reset panel position for popup mode (remove any previous drag offset)
    if (dealViewStyle === 'popup') {
        panel.classList.remove('dragging');
        panel.style.left = '';
        panel.style.top = '';
    }
    
    // Show panel
    overlay.style.display = 'block';
    panel.style.display = 'flex';
    
    // Run full calculator
    runFullCalculator();
}

function closeDealPanel() {
    document.getElementById('deal-details-overlay').style.display = 'none';
    document.getElementById('deal-details-panel').style.display = 'none';
    currentViewedDeal = null;
}

// ====== FULL DEAL CALCULATOR (from content.js) ======

// Parse currency input
function parseCalcNumber(val) {
    if (!val) return 0;
    return parseFloat(String(val).replace(/[$,]/g, '')) || 0;
}

// Format currency for display
function fmtCalc(num) {
    if (!num || isNaN(num)) return '$0';
    return '$' + Math.round(num).toLocaleString();
}

// Calculate debt service per $1 of loan
function calcDebtServicePer1(rate, years, paymentType = 'amortizing') {
    if (paymentType === 'interest-only') {
        return rate;
    }
    if (rate <= 0 || years <= 0) return years > 0 ? 1 / years : 0;
    const r = rate / 12;
    const n = years * 12;
    const monthlyPer1 = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return monthlyPer1 * 12;
}

// Main calculator function
function runFullCalculator() {
    // Get inputs
    const ebitda = parseCalcNumber(document.getElementById('calc-ebitda')?.value);
    const askingPrice = parseCalcNumber(document.getElementById('calc-asking')?.value);
    const targetDSCR = parseFloat(document.getElementById('calc-dscr')?.value) || 1.25;
    
    // SBA
    const sbaPercent = parseFloat(document.getElementById('calc-sba-percent')?.value) || 0;
    const sbaRate = (parseFloat(document.getElementById('calc-sba-rate')?.value) || 0) / 100;
    const sbaYears = parseFloat(document.getElementById('calc-sba-term')?.value) || 10;
    
    // Equity
    const equityPercent = parseFloat(document.getElementById('calc-equity-percent')?.value) || 0;
    const targetSalary = parseCalcNumber(document.getElementById('calc-salary')?.value);
    
    // Seller Note
    const sellerEnabled = document.getElementById('calc-seller-enabled')?.checked || false;
    const sellerPercent = sellerEnabled ? (parseFloat(document.getElementById('calc-seller-percent')?.value) || 0) : 0;
    const sellerRate = (parseFloat(document.getElementById('calc-seller-rate')?.value) || 0) / 100;
    const sellerType = document.getElementById('calc-seller-type')?.value || 'amortizing';
    const sellerStandby = document.getElementById('calc-seller-standby')?.value === 'yes';
    const sellerYears = 5; // Standard seller note term
    
    // Validate percentages
    const totalPercent = sbaPercent + equityPercent + sellerPercent;
    const percentWarning = document.getElementById('calc-percent-warning');
    if (percentWarning) {
        percentWarning.style.display = Math.abs(totalPercent - 100) > 0.01 ? 'block' : 'none';
    }
    
    // Update summaries
    document.getElementById('sba-summary').textContent = `${sbaPercent}% • ${(sbaRate*100).toFixed(1)}% • ${sbaYears}yr`;
    document.getElementById('equity-summary').textContent = `${equityPercent}% • ${fmtCalc(targetSalary)} salary`;
    document.getElementById('seller-summary').textContent = sellerEnabled ? 
        `${sellerPercent}% • ${(sellerRate*100).toFixed(1)}% • ${sellerType === 'interest-only' ? 'I/O' : 'Amort'}` : 'Disabled';
    
    // Calculate debt service per $1 of price
    const sbaDebtServicePer1 = calcDebtServicePer1(sbaRate, sbaYears);
    const sellerDebtServicePer1 = sellerEnabled ? calcDebtServicePer1(sellerRate, sellerYears, sellerType) : 0;
    
    // For DSCR calculation, exclude standby seller note
    const sellerDSForDSCR = sellerStandby ? 0 : sellerDebtServicePer1;
    const totalDSPer1 = (sbaPercent / 100) * sbaDebtServicePer1 + (sellerPercent / 100) * sellerDSForDSCR;
    
    // Max allowable debt service
    const maxAnnualDS = ebitda / targetDSCR;
    
    // Max purchase price (DSCR-based)
    let maxPrice = 0;
    if (totalDSPer1 > 0) {
        maxPrice = maxAnnualDS / totalDSPer1;
    }
    
    // Use asking price for actual calculations (or max if no asking)
    const actualPrice = askingPrice > 0 ? askingPrice : maxPrice;
    
    // Calculate component amounts
    const sbaLoan = (sbaPercent / 100) * actualPrice;
    const downPayment = (equityPercent / 100) * actualPrice;
    const sellerNote = (sellerPercent / 100) * actualPrice;
    
    // Calculate actual debt service
    let sbaAnnualDS = 0;
    if (sbaLoan > 0 && sbaRate > 0) {
        const r = sbaRate / 12;
        const n = sbaYears * 12;
        const monthly = sbaLoan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        sbaAnnualDS = monthly * 12;
    } else if (sbaLoan > 0) {
        sbaAnnualDS = sbaLoan / sbaYears;
    }
    
    let sellerAnnualDS = 0;
    if (sellerNote > 0 && sellerEnabled) {
        if (sellerType === 'interest-only') {
            sellerAnnualDS = sellerNote * sellerRate;
        } else {
            const r = sellerRate / 12;
            const n = sellerYears * 12;
            if (r === 0) {
                sellerAnnualDS = sellerNote / sellerYears;
            } else {
                const monthly = sellerNote * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                sellerAnnualDS = monthly * 12;
            }
        }
    }
    
    // Total debt service (exclude standby from cash flow calc)
    const totalDebtService = sbaAnnualDS + (sellerStandby ? 0 : sellerAnnualDS);
    
    // Cash flow calculations
    const availableCashFlow = ebitda - totalDebtService;
    const freeCashFlow = availableCashFlow - targetSalary;
    const totalTakeHome = targetSalary + freeCashFlow;
    
    // ROI metrics
    const actualDSCR = totalDebtService > 0 ? ebitda / totalDebtService : 0;
    const cashOnCash = downPayment > 0 ? (totalTakeHome / downPayment) * 100 : 0;
    const paybackPeriod = totalTakeHome > 0 ? downPayment / totalTakeHome : 0;
    
    // Update UI
    document.getElementById('calc-max-price').textContent = fmtCalc(maxPrice);
    
    const cocEl = document.getElementById('calc-coc');
    cocEl.textContent = cashOnCash.toFixed(1) + '%';
    cocEl.className = 'result-card-value ' + (cashOnCash >= 25 ? 'good' : cashOnCash >= 15 ? 'warning' : 'bad');
    
    const paybackEl = document.getElementById('calc-payback');
    paybackEl.textContent = paybackPeriod.toFixed(1) + ' yrs';
    paybackEl.className = 'result-card-value ' + (paybackPeriod <= 4 ? 'good' : paybackPeriod <= 6 ? 'warning' : 'bad');
    
    const dscrEl = document.getElementById('calc-actual-dscr');
    dscrEl.textContent = actualDSCR.toFixed(2) + 'x';
    dscrEl.className = 'result-card-value ' + (actualDSCR >= 1.25 ? 'good' : actualDSCR >= 1.0 ? 'warning' : 'bad');
    
    document.getElementById('calc-debt-service').textContent = fmtCalc(totalDebtService);
    document.getElementById('calc-available-cash').textContent = fmtCalc(availableCashFlow);
    
    const fcfEl = document.getElementById('calc-fcf');
    fcfEl.textContent = fmtCalc(freeCashFlow);
    fcfEl.style.color = freeCashFlow < 0 ? '#e74c3c' : '';
    
    const takeHomeEl = document.getElementById('calc-takehome');
    takeHomeEl.textContent = fmtCalc(totalTakeHome);
    takeHomeEl.style.color = totalTakeHome < 0 ? '#e74c3c' : '#27ae60';
    
    // Store for target offer calculation
    window.calcState = {
        ebitda, askingPrice, targetDSCR, sbaPercent, sbaRate, sbaYears,
        equityPercent, targetSalary, sellerEnabled, sellerPercent, sellerRate,
        sellerType, sellerStandby, sellerYears, maxPrice, totalDSPer1
    };
}

// Target Offer Calculator
function calculateTargetOffer() {
    const state = window.calcState;
    if (!state || !state.ebitda) {
        alert('Please enter EBITDA first');
        return;
    }
    
    const targetCOC = parseFloat(document.getElementById('calc-target-coc')?.value) || 25;
    const { ebitda, askingPrice, targetDSCR, equityPercent, targetSalary, totalDSPer1 } = state;
    
    // Calculate max price constrained by:
    // 1. DSCR requirement
    // 2. Target COC return
    // 3. Salary coverage
    // 4. Asking price (never exceed)
    
    const maxDSCRPrice = totalDSPer1 > 0 ? (ebitda / targetDSCR) / totalDSPer1 : Infinity;
    
    // For target COC: (ebitda - DS - salary) / equity = targetCOC/100
    // Solve for price iteratively
    let targetPrice = maxDSCRPrice;
    for (let i = 0; i < 50; i++) {
        const equity = (equityPercent / 100) * targetPrice;
        const ds = totalDSPer1 * targetPrice;
        const fcf = ebitda - ds - targetSalary;
        const coc = equity > 0 ? ((targetSalary + fcf) / equity) * 100 : 0;
        
        if (coc >= targetCOC) break;
        targetPrice *= 0.98; // Reduce by 2% and try again
    }
    
    // Apply constraints
    let finalPrice = Math.min(targetPrice, maxDSCRPrice);
    if (askingPrice > 0) {
        finalPrice = Math.min(finalPrice, askingPrice);
    }
    
    // Calculate metrics at target price
    const finalEquity = (equityPercent / 100) * finalPrice;
    const finalDS = totalDSPer1 * finalPrice;
    const finalFCF = ebitda - finalDS - targetSalary;
    const finalCOC = finalEquity > 0 ? ((targetSalary + finalFCF) / finalEquity) * 100 : 0;
    const finalPayback = (targetSalary + finalFCF) > 0 ? finalEquity / (targetSalary + finalFCF) : 0;
    
    // Determine constraint
    let constraint = 'COC target';
    if (finalPrice >= askingPrice && askingPrice > 0) constraint = 'asking price';
    else if (finalPrice >= maxDSCRPrice) constraint = 'DSCR requirement';
    
    // Update UI
    document.getElementById('target-price').textContent = fmtCalc(finalPrice);
    document.getElementById('target-subtitle').textContent = 
        `${finalCOC.toFixed(0)}% COC • ${finalPayback.toFixed(1)} yr payback • Limited by ${constraint}`;
    
    const diff = askingPrice - finalPrice;
    const diffPct = askingPrice > 0 ? (diff / askingPrice) * 100 : 0;
    document.getElementById('target-comparison').innerHTML = askingPrice > 0 ? 
        `<strong>vs Asking (${fmtCalc(askingPrice)}):</strong> ${fmtCalc(diff)} below (${diffPct.toFixed(1)}% discount)` :
        'No asking price entered for comparison';
    
    document.getElementById('target-offer-result').style.display = 'block';
    
    // Store for use button
    window.targetOfferPrice = finalPrice;
}

function useTargetOffer() {
    if (window.targetOfferPrice) {
        document.getElementById('calc-asking').value = fmtCalc(window.targetOfferPrice);
        runFullCalculator();
        document.getElementById('target-offer-result').style.display = 'none';
    }
}

// Initialize Deal Panel Events
function initializeDealPanel() {
    // Close button
    document.getElementById('deal-panel-close')?.addEventListener('click', closeDealPanel);
    
    // Overlay click to close (popup mode only)
    document.getElementById('deal-details-overlay')?.addEventListener('click', () => {
        if (dealViewStyle === 'popup') {
            closeDealPanel();
        }
    });
    
    // Save deal button
    document.getElementById('save-deal-btn')?.addEventListener('click', () => {
        if (currentViewedDeal) {
            saveDealFromAggregator(currentViewedDeal);
        }
    });
    
    // Full Calculator inputs - recalculate on change
    const calcInputs = [
        'calc-ebitda', 'calc-asking', 'calc-dscr',
        'calc-sba-percent', 'calc-sba-rate', 'calc-sba-term',
        'calc-equity-percent', 'calc-salary',
        'calc-seller-percent', 'calc-seller-rate', 'calc-seller-type', 'calc-seller-standby'
    ];
    
    // Fields that should have comma formatting (large numbers only)
    const calcFormattedFields = ['calc-ebitda', 'calc-asking', 'calc-salary'];
    
    calcInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Add live formatting only for large number fields
            if (calcFormattedFields.includes(id)) {
                el.addEventListener('input', liveFormatDashboardInput);
            }
            el.addEventListener('input', runFullCalculator);
            el.addEventListener('change', runFullCalculator);
        }
    });
    
    // Seller note toggle
    document.getElementById('calc-seller-enabled')?.addEventListener('change', (e) => {
        const fieldsEl = document.getElementById('seller-note-fields');
        if (fieldsEl) {
            fieldsEl.style.display = e.target.checked ? 'block' : 'none';
        }
        runFullCalculator();
    });
    
    // Target offer calculator
    document.getElementById('calc-target-btn')?.addEventListener('click', calculateTargetOffer);
    document.getElementById('use-target-btn')?.addEventListener('click', useTargetOffer);
    
    // Calculator collapse/expand toggle
    const calcHeader = document.getElementById('calc-header');
    const calcBody = document.getElementById('calc-body');
    if (calcHeader && calcBody) {
        calcHeader.addEventListener('click', () => {
            calcHeader.classList.toggle('collapsed');
            calcBody.classList.toggle('collapsed');
        });
    }
    
    // Scenario tabs
    document.querySelectorAll('.calc-scenario-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const scenarioIndex = parseInt(e.target.dataset.scenario);
            switchScenario(scenarioIndex);
        });
    });
    
    // Panel drag functionality
    initializePanelDrag();
    
    // Load view style preference and set in Buy Box
    chrome.storage.local.get(['dealViewStyle'], (result) => {
        dealViewStyle = result.dealViewStyle || 'popup';
        const popupRadio = document.getElementById('view-style-popup');
        const sidebarRadio = document.getElementById('view-style-sidebar');
        if (popupRadio && sidebarRadio) {
            popupRadio.checked = dealViewStyle === 'popup';
            sidebarRadio.checked = dealViewStyle === 'sidebar';
        }
    });
    
    // Save view style preference when changed
    document.querySelectorAll('input[name="deal-view-style"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            dealViewStyle = e.target.value;
            chrome.storage.local.set({ dealViewStyle });
        });
    });
}

// ====== PANEL DRAG FUNCTIONALITY ======
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panelStartLeft = 0;
let panelStartTop = 0;

function initializePanelDrag() {
    const panel = document.getElementById('deal-details-panel');
    const header = document.getElementById('deal-panel-close')?.parentElement; // Get header element
    
    if (!panel || !header) return;
    
    header.addEventListener('mousedown', (e) => {
        // Don't drag if clicking close button
        if (e.target.closest('.deal-panel-close')) return;
        
        // Only enable drag for popup mode
        if (!panel.classList.contains('popup-mode')) return;
        
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        // Get current position
        const rect = panel.getBoundingClientRect();
        panelStartLeft = rect.left;
        panelStartTop = rect.top;
        
        // Remove transform and set absolute positioning
        panel.classList.add('dragging');
        panel.style.left = panelStartLeft + 'px';
        panel.style.top = panelStartTop + 'px';
        
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const panel = document.getElementById('deal-details-panel');
        if (!panel) return;
        
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        
        panel.style.left = (panelStartLeft + deltaX) + 'px';
        panel.style.top = (panelStartTop + deltaY) + 'px';
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

// ====== SCENARIO MANAGEMENT ======
let currentScenarioIndex = 0;
let dealScenarios = [{}, {}, {}]; // Store 3 scenarios

function switchScenario(index) {
    // Save current scenario first
    saveCurrentScenarioData();
    
    // Update tab UI
    document.querySelectorAll('.calc-scenario-tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === index);
    });
    
    currentScenarioIndex = index;
    
    // Load scenario data
    loadScenarioData(index);
    
    // Recalculate
    runFullCalculator();
}

function saveCurrentScenarioData() {
    dealScenarios[currentScenarioIndex] = {
        ebitda: document.getElementById('calc-ebitda')?.value || '',
        asking: document.getElementById('calc-asking')?.value || '',
        dscr: document.getElementById('calc-dscr')?.value || '1.25',
        sbaPercent: document.getElementById('calc-sba-percent')?.value || '80',
        sbaRate: document.getElementById('calc-sba-rate')?.value || '11.5',
        sbaTerm: document.getElementById('calc-sba-term')?.value || '10',
        equityPercent: document.getElementById('calc-equity-percent')?.value || '10',
        salary: document.getElementById('calc-salary')?.value || '150000',
        sellerEnabled: document.getElementById('calc-seller-enabled')?.checked || false,
        sellerPercent: document.getElementById('calc-seller-percent')?.value || '10',
        sellerRate: document.getElementById('calc-seller-rate')?.value || '6.0',
        sellerType: document.getElementById('calc-seller-type')?.value || 'amortizing',
        sellerStandby: document.getElementById('calc-seller-standby')?.value || 'no'
    };
}

function loadScenarioData(index) {
    const scenario = dealScenarios[index];
    
    // Set values, using defaults if scenario is empty
    const setVal = (id, val, def) => {
        const el = document.getElementById(id);
        if (el) el.value = val || def;
    };
    
    setVal('calc-ebitda', scenario.ebitda, '');
    setVal('calc-asking', scenario.asking, '');
    setVal('calc-dscr', scenario.dscr, '1.25');
    setVal('calc-sba-percent', scenario.sbaPercent, '80');
    setVal('calc-sba-rate', scenario.sbaRate, '11.5');
    setVal('calc-sba-term', scenario.sbaTerm, '10');
    setVal('calc-equity-percent', scenario.equityPercent, '10');
    setVal('calc-salary', scenario.salary, '150000');
    setVal('calc-seller-percent', scenario.sellerPercent, '10');
    setVal('calc-seller-rate', scenario.sellerRate, '6.0');
    setVal('calc-seller-type', scenario.sellerType, 'amortizing');
    setVal('calc-seller-standby', scenario.sellerStandby, 'no');
    
    // Handle seller checkbox
    const sellerCheck = document.getElementById('calc-seller-enabled');
    if (sellerCheck) {
        sellerCheck.checked = scenario.sellerEnabled || false;
        const fieldsEl = document.getElementById('seller-note-fields');
        if (fieldsEl) {
            fieldsEl.style.display = sellerCheck.checked ? 'block' : 'none';
        }
    }
}

function resetScenarios() {
    dealScenarios = [{}, {}, {}];
    currentScenarioIndex = 0;
    document.querySelectorAll('.calc-scenario-tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === 0);
    });
}

// ===== SOURCE MANAGEMENT MODAL =====
let selectedSourceType = null;

// Make function globally accessible via window
window.openSourceManagementModal = function openSourceManagementModal() {
    console.log('📥 openSourceManagementModal called');
    const modal = document.getElementById('source-management-modal');
    if (!modal) {
        console.error('❌ source-management-modal not found in DOM');
        alert('Source management modal not found. Please refresh the page.');
        return;
    }
    
    console.log('✅ Found modal element, setting display...');
    console.log('   Current display:', modal.style.display);
    console.log('   Current visibility:', window.getComputedStyle(modal).display);
    
    // Force show the modal with multiple approaches
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    modal.style.zIndex = '10000';
    
    console.log('   New display:', modal.style.display);
    console.log('✅ Modal should now be visible');
    
    // Load sources list
    if (typeof loadCustomSourcesList === 'function') {
        console.log('📋 Loading custom sources list...');
        loadCustomSourcesList();
    } else {
        console.warn('⚠️ loadCustomSourcesList function not found');
    }
    
    // Reset form
    selectedSourceType = null;
    const formEl = document.getElementById('source-config-form');
    if (formEl) {
        formEl.style.display = 'none';
    }
    document.querySelectorAll('.source-type-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    console.log('✅ Source management modal fully initialized');
}

function closeSourceManagementModal() {
    const modal = document.getElementById('source-management-modal');
    if (modal) modal.style.display = 'none';
}

// Load and display custom sources
async function loadCustomSourcesList() {
    const listEl = document.getElementById('custom-sources-list');
    if (!listEl) return;
    
    try {
        const sources = await getCustomSources();
        
        if (sources.length === 0) {
            listEl.innerHTML = `
                <p style="text-align: center; color: var(--text-secondary); font-size: 12px; padding: 20px;">
                    No custom sources added yet. Select a source type below to get started.
                </p>
            `;
            return;
        }
        
        listEl.innerHTML = '';
        sources.forEach(source => {
            const sourceEl = createSourceListItem(source);
            listEl.appendChild(sourceEl);
        });
        
    } catch (error) {
        console.error('Error loading sources:', error);
        showToast('Error loading sources: ' + error.message, 'error');
    }
}

// Create source list item
function createSourceListItem(source) {
    const div = document.createElement('div');
    div.className = 'source-item' + (source.enabled ? '' : ' disabled');
    div.innerHTML = `
        <div class="source-item-info">
            <div class="source-item-name">${escapeHtml(source.name)}</div>
            <div class="source-item-meta">
                Type: ${source.type} | 
                Deals: ${source.dealCount || 0} | 
                ${source.lastFetch ? 'Last: ' + formatRelativeTime(source.lastFetch) : 'Never fetched'}
            </div>
        </div>
        <div class="source-item-actions">
            <button class="source-item-btn toggle-btn">${source.enabled ? '✓ Enabled' : 'Disabled'}</button>
            <button class="source-item-btn fetch-btn">🔄 Fetch</button>
            <button class="source-item-btn delete">🗑️</button>
        </div>
    `;
    
    // Event handlers
    const toggleBtn = div.querySelector('.toggle-btn');
    const fetchBtn = div.querySelector('.fetch-btn');
    const deleteBtn = div.querySelector('.delete');
    
    toggleBtn.addEventListener('click', async () => {
        await toggleCustomSource(source.id, !source.enabled);
        await loadCustomSourcesList();
        showToast(`Source ${source.enabled ? 'disabled' : 'enabled'}`, 'success');
    });
    
    fetchBtn.addEventListener('click', async () => {
        fetchBtn.disabled = true;
        const originalText = fetchBtn.textContent;
        fetchBtn.textContent = '⏳ Fetching...';
        showToast(`Fetching deals from ${source.name}...`, 'info');
        
        try {
            const deals = await fetchCustomSource(source);
            console.log(`✅ Fetched ${deals.length} deals from ${source.name}`);
            
            const stats = await addDealsToPool(deals);
            console.log(`📊 Added ${stats.added} new, updated ${stats.updated}, unchanged ${stats.unchanged}, total: ${stats.total}`);
            
            await loadAggregatorDeals();
            await loadCustomSourcesList();
            await updateHiddenDealsCount(); // Update hidden count
            
            // Build summary message
            const parts = [];
            if (stats.added > 0) parts.push(`${stats.added} new`);
            if (stats.updated > 0) parts.push(`${stats.updated} updated`);
            const summary = parts.length > 0 ? parts.join(', ') : 'No changes';
            
            showToast(`✅ ${summary} from ${source.name}`, 'success', 3000);
        } catch (error) {
            showToast(`Error fetching ${source.name}: ${error.message}`, 'error');
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.textContent = '🔄 Fetch';
        }
    });
    
    deleteBtn.addEventListener('click', async () => {
        if (confirm(`Delete source "${source.name}"? This will not remove already aggregated deals.`)) {
            await removeCustomSource(source.id);
            await loadCustomSourcesList();
            showToast('Source deleted', 'success');
        }
    });
    
    return div;
}

// Initialize source modal handlers
document.addEventListener('DOMContentLoaded', () => {
    // Source type cards
    document.querySelectorAll('.source-type-card').forEach(card => {
        card.addEventListener('click', () => {
            selectedSourceType = card.getAttribute('data-type');
            
            // Update UI
            document.querySelectorAll('.source-type-card').forEach(c => {
                c.classList.remove('selected');
            });
            card.classList.add('selected');
            
            // Show form
            const formEl = document.getElementById('source-config-form');
            if (formEl) formEl.style.display = 'block';
            
            // Update hint
            const hint = document.getElementById('source-url-hint');
            if (hint) {
                if (selectedSourceType === 'google_sheets') {
                    hint.textContent = 'Enter Google Sheets URL (must be shared with "Anyone with link can view")';
                } else if (selectedSourceType === 'csv_url') {
                    hint.textContent = 'Enter direct URL to CSV file';
                }
            }
        });
    });
    
    // Add source button
    const addSourceBtn = document.getElementById('add-source-btn');
    if (addSourceBtn) {
        addSourceBtn.addEventListener('click', async () => {
            const name = document.getElementById('source-name').value.trim();
            const url = document.getElementById('source-url').value.trim();
            
            if (!name || !url || !selectedSourceType) {
                showToast('Please fill in all fields', 'warning');
                return;
            }
            
            try {
                addSourceBtn.disabled = true;
                addSourceBtn.classList.add('loading');
                
                const source = {
                    name: name,
                    type: selectedSourceType,
                    url: url
                };
                
                await addCustomSource(source);
                await loadCustomSourcesList();
                
                // Clear form
                document.getElementById('source-name').value = '';
                document.getElementById('source-url').value = '';
                const formEl = document.getElementById('source-config-form');
                if (formEl) formEl.style.display = 'none';
                document.querySelectorAll('.source-type-card').forEach(c => {
                    c.classList.remove('selected');
                });
                selectedSourceType = null;
                
                showToast('✅ Source added successfully!', 'success');
                
            } catch (error) {
                showToast('Error adding source: ' + error.message, 'error');
            } finally {
                addSourceBtn.disabled = false;
                addSourceBtn.classList.remove('loading');
            }
        });
    }
    
    // Cancel source button
    const cancelSourceBtn = document.getElementById('cancel-source-btn');
    if (cancelSourceBtn) {
        cancelSourceBtn.addEventListener('click', () => {
            const formEl = document.getElementById('source-config-form');
            if (formEl) formEl.style.display = 'none';
            document.getElementById('source-name').value = '';
            document.getElementById('source-url').value = '';
            document.querySelectorAll('.source-type-card').forEach(c => {
                c.classList.remove('selected');
            });
            selectedSourceType = null;
        });
    }
    
    // Close source modal
    const sourceModalClose = document.getElementById('source-modal-close');
    if (sourceModalClose) {
        sourceModalClose.addEventListener('click', closeSourceManagementModal);
    }
    
    // Click outside to close
    const sourceModal = document.getElementById('source-management-modal');
    if (sourceModal) {
        sourceModal.addEventListener('click', (e) => {
            if (e.target === sourceModal) {
                closeSourceManagementModal();
            }
        });
    }
});

// ===== MANUAL DEAL ENTRY MODAL =====
// Make function globally accessible via window
window.openManualDealModal = function openManualDealModal() {
    console.log('➕ openManualDealModal called');
    const modal = document.getElementById('manual-deal-modal');
    if (!modal) {
        console.error('❌ manual-deal-modal not found in DOM');
        alert('Manual deal modal not found. Please refresh the page.');
        return;
    }
    
    console.log('✅ Found modal element, setting display...');
    console.log('   Current display:', modal.style.display);
    
    // Force show the modal with multiple approaches
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    modal.style.zIndex = '10000';
    
    console.log('   New display:', modal.style.display);
    console.log('✅ Modal should now be visible');
    
    // Clear form
    if (typeof clearManualDealForm === 'function') {
        console.log('📋 Clearing manual deal form...');
        clearManualDealForm();
    } else {
        console.warn('⚠️ clearManualDealForm function not found');
    }
    
    console.log('✅ Manual deal modal fully initialized');
}

function closeManualDealModal() {
    const modal = document.getElementById('manual-deal-modal');
    if (modal) modal.style.display = 'none';
}

function clearManualDealForm() {
    const fields = [
        'manual-business-name', 'manual-description', 'manual-city', 'manual-state',
        'manual-industry', 'manual-price', 'manual-revenue', 'manual-ebitda',
        'manual-cashflow', 'manual-contact-name', 'manual-contact-phone',
        'manual-contact-email', 'manual-source-notes', 'manual-notes'
    ];
    
    fields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) el.value = '';
    });
}

// Save manual deal
async function saveManualDeal() {
    try {
        // Collect form data
        const businessName = document.getElementById('manual-business-name')?.value.trim();
        const description = document.getElementById('manual-description')?.value.trim();
        const city = document.getElementById('manual-city')?.value.trim();
        const state = document.getElementById('manual-state')?.value.trim().toUpperCase();
        const industry = document.getElementById('manual-industry')?.value;
        const price = parseFloat(document.getElementById('manual-price')?.value) || 0;
        const revenue = parseFloat(document.getElementById('manual-revenue')?.value) || 0;
        const ebitda = parseFloat(document.getElementById('manual-ebitda')?.value) || 0;
        const cashflow = parseFloat(document.getElementById('manual-cashflow')?.value) || 0;
        const contactName = document.getElementById('manual-contact-name')?.value.trim();
        const contactPhone = document.getElementById('manual-contact-phone')?.value.trim();
        const contactEmail = document.getElementById('manual-contact-email')?.value.trim();
        const sourceNotes = document.getElementById('manual-source-notes')?.value.trim();
        const notes = document.getElementById('manual-notes')?.value.trim();
        
        // Validate required fields
        if (!businessName) {
            showToast('Business name is required', 'warning');
            return;
        }
        
        // Create deal object
        const manualDeal = {
            id: 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: businessName,
            url: '', // No URL for off-market deals
            description: description,
            source: 'Manual Entry (Off-Market)',
            sourceType: 'manual',
            discoveredAt: Date.now(),
            askingPrice: price,
            revenue: revenue,
            ebitda: ebitda || cashflow,
            location: city && state ? `${city}, ${state}` : '',
            city: city,
            state: state,
            industry: industry,
            contactName: contactName,
            contactPhone: contactPhone,
            contactEmail: contactEmail,
            sourceNotes: sourceNotes,
            notes: notes,
            manualEntry: true
        };
        
        // Add to aggregated pool
        await addDealsToPool([manualDeal]);
        
        // Also save to My Deals immediately (off-market deals are typically high-value)
        const savedDealFormat = convertAggregatorDealToSaved(manualDeal);
        savedDealFormat.dealId = manualDeal.id;
        savedDealFormat.inputs.ebitdaSDE = manualDeal.ebitda;
        savedDealFormat.inputs.askingPrice = manualDeal.askingPrice;
        savedDealFormat.notes = notes;
        
        if (contactName || contactPhone || contactEmail) {
            savedDealFormat.broker = {
                name: contactName,
                phone: contactPhone,
                email: contactEmail,
                company: 'Direct Contact'
            };
        }
        
        const existingDeals = await new Promise((resolve) => {
            chrome.storage.local.get(['savedDeals'], (result) => {
                resolve(result.savedDeals || []);
            });
        });
        
        existingDeals.unshift(savedDealFormat);
        
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({ savedDeals: existingDeals }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
        
        // Update UI
        await loadAggregatorDeals();
        document.getElementById('my-deals-count').textContent = formatNumber(existingDeals.length);
        
        showToast('✅ Off-market deal added successfully!', 'success');
        queueVettrPostDeal(savedDealFormat, { manual: manualDeal });
        closeManualDealModal();
        
    } catch (error) {
        console.error('Error saving manual deal:', error);
        showToast('Error saving deal: ' + error.message, 'error');
    }
}

// ===== BUY BOX CONFIGURATION =====

// Default buy box configuration
const DEFAULT_BUYBOX = {
    minPrice: null,
    maxPrice: null,
    minEbitda: null,
    maxEbitda: null,
    minRevenue: null,
    revenueMultiple: null,
    targetStates: [],
    excludeStates: [],
    targetIndustries: [],
    minQuality: null
};

let currentBuyBox = { ...DEFAULT_BUYBOX };

// Open buy box configuration modal
// Make function globally accessible via window
window.openBuyBoxModal = function openBuyBoxModal() {
    console.log('⚙️ Opening Buy Box configuration modal');
    const modal = document.getElementById('buybox-modal');
    if (!modal) {
        console.error('❌ buybox-modal not found');
        showToast('Buy Box modal not found', 'error');
        return;
    }
    
    modal.style.display = 'flex';
    
    // Load existing buy box settings
    loadBuyBoxSettings();
}

// Close buy box modal
function closeBuyBoxModal() {
    const modal = document.getElementById('buybox-modal');
    if (modal) modal.style.display = 'none';
}

// Load buy box config into memory (without updating UI)
async function loadBuyBoxConfig() {
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(['buyBoxConfig'], (result) => {
                resolve(result.buyBoxConfig || DEFAULT_BUYBOX);
            });
        });
        
        currentBuyBox = result;
        console.log('📦 Buy Box config loaded:', currentBuyBox);
        
    } catch (error) {
        console.error('Error loading buy box config:', error);
        currentBuyBox = { ...DEFAULT_BUYBOX };
    }
}

// Load buy box settings from storage and populate form
async function loadBuyBoxSettings() {
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(['buyBoxConfig'], (result) => {
                resolve(result.buyBoxConfig || DEFAULT_BUYBOX);
            });
        });
        
        currentBuyBox = result;
        
        // Populate form fields
        document.getElementById('buybox-min-price').value = currentBuyBox.minPrice || '';
        document.getElementById('buybox-max-price').value = currentBuyBox.maxPrice || '';
        document.getElementById('buybox-min-ebitda').value = currentBuyBox.minEbitda || '';
        document.getElementById('buybox-max-ebitda').value = currentBuyBox.maxEbitda || '';
        document.getElementById('buybox-min-revenue').value = currentBuyBox.minRevenue || '';
        document.getElementById('buybox-revenue-multiple').value = currentBuyBox.revenueMultiple || '';
        document.getElementById('buybox-states').value = currentBuyBox.targetStates?.join(', ') || '';
        document.getElementById('buybox-exclude-states').value = currentBuyBox.excludeStates?.join(', ') || '';
        document.getElementById('buybox-min-quality').value = currentBuyBox.minQuality || '';
        
        // Set industry checkboxes
        const industries = currentBuyBox.targetIndustries || [];
        const checkboxes = {
            'Healthcare': 'buybox-ind-healthcare',
            'SaaS': 'buybox-ind-saas',
            'Manufacturing': 'buybox-ind-manufacturing',
            'Restaurant': 'buybox-ind-restaurant',
            'Retail': 'buybox-ind-retail',
            'E-commerce': 'buybox-ind-ecommerce',
            'Services': 'buybox-ind-services',
            'Real Estate': 'buybox-ind-realestate'
        };
        
        Object.entries(checkboxes).forEach(([industry, id]) => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.checked = industries.includes(industry);
            }
        });
        
        updateBuyBoxPreview();
        
    } catch (error) {
        console.error('Error loading buy box settings:', error);
        showToast('Error loading settings', 'error');
    }
}

// Save buy box configuration
async function saveBuyBoxConfig() {
    try {
        // Helper to parse currency-formatted input values (strips $, commas)
        const parseBuyBoxNumber = (val) => {
            if (!val) return null;
            const num = parseFloat(String(val).replace(/[$,]/g, ''));
            return isNaN(num) ? null : num;
        };
        
        // Collect form data
        const minPrice = parseBuyBoxNumber(document.getElementById('buybox-min-price')?.value);
        const maxPrice = parseBuyBoxNumber(document.getElementById('buybox-max-price')?.value);
        const minEbitda = parseBuyBoxNumber(document.getElementById('buybox-min-ebitda')?.value);
        const maxEbitda = parseBuyBoxNumber(document.getElementById('buybox-max-ebitda')?.value);
        const minRevenue = parseBuyBoxNumber(document.getElementById('buybox-min-revenue')?.value);
        const revenueMultiple = parseBuyBoxNumber(document.getElementById('buybox-revenue-multiple')?.value);
        
        // Parse states (comma-separated)
        const statesInput = document.getElementById('buybox-states')?.value || '';
        const targetStates = statesInput
            .split(',')
            .map(s => s.trim().toUpperCase())
            .filter(s => s.length === 2);
        
        const excludeStatesInput = document.getElementById('buybox-exclude-states')?.value || '';
        const excludeStates = excludeStatesInput
            .split(',')
            .map(s => s.trim().toUpperCase())
            .filter(s => s.length === 2);
        
        // Get selected industries
        const targetIndustries = [];
        const checkboxes = {
            'Healthcare': 'buybox-ind-healthcare',
            'SaaS': 'buybox-ind-saas',
            'Manufacturing': 'buybox-ind-manufacturing',
            'Restaurant': 'buybox-ind-restaurant',
            'Retail': 'buybox-ind-retail',
            'E-commerce': 'buybox-ind-ecommerce',
            'Services': 'buybox-ind-services',
            'Real Estate': 'buybox-ind-realestate'
        };
        
        Object.entries(checkboxes).forEach(([industry, id]) => {
            const checkbox = document.getElementById(id);
            if (checkbox?.checked) {
                targetIndustries.push(industry);
            }
        });
        
        const minQuality = parseBuyBoxNumber(document.getElementById('buybox-min-quality')?.value);
        
        // Validate
        if (minPrice && maxPrice && minPrice > maxPrice) {
            showToast('Min price cannot be greater than max price', 'warning');
            return;
        }
        
        if (minEbitda && maxEbitda && minEbitda > maxEbitda) {
            showToast('Min EBITDA cannot be greater than max EBITDA', 'warning');
            return;
        }
        
        // Build config object
        const buyBoxConfig = {
            minPrice,
            maxPrice,
            minEbitda,
            maxEbitda,
            minRevenue,
            revenueMultiple,
            targetStates,
            excludeStates,
            targetIndustries,
            minQuality
        };
        
        // Save to storage
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({ buyBoxConfig }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
        
        currentBuyBox = buyBoxConfig;
        
        showToast('✅ Buy Box configuration saved!', 'success');
        closeBuyBoxModal();
        
        // Re-apply filters with new Buy Box criteria
        if (currentTab === 'aggregator') {
            applyAggregatorFilters();
        }
        
    } catch (error) {
        console.error('Error saving buy box:', error);
        showToast('Error saving configuration', 'error');
    }
}

// Reset buy box to defaults
async function resetBuyBox() {
    if (!confirm('Reset Buy Box to default settings?')) return;
    
    try {
        await new Promise((resolve, reject) => {
            chrome.storage.local.set({ buyBoxConfig: DEFAULT_BUYBOX }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
        
        currentBuyBox = { ...DEFAULT_BUYBOX };
        loadBuyBoxSettings();
        showToast('Buy Box reset to defaults', 'success');
        
    } catch (error) {
        console.error('Error resetting buy box:', error);
        showToast('Error resetting configuration', 'error');
    }
}

// Check if deal matches buy box criteria
function dealMatchesBuyBox(deal) {
    // Ensure currentBuyBox is initialized
    if (!currentBuyBox) {
        console.warn('⚠️ Buy Box not loaded yet, allowing all deals');
        return true;
    }
    
    // If no criteria set, all deals match
    const hasAnyCriteria = 
        currentBuyBox.minPrice || currentBuyBox.maxPrice ||
        currentBuyBox.minEbitda || currentBuyBox.maxEbitda ||
        currentBuyBox.minRevenue || currentBuyBox.revenueMultiple ||
        (currentBuyBox.targetStates && currentBuyBox.targetStates.length > 0) ||
        (currentBuyBox.excludeStates && currentBuyBox.excludeStates.length > 0) ||
        (currentBuyBox.targetIndustries && currentBuyBox.targetIndustries.length > 0) ||
        currentBuyBox.minQuality;
    
    if (!hasAnyCriteria) {
        return true;
    }
    
    // Price checks
    if (currentBuyBox.minPrice && deal.askingPrice < currentBuyBox.minPrice) return false;
    if (currentBuyBox.maxPrice && deal.askingPrice > currentBuyBox.maxPrice) return false;
    
    // EBITDA checks
    if (currentBuyBox.minEbitda && deal.ebitda < currentBuyBox.minEbitda) return false;
    if (currentBuyBox.maxEbitda && deal.ebitda > currentBuyBox.maxEbitda) return false;
    
    // Revenue checks
    if (currentBuyBox.minRevenue && deal.revenue && deal.revenue < currentBuyBox.minRevenue) return false;
    if (currentBuyBox.revenueMultiple && deal.revenue) {
        const actualMultiple = deal.askingPrice / deal.revenue;
        if (actualMultiple > currentBuyBox.revenueMultiple) return false;
    }
    
    // State checks
    if (currentBuyBox.targetStates && currentBuyBox.targetStates.length > 0) {
        const dealState = deal.state?.toUpperCase();
        if (!dealState || !currentBuyBox.targetStates.includes(dealState)) {
            // Debug: Log filtered deals
            if (dealState === 'WA') {
                console.log(`🚫 Filtering out deal from ${dealState} (not in target states: ${currentBuyBox.targetStates.join(', ')}):`, deal.name);
            }
            return false;
        }
    }
    
    if (currentBuyBox.excludeStates && currentBuyBox.excludeStates.length > 0) {
        const dealState = deal.state?.toUpperCase();
        if (dealState && currentBuyBox.excludeStates.includes(dealState)) {
            console.log(`🚫 Filtering out deal from excluded state ${dealState}:`, deal.name);
            return false;
        }
    }
    
    // Industry checks
    if (currentBuyBox.targetIndustries && currentBuyBox.targetIndustries.length > 0) {
        if (!deal.industry || !currentBuyBox.targetIndustries.includes(deal.industry)) return false;
    }
    
    // Quality score check
    if (currentBuyBox.minQuality && deal.qualityScore && deal.qualityScore < currentBuyBox.minQuality) return false;
    
    // Custom column filters (e.g., Absentee Run, Remote/Relocatable)
    if (currentBuyBox.customFilters && deal.rawColumns) {
        for (const [columnName, expectedValue] of Object.entries(currentBuyBox.customFilters)) {
            const actualValue = deal.rawColumns[columnName];
            
            // Simple string matching (case-insensitive)
            if (typeof expectedValue === 'string') {
                const actualStr = String(actualValue || '').toLowerCase();
                const expectedStr = expectedValue.toLowerCase();
                
                // Check if actual value contains expected value (supports "Yes", "Y", etc.)
                if (!actualStr.includes(expectedStr)) {
                    return false;
                }
            }
            // Boolean matching
            else if (typeof expectedValue === 'boolean') {
                const actualBool = actualValue === true || 
                                   actualValue === 'true' || 
                                   actualValue === 'Yes' || 
                                   actualValue === 'Y' ||
                                   actualValue === '1';
                if (actualBool !== expectedValue) {
                    return false;
                }
            }
        }
    }
    
    return true;
}

// Update buy box preview
function updateBuyBoxPreview() {
    const previewEl = document.getElementById('buybox-preview');
    if (!previewEl) return;
    
    const criteria = [];
    
    if (currentBuyBox.minPrice || currentBuyBox.maxPrice) {
        const min = currentBuyBox.minPrice ? formatCurrency(currentBuyBox.minPrice) : 'any';
        const max = currentBuyBox.maxPrice ? formatCurrency(currentBuyBox.maxPrice) : 'any';
        criteria.push(`💰 Price: ${min} - ${max}`);
    }
    
    if (currentBuyBox.minEbitda || currentBuyBox.maxEbitda) {
        const min = currentBuyBox.minEbitda ? formatCurrency(currentBuyBox.minEbitda) : 'any';
        const max = currentBuyBox.maxEbitda ? formatCurrency(currentBuyBox.maxEbitda) : 'any';
        criteria.push(`📊 EBITDA: ${min} - ${max}`);
    }
    
    if (currentBuyBox.targetStates && currentBuyBox.targetStates.length > 0) {
        criteria.push(`📍 States: ${currentBuyBox.targetStates.join(', ')}`);
    }
    
    if (currentBuyBox.targetIndustries && currentBuyBox.targetIndustries.length > 0) {
        criteria.push(`🏭 Industries: ${currentBuyBox.targetIndustries.join(', ')}`);
    }
    
    if (currentBuyBox.minQuality) {
        criteria.push(`⭐ Min Quality: ${currentBuyBox.minQuality}`);
    }
    
    if (criteria.length === 0) {
        previewEl.textContent = 'No criteria set - all deals will be shown';
    } else {
        previewEl.innerHTML = criteria.join('<br>');
    }
}

// Initialize buy box modal handlers
document.addEventListener('DOMContentLoaded', () => {
    // Save button
    const saveBtn = document.getElementById('buybox-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveBuyBoxConfig);
    }
    
    // Reset button
    const resetBtn = document.getElementById('buybox-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetBuyBox);
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('buybox-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeBuyBoxModal);
    }
    
    // Close button
    const closeBtn = document.getElementById('buybox-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeBuyBoxModal);
    }
    
    // Update preview on field changes
    const formFields = [
        'buybox-min-price', 'buybox-max-price', 'buybox-min-ebitda', 'buybox-max-ebitda',
        'buybox-min-revenue', 'buybox-revenue-multiple', 'buybox-states', 'buybox-exclude-states',
        'buybox-min-quality'
    ];
    
    // Add live formatting to number input fields
    const numberFields = ['buybox-min-price', 'buybox-max-price', 'buybox-min-ebitda', 
                          'buybox-max-ebitda', 'buybox-min-revenue', 'buybox-revenue-multiple'];
    numberFields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            // Change type from number to text to allow formatting
            if (el.type === 'number') {
                el.type = 'text';
            }
            el.addEventListener('input', liveFormatDashboardInput);
        }
    });
    
    formFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', updateBuyBoxPreview);
        }
    });
    
    // Update preview on checkbox changes
    const checkboxIds = [
        'buybox-ind-healthcare', 'buybox-ind-saas', 'buybox-ind-manufacturing',
        'buybox-ind-restaurant', 'buybox-ind-retail', 'buybox-ind-ecommerce',
        'buybox-ind-services', 'buybox-ind-realestate'
    ];
    
    checkboxIds.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', updateBuyBoxPreview);
        }
    });
});

// Initialize manual deal modal handlers
document.addEventListener('DOMContentLoaded', () => {
    // Add live formatting to manual deal number fields
    const manualNumberFields = ['manual-price', 'manual-revenue', 'manual-ebitda', 'manual-cashflow'];
    manualNumberFields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            // Change type from number to text to allow formatting
            el.type = 'text';
            el.addEventListener('input', liveFormatDashboardInput);
        }
    });
    
    // Save manual deal button
    const saveBtn = document.getElementById('manual-deal-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveManualDeal);
    }
    
    // Cancel manual deal button
    const cancelBtn = document.getElementById('manual-deal-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeManualDealModal);
    }
    
    // Close manual deal modal
    const manualDealClose = document.getElementById('manual-deal-close');
    if (manualDealClose) {
        manualDealClose.addEventListener('click', closeManualDealModal);
    }
    
    // Click outside to close
    const manualModal = document.getElementById('manual-deal-modal');
    if (manualModal) {
        manualModal.addEventListener('click', (e) => {
            if (e.target === manualModal) {
                closeManualDealModal();
            }
        });
    }
});

// Format relative time
function formatRelativeTime(timestamp) {
    if (!timestamp) return '-';
    
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}

// Format price
function formatPrice(price) {
    if (!price || price === 0) return '-';
    
    if (price >= 1000000) {
        const millions = (price / 1000000).toFixed(1);
        return `$${parseFloat(millions).toLocaleString()}M`;
    } else if (price >= 1000) {
        const thousands = (price / 1000).toFixed(0);
        return `$${parseFloat(thousands).toLocaleString()}K`;
    }
    return `$${Math.round(price).toLocaleString()}`;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== MAIN DASHBOARD CODE =====
let allDeals = [];
let filteredDeals = [];
let selectedDeals = new Set();
let currentSort = 'date-desc';
let searchTimeout = null;

// Toast notification system
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-content">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after duration
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Validate deal structure
// Sanitize and improve deal name
function sanitizeDealName(deal) {
    let name = deal.name || '';
    
    // If name is "Unnamed Deal" or empty, try to generate a better one
    if (!name || name === 'Unnamed Deal' || name.trim() === '') {
        console.warn('Found unnamed deal, attempting to generate name:', deal);
        
        // Try to extract from description
        if (deal.description && deal.description.trim()) {
            const desc = deal.description.trim();
            const firstSentence = desc.split(/[.!?\n]/)[0].trim();
            if (firstSentence && firstSentence.length > 0 && firstSentence.length <= 100) {
                return firstSentence;
            }
            if (desc.length <= 100) {
                return desc;
            }
            return desc.substring(0, 97) + '...';
        }
        
        // Build from industry + location
        if (deal.industry && deal.location) {
            return `${deal.industry} Business in ${deal.location}`;
        }
        if (deal.industry) {
            return `${deal.industry} Business`;
        }
        if (deal.location) {
            return `Business in ${deal.location}`;
        }
        
        // Try to extract from inputs
        if (deal.inputs && deal.inputs.businessName) {
            return deal.inputs.businessName;
        }
        
        // Try to extract domain from URL
        if (deal.url) {
            try {
                const urlObj = new URL(deal.url);
                const domain = urlObj.hostname.replace('www.', '');
                if (domain) {
                    return `Business - ${domain}`;
                }
            } catch (e) {
                // Not a valid URL
            }
        }
        
        // Last resort: use timestamp
        console.error('Could not generate meaningful name for deal:', deal);
        return `Deal from ${new Date(deal.discoveredAt || deal.savedAt || Date.now()).toLocaleDateString()}`;
    }
    
    return name;
}

function validateDeal(deal) {
    if (!deal || typeof deal !== 'object') return false;
    if (!deal.name || typeof deal.name !== 'string') return false;
    if (!deal.url || typeof deal.url !== 'string') return false;
    if (!deal.savedAt) return false;
    if (!deal.inputs || typeof deal.inputs !== 'object') return false;
    if (!deal.results || typeof deal.results !== 'object') return false;
    return true;
}

// Safe storage operation with error handling
function saveDeals(deals, callback) {
    try {
        // Validate all deals before saving
        const validDeals = deals.filter(deal => {
            if (!validateDeal(deal)) {
                console.warn('Invalid deal structure:', deal);
                return false;
            }
            return true;
        });
        
        if (validDeals.length !== deals.length) {
            showToast(`Removed ${deals.length - validDeals.length} invalid deal(s)`, 'warning');
        }
        
        chrome.storage.local.set({ savedDeals: validDeals }, () => {
            if (chrome.runtime.lastError) {
                console.error('Storage error:', chrome.runtime.lastError);
                showToast('Failed to save deals. ' + chrome.runtime.lastError.message, 'error');
                if (callback) callback(false);
            } else {
                if (callback) callback(true);
            }
        });
    } catch (error) {
        console.error('Error saving deals:', error);
        showToast('Error saving deals: ' + error.message, 'error');
        if (callback) callback(false);
    }
}

// Load deals from Chrome storage
function loadDeals() {
    try {
        chrome.storage.local.get(['savedDeals'], (result) => {
            try {
                if (chrome.runtime.lastError) {
                    console.error('Storage error:', chrome.runtime.lastError);
                    showToast('Failed to load deals: ' + chrome.runtime.lastError.message, 'error');
                    document.getElementById('loading').style.display = 'none';
                    return;
                }
                
                const rawDeals = result.savedDeals || [];
                
                // Validate, clean, and sanitize deal names
                let namesFixed = 0;
                allDeals = rawDeals
                    .filter(deal => {
                        if (!validateDeal(deal)) {
                            console.warn('Skipping invalid deal:', deal);
                            return false;
                        }
                        return true;
                    })
                    .map(deal => {
                        const originalName = deal.name;
                        const sanitizedName = sanitizeDealName(deal);
                        
                        if (originalName !== sanitizedName) {
                            namesFixed++;
                            console.log(`Fixed deal name: "${originalName}" -> "${sanitizedName}"`);
                        }
                        
                        return {
                            ...deal,
                            name: sanitizedName,
                            status: deal.status || 'none'
                        };
                    });
                
                // Log summary of fixes
                if (namesFixed > 0) {
                    console.log(`Fixed ${namesFixed} unnamed deal(s)`);
                }
                
                // If we filtered out invalid deals, save the cleaned version
                if (rawDeals.length !== allDeals.length) {
                    saveDeals(allDeals, (success) => {
                        if (success) {
                            showToast(`Cleaned ${rawDeals.length - allDeals.length} invalid deal(s)`, 'warning');
                        }
                    });
                }
                
                filteredDeals = [...allDeals];
                updateStats();
                applyFiltersAndSort();
                renderDeals();
                
                document.getElementById('loading').style.display = 'none';
                
                if (allDeals.length === 0) {
                    document.getElementById('empty-state').style.display = 'block';
                    document.getElementById('deals-table').style.display = 'none';
                } else {
                    document.getElementById('empty-state').style.display = 'none';
                    document.getElementById('deals-table').style.display = 'table';
                }
                
                if (allDeals.length > 0) {
                    showToast(`Loaded ${allDeals.length} deal${allDeals.length > 1 ? 's' : ''}`, 'success', 2000);
                }
            } catch (error) {
                console.error('Error processing deals:', error);
                showToast('Error processing deals: ' + error.message, 'error');
                document.getElementById('loading').style.display = 'none';
            }
        });
    } catch (error) {
        console.error('Error loading deals:', error);
        showToast('Error loading deals: ' + error.message, 'error');
        document.getElementById('loading').style.display = 'none';
    }
}

// Update statistics
function updateStats() {
    document.getElementById('stat-total').textContent = formatNumber(allDeals.length);
    document.getElementById('stat-hot').textContent = formatNumber(allDeals.filter(d => d.status === 'hot').length);
    document.getElementById('stat-warm').textContent = formatNumber(allDeals.filter(d => d.status === 'warm').length);
    document.getElementById('stat-cold').textContent = formatNumber(allDeals.filter(d => d.status === 'cold').length);
}

// Apply filters and sorting
function applyFiltersAndSort() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const sortBy = document.getElementById('sort-by').value;
    
    // Filter
    filteredDeals = allDeals.filter(deal => {
        // Search filter
        const matchesSearch = !searchTerm || 
            deal.name.toLowerCase().includes(searchTerm) ||
            deal.url.toLowerCase().includes(searchTerm) ||
            (deal.notes && deal.notes.toLowerCase().includes(searchTerm));
        
        // Status filter
        const matchesStatus = !statusFilter || deal.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });
    
    // Sort
    filteredDeals.sort((a, b) => {
        switch(sortBy) {
            case 'date-desc':
                return new Date(b.savedAt) - new Date(a.savedAt);
            case 'date-asc':
                return new Date(a.savedAt) - new Date(b.savedAt);
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            case 'price-desc':
                return parseNumber(b.inputs.asking) - parseNumber(a.inputs.asking);
            case 'price-asc':
                return parseNumber(a.inputs.asking) - parseNumber(b.inputs.asking);
            case 'ebitda-desc':
                return parseNumber(b.inputs.ebitda) - parseNumber(a.inputs.ebitda);
            case 'ebitda-asc':
                return parseNumber(a.inputs.ebitda) - parseNumber(b.inputs.ebitda);
            case 'score-desc':
                return parseNumber(b.results.qualityScore) - parseNumber(a.results.qualityScore);
            case 'score-asc':
                return parseNumber(a.results.qualityScore) - parseNumber(b.results.qualityScore);
            case 'coc-desc':
                return parseCOC(b.results.cocReturn) - parseCOC(a.results.cocReturn);
            case 'coc-asc':
                return parseCOC(a.results.cocReturn) - parseCOC(b.results.cocReturn);
            default:
                return 0;
        }
    });
    
    currentSort = sortBy;
    
    // Update table header visual indicators
    updateMyDealsSortIndicators(sortBy);
}

// Update sort indicators on My Deals table headers
function updateMyDealsSortIndicators(sortBy) {
    // Parse sort value (e.g., "date-desc" -> column: "date", direction: "desc")
    const [column, direction] = sortBy.split('-');
    
    // Map sort columns to header data-sort attributes
    const columnMap = {
        'date': 'date',
        'name': 'name',
        'status': 'status',
        'price': 'price',
        'ebitda': 'ebitda',
        'score': 'score',
        'coc': 'coc'
    };
    
    // Clear all sort indicators
    document.querySelectorAll('.deals-table th.sortable').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    // Add indicator to active column
    const activeHeader = document.querySelector(`.deals-table th.sortable[data-sort="${columnMap[column]}"]`);
    if (activeHeader) {
        activeHeader.classList.add(`sorted-${direction}`);
    }
}

// Parse number from formatted string
function parseNumber(str) {
    if (!str) return 0;
    return parseFloat(str.toString().replace(/[$,]/g, '')) || 0;
}

// Parse COC return (handles "N/A" and percentages)
function parseCOC(str) {
    if (!str || str === 'N/A') return -Infinity; // Put N/A at the end
    return parseFloat(str.toString().replace(/[%,$]/g, '')) || 0;
}

// Format number with commas
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Math.round(num).toLocaleString();
}

// Live format input as user types (add commas in real-time)
function liveFormatDashboardInput(e) {
    console.log('🔢 Dashboard live formatting:', e.target.id, 'value:', e.target.value);
    
    // Get current value and cursor position
    const input = e.target;
    const cursorPos = input.selectionStart;
    const oldValue = input.value;
    
    // Don't format if empty
    if (!oldValue || oldValue === '$') {
        return;
    }
    
    // Remove all non-digit characters except decimal point and leading $
    let cleanValue = oldValue.replace(/[^\d.$]/g, '');
    
    // Check if this is a currency field (has $ or is calc-purchase-price, calc-ebitda, calc-salary)
    const isCurrencyField = oldValue.includes('$') || 
                           input.id === 'calc-purchase-price' || 
                           input.id === 'calc-ebitda' || 
                           input.id === 'calc-salary' ||
                           input.id === 'manual-price' ||
                           input.id === 'manual-revenue' ||
                           input.id === 'manual-ebitda' ||
                           input.id === 'manual-cashflow' ||
                           input.id === 'buybox-min-price' ||
                           input.id === 'buybox-max-price' ||
                           input.id === 'buybox-min-ebitda' ||
                           input.id === 'buybox-max-ebitda' ||
                           input.id === 'buybox-min-revenue';
    
    // Remove $ from clean value
    cleanValue = cleanValue.replace(/\$/g, '');
    
    // Don't format if no digits
    if (!cleanValue || cleanValue === '.') {
        return;
    }
    
    // Handle multiple decimal points - keep only the first one
    const parts = cleanValue.split('.');
    if (parts.length > 2) {
        cleanValue = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Split into integer and decimal parts
    const [integerPart, decimalPart] = cleanValue.split('.');
    
    // Format integer part with commas
    let formatted = '';
    if (integerPart) {
        const num = parseInt(integerPart, 10);
        if (!isNaN(num)) {
            formatted = num.toLocaleString('en-US');
        }
    }
    
    // Add decimal part if it exists
    if (decimalPart !== undefined) {
        formatted += '.' + decimalPart;
    }
    
    // Add currency symbol for currency fields
    if (isCurrencyField && formatted) {
        formatted = '$' + formatted;
    }
    
    // Only update if value changed and formatted is not empty
    if (formatted && formatted !== oldValue) {
        input.value = formatted;
        
        // Restore cursor position, accounting for added/removed commas and $
        const oldCommas = (oldValue.slice(0, cursorPos).match(/,/g) || []).length;
        const newCommas = (formatted.slice(0, cursorPos).match(/,/g) || []).length;
        const oldDollar = oldValue.slice(0, cursorPos).includes('$') ? 1 : 0;
        const newDollar = formatted.slice(0, cursorPos).includes('$') ? 1 : 0;
        const newCursorPos = cursorPos + (newCommas - oldCommas) + (newDollar - oldDollar);
        input.setSelectionRange(newCursorPos, newCursorPos);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Render deals table
function renderDeals() {
    const tbody = document.getElementById('deals-tbody');
    tbody.innerHTML = '';
    
    if (filteredDeals.length === 0 && allDeals.length > 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px; color: #95a5a6;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                    <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">No deals match your filters</div>
                    <div style="font-size: 14px;">Try adjusting your search or filters</div>
                </td>
            </tr>
        `;
        return;
    }
    
    filteredDeals.forEach(deal => {
        const row = document.createElement('tr');
        if (selectedDeals.has(deal.name)) {
            row.classList.add('selected');
        }
        
        const askingPrice = parseNumber(deal.inputs.asking);
        const ebitda = parseNumber(deal.inputs.ebitda);
        const qualityScore = parseNumber(deal.results.qualityScore);
        const cocReturn = deal.results.cocReturn || 'N/A';
        
        // Quality score class
        let scoreClass = 'fair';
        if (qualityScore >= 80) scoreClass = 'excellent';
        else if (qualityScore >= 60) scoreClass = 'good';
        else if (qualityScore < 40) scoreClass = 'poor';
        
        row.innerHTML = `
            <td>
                <input type="checkbox" class="checkbox deal-checkbox" data-deal="${escapeHtml(deal.name)}" ${selectedDeals.has(deal.name) ? 'checked' : ''}>
            </td>
            <td>
                <div class="deal-name">
                    <div class="deal-name-link" data-deal="${escapeHtml(deal.name)}">${escapeHtml(deal.name)}</div>
                    <div class="deal-url" title="${escapeHtml(deal.url)}">${escapeHtml(deal.url)}</div>
                </div>
            </td>
            <td class="deal-date">${new Date(deal.savedAt).toLocaleDateString()}</td>
            <td>
                <select class="status-select" data-deal="${escapeHtml(deal.name)}">
                    <option value="none" ${deal.status === 'none' ? 'selected' : ''}>-</option>
                    <option value="hot" ${deal.status === 'hot' ? 'selected' : ''}>🔥 Hot</option>
                    <option value="warm" ${deal.status === 'warm' ? 'selected' : ''}>🌡️ Warm</option>
                    <option value="cold" ${deal.status === 'cold' ? 'selected' : ''}>❄️ Cold</option>
                    <option value="pass" ${deal.status === 'pass' ? 'selected' : ''}>❌ Pass</option>
                </select>
            </td>
            <td class="metric">${askingPrice > 0 ? '$' + formatNumber(askingPrice) : 'N/A'}</td>
            <td class="metric">${ebitda > 0 ? '$' + formatNumber(ebitda) : 'N/A'}</td>
            <td>
                <span class="quality-score ${scoreClass}">${qualityScore || '-'}</span>
            </td>
            <td class="metric ${cocReturn.includes('-') ? 'negative' : 'positive'}">${escapeHtml(cocReturn)}</td>
            <td>
                <div class="actions">
                    <button class="action-btn view-deal-btn" data-deal="${escapeHtml(deal.name)}">👁️ View</button>
                    <button class="action-btn" onclick="exportDeal('${escapeHtml(deal.name).replace(/'/g, "\\'")}')">📤 Export</button>
                    <button class="action-btn" onclick="deleteDeal('${escapeHtml(deal.name).replace(/'/g, "\\'")}')">🗑️</button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Add event listeners for checkboxes
    document.querySelectorAll('.deal-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleCheckboxChange);
    });
    
    // Add event listeners for status dropdowns
    document.querySelectorAll('.status-select').forEach(select => {
        select.addEventListener('change', handleStatusChange);
    });
    
    // Add event listeners for deal name clicks
    document.querySelectorAll('.deal-name-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const dealName = e.target.dataset.deal;
            openDealModal(dealName);
        });
    });
    
    // Add event listeners for View buttons
    document.querySelectorAll('.view-deal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const dealName = e.target.dataset.deal;
            openDealModal(dealName);
        });
    });
    
    updateBulkActions();
}

// Handle checkbox change
function handleCheckboxChange(e) {
    const dealName = e.target.dataset.deal;
    if (e.target.checked) {
        selectedDeals.add(dealName);
    } else {
        selectedDeals.delete(dealName);
    }
    updateBulkActions();
    renderDeals();
}

// Handle status change
function handleStatusChange(e) {
    const dealName = e.target.dataset.deal;
    const newStatus = e.target.value;
    
    // Update in memory
    const deal = allDeals.find(d => d.name === dealName);
    if (deal) {
        deal.status = newStatus;
    }
    
    // Save to storage
    saveDeals(allDeals, (success) => {
        if (success) {
            console.log('Deal status updated:', dealName, newStatus);
            updateStats();
            const statusLabels = {
                hot: '🔥 Hot',
                warm: '🌡️ Warm',
                cold: '❄️ Cold',
                pass: '❌ Pass',
                none: 'No Status'
            };
            showToast(`Status updated to ${statusLabels[newStatus] || newStatus}`, 'success', 2000);
        }
    });
}

// Update bulk actions bar
function updateBulkActions() {
    const bulkActions = document.getElementById('bulk-actions');
    const bulkText = document.getElementById('bulk-text');
    const count = selectedDeals.size;
    
    if (count > 0) {
        bulkActions.classList.add('active');
        bulkText.textContent = `${count} deal${count > 1 ? 's' : ''} selected`;
    } else {
        bulkActions.classList.remove('active');
    }
    
    // Update select all checkbox
    const selectAll = document.getElementById('select-all');
    if (count === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
    } else if (count === filteredDeals.length) {
        selectAll.checked = true;
        selectAll.indeterminate = false;
    } else {
        selectAll.checked = false;
        selectAll.indeterminate = true;
    }
}

// Open deal in original listing
function openDeal(dealName) {
    const deal = allDeals.find(d => d.name === dealName);
    if (deal && deal.url) {
        window.open(deal.url, '_blank');
    }
}

// Export single deal
function exportDeal(dealName) {
    const deal = allDeals.find(d => d.name === dealName);
    if (deal) {
        exportDealsToCSV([deal]);
    }
}

// Delete single deal
function deleteDeal(dealName) {
    if (!confirm(`Are you sure you want to delete "${dealName}"?`)) {
        return;
    }
    
    allDeals = allDeals.filter(d => d.name !== dealName);
    selectedDeals.delete(dealName);
    
    saveDeals(allDeals, (success) => {
        if (success) {
            console.log('Deal deleted:', dealName);
            showToast(`Deleted "${dealName}"`, 'success');
            loadDeals();
        }
    });
}

// Bulk delete
function bulkDelete() {
    if (selectedDeals.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedDeals.size} deal(s)?`)) {
        return;
    }
    
    const count = selectedDeals.size;
    allDeals = allDeals.filter(d => !selectedDeals.has(d.name));
    
    saveDeals(allDeals, (success) => {
        if (success) {
            console.log('Bulk delete completed');
            showToast(`Deleted ${count} deal${count > 1 ? 's' : ''}`, 'success');
            selectedDeals.clear();
            loadDeals();
        }
    });
}

// Bulk export
function bulkExport() {
    if (selectedDeals.size === 0) return;
    
    const dealsToExport = allDeals.filter(d => selectedDeals.has(d.name));
    exportDealsToCSV(dealsToExport);
}

// Export all visible deals
function exportAll() {
    if (filteredDeals.length === 0) {
        showToast('No deals to export', 'warning');
        return;
    }
    
    exportDealsToCSV(filteredDeals);
}

// Debounced search function
function debounce(func, wait) {
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(searchTimeout);
            func(...args);
        };
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(later, wait);
    };
}

// Debounced filter function
const debouncedFilter = debounce(() => {
    applyFiltersAndSort();
    renderDeals();
}, 300);

// Export deals to CSV
function exportDealsToCSV(deals) {
    try {
        if (!deals || deals.length === 0) {
            showToast('No deals to export', 'warning');
            return;
        }
        
        const headers = [
            'Deal Name',
            'Status',
            'Saved Date',
            'URL',
            'Asking Price',
            'EBITDA',
            'Quality Score',
            'COC Return',
            'Payback Period',
            'Max Price',
            'Total Debt',
            'FCF Annual',
            'Owner Take-Home',
            'Broker Name',
            'Broker Company',
            'Broker Phone',
            'Broker Email',
            'Latest Progress',
            'Notes'
        ];
        
        const rows = deals.map(deal => [
            (deal.name || '').replace(/"/g, '""'),
            deal.status || 'none',
            deal.savedAt ? new Date(deal.savedAt).toLocaleDateString() : '',
            (deal.url || '').replace(/"/g, '""'),
            deal.inputs?.asking || '',
            deal.inputs?.ebitda || '',
            deal.results?.qualityScore || '',
            deal.results?.cocReturn || '',
            deal.results?.payback || '',
            deal.results?.maxPrice || '',
            deal.results?.totalDebt || '',
            deal.results?.fcfAnnual || '',
            deal.results?.ownerTakeHome || '',
            deal.brokerInfo?.name || '',
            deal.brokerInfo?.company || '',
            deal.brokerInfo?.phone || '',
            deal.brokerInfo?.email || '',
            deal.progressHistory && deal.progressHistory.length > 0 
                ? deal.progressHistory[deal.progressHistory.length - 1].status 
                : '',
            (deal.notes || '').replace(/"/g, '""') // Escape quotes
        ]);
        
        // Create CSV content
        let csv = headers.join(',') + '\n';
        rows.forEach(row => {
            csv += row.map(cell => `"${cell}"`).join(',') + '\n';
        });
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deals-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('Exported', deals.length, 'deals');
        showToast(`Exported ${deals.length} deal${deals.length > 1 ? 's' : ''} to CSV`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error exporting deals: ' + error.message, 'error');
    }
}

// Event Listeners
document.getElementById('search').addEventListener('input', () => {
    debouncedFilter();
});

document.getElementById('filter-status').addEventListener('change', () => {
    applyFiltersAndSort();
    renderDeals();
});

document.getElementById('sort-by').addEventListener('change', () => {
    applyFiltersAndSort();
    renderDeals();
});

document.getElementById('select-all').addEventListener('change', (e) => {
    if (e.target.checked) {
        filteredDeals.forEach(deal => selectedDeals.add(deal.name));
    } else {
        selectedDeals.clear();
    }
    renderDeals();
});

document.getElementById('bulk-delete').addEventListener('click', bulkDelete);
document.getElementById('bulk-export').addEventListener('click', bulkExport);
document.getElementById('bulk-deselect').addEventListener('click', () => {
    selectedDeals.clear();
    renderDeals();
});

document.getElementById('export-btn').addEventListener('click', exportAll);
document.getElementById('refresh-btn').addEventListener('click', () => {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('loading');
    loadDeals();
    setTimeout(() => btn.classList.remove('loading'), 500);
});

// Table header sorting
let currentSortColumn = 'date';
let currentSortDirection = 'desc';

document.querySelectorAll('.deals-table th.sortable').forEach(header => {
    // Explicitly disable dragging on My Deals headers
    header.draggable = false;
    
    header.addEventListener('click', () => {
        const sortType = header.dataset.sort;
        
        // Toggle direction if clicking same column
        if (currentSortColumn === sortType) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // New column - default to descending for numbers, ascending for text
            currentSortColumn = sortType;
            if (sortType === 'name') {
                currentSortDirection = 'asc';
            } else {
                currentSortDirection = 'desc';
            }
        }
        
        // Update dropdown to match
        const sortValue = `${sortType}-${currentSortDirection}`;
        document.getElementById('sort-by').value = sortValue;
        
        // Update visual indicators
        document.querySelectorAll('.deals-table th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
        });
        header.classList.add(`sorted-${currentSortDirection}`);
        
        // Apply sort
        applyFiltersAndSort();
        renderDeals();
    });
});

// ===== DEAL MODAL FUNCTIONALITY =====
let currentModalDeal = null;
let currentScenario = 0;
let scenarios = [{}, {}, {}]; // Store 3 scenarios

// Legacy function for old code that passes deal name as string
function openDealModalLegacy(dealName) {
    console.log('📋 [Legacy] Opening deal modal for:', dealName);
    const deal = allDeals.find(d => d.name === dealName);
    if (!deal) {
        console.error('❌ Deal not found:', dealName);
        return;
    }
    
    currentModalDeal = deal;
    currentScenario = 0;
    
    // Load scenarios from deal or initialize
    scenarios = deal.scenarios || [{}, {}, {}];
    
    // Populate modal
    document.getElementById('modal-deal-name').textContent = deal.name;
    document.getElementById('modal-status').textContent = getStatusText(deal.status || 'none');
    document.getElementById('modal-saved-date').textContent = new Date(deal.savedAt).toLocaleDateString();
    document.getElementById('modal-asking-price').textContent = deal.inputs?.asking ? '$' + formatNumber(parseNumber(deal.inputs.asking)) : 'N/A';
    document.getElementById('modal-ebitda').textContent = deal.inputs?.ebitda ? '$' + formatNumber(parseNumber(deal.inputs.ebitda)) : 'N/A';
    document.getElementById('modal-quality').textContent = deal.results?.qualityScore || '-';
    document.getElementById('modal-coc').textContent = deal.results?.cocReturn || 'N/A';
    document.getElementById('modal-max-price').textContent = deal.results?.maxPrice || 'N/A';
    document.getElementById('modal-total-debt').textContent = deal.results?.totalDebt || 'N/A';
    document.getElementById('modal-fcf').textContent = deal.results?.fcfAnnual || 'N/A';
    document.getElementById('modal-takehome').textContent = deal.results?.ownerTakeHome || 'N/A';
    document.getElementById('modal-payback').textContent = deal.results?.payback || 'N/A';
    document.getElementById('modal-notes').value = deal.notes || '';
    
    const urlLink = document.getElementById('modal-url');
    urlLink.href = deal.url;
    urlLink.textContent = deal.url;
    
    // Load broker information
    const brokerInfo = deal.brokerInfo || {};
    document.getElementById('broker-name').value = brokerInfo.name || '';
    document.getElementById('broker-company').value = brokerInfo.company || '';
    document.getElementById('broker-phone').value = brokerInfo.phone || '';
    document.getElementById('broker-email').value = brokerInfo.email || '';
    
    // Load progress tracking
    loadProgressHistory(deal);
    
    // Load custom statuses into dropdown
    loadCustomStatuses(deal);
    
    // Reset scenario tabs
    document.querySelectorAll('.scenario-tab').forEach((tab, idx) => {
        tab.classList.toggle('active', idx === 0);
    });
    
    // Load scenario 0
    loadScenario(0);
    
    // Show modal
    document.getElementById('deal-modal').style.display = 'flex';
}

function loadScenario(scenarioIndex) {
    currentScenario = scenarioIndex;
    const scenario = scenarios[scenarioIndex];
    
    // Update tab UI
    document.querySelectorAll('.scenario-tab').forEach((tab, idx) => {
        tab.classList.toggle('active', idx === scenarioIndex);
    });
    
    // If scenario exists, populate fields
    if (scenario.purchasePrice) {
        document.getElementById('calc-purchase-price').value = formatCurrency(scenario.purchasePrice);
        document.getElementById('calc-ebitda').value = formatCurrency(scenario.ebitda);
        document.getElementById('calc-sba-pct').value = scenario.sbaPct || 75;
        document.getElementById('calc-buyer-equity-pct').value = scenario.buyerEquityPct || 15;
        document.getElementById('calc-seller-note-pct').value = scenario.sellerNotePct || 10;
        document.getElementById('calc-sba-rate').value = scenario.sbaRate || 11.5;
        document.getElementById('calc-sba-term').value = scenario.sbaTerm || 10;
        document.getElementById('calc-seller-rate').value = scenario.sellerRate || 6.0;
        document.getElementById('calc-seller-term').value = scenario.sellerTerm || 5;
        
        // Display results if they exist
        displayCalculatorResults(scenario.results);
    } else {
        // Load default values from deal
        const askingPrice = currentModalDeal.inputs?.asking ? parseNumber(currentModalDeal.inputs.asking) : 0;
        const ebitda = currentModalDeal.inputs?.ebitda ? parseNumber(currentModalDeal.inputs.ebitda) : 0;
        
        document.getElementById('calc-purchase-price').value = askingPrice > 0 ? formatCurrency(askingPrice) : '';
        document.getElementById('calc-ebitda').value = ebitda > 0 ? formatCurrency(ebitda) : '';
        document.getElementById('calc-sba-pct').value = 75;
        document.getElementById('calc-buyer-equity-pct').value = 15;
        document.getElementById('calc-seller-note-pct').value = 10;
        document.getElementById('calc-sba-rate').value = 11.5;
        document.getElementById('calc-sba-term').value = 10;
        document.getElementById('calc-seller-rate').value = 6.0;
        document.getElementById('calc-seller-term').value = 5;
        
        // Clear results
        displayCalculatorResults(null);
    }
}

function saveCurrentScenario() {
    const purchasePrice = parseNumber(document.getElementById('calc-purchase-price').value);
    const ebitda = parseNumber(document.getElementById('calc-ebitda').value);
    const sbaPct = parseFloat(document.getElementById('calc-sba-pct').value) || 0;
    const buyerEquityPct = parseFloat(document.getElementById('calc-buyer-equity-pct').value) || 0;
    const sellerNotePct = parseFloat(document.getElementById('calc-seller-note-pct').value) || 0;
    const sbaRate = parseFloat(document.getElementById('calc-sba-rate').value) || 0;
    const sbaTerm = parseFloat(document.getElementById('calc-sba-term').value) || 0;
    const sellerRate = parseFloat(document.getElementById('calc-seller-rate').value) || 0;
    const sellerTerm = parseFloat(document.getElementById('calc-seller-term').value) || 0;
    
    // Validate percentages
    const totalPct = sbaPct + buyerEquityPct + sellerNotePct;
    if (Math.abs(totalPct - 100) > 0.01) {
        document.getElementById('percentage-warning').style.display = 'block';
        return null;
    }
    document.getElementById('percentage-warning').style.display = 'none';
    
    // Calculate
    const results = calculateDealStructure(
        purchasePrice,
        ebitda,
        sbaPct,
        buyerEquityPct,
        sellerNotePct,
        sbaRate,
        sbaTerm,
        sellerRate,
        sellerTerm
    );
    
    // Save to scenario
    scenarios[currentScenario] = {
        purchasePrice,
        ebitda,
        sbaPct,
        buyerEquityPct,
        sellerNotePct,
        sbaRate,
        sbaTerm,
        sellerRate,
        sellerTerm,
        results
    };
    
    // Save to deal
    currentModalDeal.scenarios = scenarios;
    
    // Update in allDeals
    const deal = allDeals.find(d => d.name === currentModalDeal.name);
    if (deal) {
        deal.scenarios = scenarios;
    }
    
    // Save to storage
    saveDeals(allDeals, (success) => {
        if (success) {
            showToast(`Scenario ${currentScenario + 1} saved`, 'success', 2000);
        }
    });
    
    return results;
}

function calculateDealStructure(purchasePrice, ebitda, sbaPct, buyerEquityPct, sellerNotePct, sbaRate, sbaTerm, sellerRate, sellerTerm) {
    const sbaAmount = purchasePrice * (sbaPct / 100);
    const buyerEquity = purchasePrice * (buyerEquityPct / 100);
    const sellerNote = purchasePrice * (sellerNotePct / 100);
    
    // Monthly payment calculation
    const sbaMonthlyRate = (sbaRate / 100) / 12;
    const sbaMonths = sbaTerm * 12;
    const sbaPayment = sbaAmount > 0 ? 
        (sbaAmount * sbaMonthlyRate * Math.pow(1 + sbaMonthlyRate, sbaMonths)) / 
        (Math.pow(1 + sbaMonthlyRate, sbaMonths) - 1) : 0;
    
    const sellerMonthlyRate = (sellerRate / 100) / 12;
    const sellerMonths = sellerTerm * 12;
    const sellerPayment = sellerNote > 0 ? 
        (sellerNote * sellerMonthlyRate * Math.pow(1 + sellerMonthlyRate, sellerMonths)) / 
        (Math.pow(1 + sellerMonthlyRate, sellerMonths) - 1) : 0;
    
    const totalDebtService = (sbaPayment + sellerPayment) * 12;
    const annualCashFlow = ebitda - totalDebtService;
    const cocReturn = buyerEquity > 0 ? (annualCashFlow / buyerEquity) * 100 : 0;
    const dscr = totalDebtService > 0 ? ebitda / totalDebtService : 0;
    const payback = buyerEquity > 0 && annualCashFlow > 0 ? buyerEquity / annualCashFlow : 0;
    
    return {
        sbaAmount,
        buyerEquity,
        sellerNote,
        totalDebtService,
        annualCashFlow,
        cocReturn,
        dscr,
        payback
    };
}

function displayCalculatorResults(results) {
    if (!results) {
        document.getElementById('calc-sba-amount').textContent = '-';
        document.getElementById('calc-buyer-equity').textContent = '-';
        document.getElementById('calc-seller-note').textContent = '-';
        document.getElementById('calc-total-debt-service').textContent = '-';
        document.getElementById('calc-annual-cashflow').textContent = '-';
        document.getElementById('calc-coc-return').textContent = '-';
        document.getElementById('calc-dscr').textContent = '-';
        document.getElementById('calc-payback').textContent = '-';
        return;
    }
    
    document.getElementById('calc-sba-amount').textContent = formatCurrency(results.sbaAmount);
    document.getElementById('calc-buyer-equity').textContent = formatCurrency(results.buyerEquity);
    document.getElementById('calc-seller-note').textContent = formatCurrency(results.sellerNote);
    document.getElementById('calc-total-debt-service').textContent = formatCurrency(results.totalDebtService);
    
    const cashflowEl = document.getElementById('calc-annual-cashflow');
    cashflowEl.textContent = formatCurrency(results.annualCashFlow);
    cashflowEl.style.color = results.annualCashFlow >= 0 ? '#27ae60' : '#e74c3c';
    
    const cocEl = document.getElementById('calc-coc-return');
    cocEl.textContent = results.cocReturn.toFixed(1) + '%';
    cocEl.style.color = results.cocReturn >= 0 ? '#27ae60' : '#e74c3c';
    
    const dscrEl = document.getElementById('calc-dscr');
    dscrEl.textContent = results.dscr.toFixed(2);
    dscrEl.style.color = results.dscr >= 1.25 ? '#27ae60' : '#e74c3c';
    
    document.getElementById('calc-payback').textContent = 
        results.payback > 0 ? results.payback.toFixed(1) + ' years' : 'N/A';
}

function formatCurrency(value) {
    if (!value || isNaN(value)) return '$0';
    return '$' + formatNumber(Math.round(value));
}

function getStatusText(status) {
    const statusMap = {
        hot: '🔥 Hot',
        warm: '🌡️ Warm',
        cold: '❄️ Cold',
        pass: '❌ Pass',
        none: 'No Status'
    };
    return statusMap[status] || 'No Status';
}

function closeDealModal() {
    document.getElementById('deal-modal').style.display = 'none';
    currentModalDeal = null;
}

// Modal event listeners
document.getElementById('modal-close').addEventListener('click', closeDealModal);
document.getElementById('modal-close-btn').addEventListener('click', closeDealModal);

// Close modal when clicking outside
document.getElementById('deal-modal').addEventListener('click', (e) => {
    if (e.target.id === 'deal-modal') {
        closeDealModal();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('deal-modal').style.display === 'flex') {
        closeDealModal();
    }
});

// Save notes button
document.getElementById('modal-save-notes').addEventListener('click', () => {
    if (!currentModalDeal) return;
    
    const notes = document.getElementById('modal-notes').value;
    currentModalDeal.notes = notes;
    
    // Update in allDeals
    const deal = allDeals.find(d => d.name === currentModalDeal.name);
    if (deal) {
        deal.notes = notes;
    }
    
    // Save to storage
    saveDeals(allDeals, (success) => {
        if (success) {
            showToast('Notes saved successfully', 'success');
        }
    });
});

// Save broker information
document.getElementById('modal-save-broker').addEventListener('click', () => {
    if (!currentModalDeal) return;
    
    const brokerInfo = {
        name: document.getElementById('broker-name').value,
        company: document.getElementById('broker-company').value,
        phone: document.getElementById('broker-phone').value,
        email: document.getElementById('broker-email').value
    };
    
    currentModalDeal.brokerInfo = brokerInfo;
    
    // Update in allDeals
    const deal = allDeals.find(d => d.name === currentModalDeal.name);
    if (deal) {
        deal.brokerInfo = brokerInfo;
    }
    
    // Save to storage
    saveDeals(allDeals, (success) => {
        if (success) {
            showToast('Broker information saved successfully', 'success');
        }
    });
});

// Load progress history
function loadProgressHistory(deal) {
    const progressList = document.getElementById('progress-history-list');
    const progressHistory = deal.progressHistory || [];
    
    if (progressHistory.length === 0) {
        progressList.innerHTML = '<p style="color: var(--text-secondary); font-size: 12px; text-align: center; padding: 20px;">No progress updates yet</p>';
        return;
    }
    
    // Sort by date, most recent first
    const sortedProgress = [...progressHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    progressList.innerHTML = sortedProgress.map((item, index) => `
        <div class="progress-item">
            <div class="progress-icon">📌</div>
            <div class="progress-content">
                <div class="progress-status">${escapeHtml(item.status)}</div>
                <div class="progress-date">${new Date(item.date).toLocaleString()}</div>
            </div>
            <button class="progress-delete" data-index="${index}" title="Remove">×</button>
        </div>
    `).join('');
    
    // Add event listeners to delete buttons
    progressList.querySelectorAll('.progress-delete').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            deleteProgressItem(index);
        });
    });
}

// Load custom statuses into dropdown
function loadCustomStatuses(deal) {
    const customStatuses = deal.customStatuses || [];
    const dropdown = document.getElementById('deal-progress-status');
    
    // Remove any previously added custom options
    const existingOptions = Array.from(dropdown.options);
    existingOptions.forEach(option => {
        if (option.dataset.custom === 'true') {
            dropdown.removeChild(option);
        }
    });
    
    // Add custom statuses
    customStatuses.forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        option.dataset.custom = 'true';
        dropdown.appendChild(option);
    });
}

// Add progress status
document.getElementById('deal-progress-status').addEventListener('change', (e) => {
    if (!currentModalDeal) return;
    
    const status = e.target.value;
    if (!status) return;
    
    // Initialize progress history if needed
    if (!currentModalDeal.progressHistory) {
        currentModalDeal.progressHistory = [];
    }
    
    // Add new progress item
    currentModalDeal.progressHistory.push({
        status: status,
        date: new Date().toISOString()
    });
    
    // Update in allDeals
    const deal = allDeals.find(d => d.name === currentModalDeal.name);
    if (deal) {
        deal.progressHistory = currentModalDeal.progressHistory;
    }
    
    // Save to storage
    saveDeals(allDeals, (success) => {
        if (success) {
            showToast(`Progress updated: ${status}`, 'success', 2000);
            if (currentModalDeal) queueVettrUpdateDeal(currentModalDeal);
            loadProgressHistory(currentModalDeal);
            // Reset dropdown
            e.target.value = '';
        }
    });
});

// Add custom status
document.getElementById('add-custom-status-btn').addEventListener('click', () => {
    if (!currentModalDeal) return;
    
    const customStatus = document.getElementById('custom-progress-status').value.trim();
    if (!customStatus) {
        showToast('Please enter a custom status', 'warning');
        return;
    }
    
    // Initialize custom statuses if needed
    if (!currentModalDeal.customStatuses) {
        currentModalDeal.customStatuses = [];
    }
    
    // Check if already exists
    if (currentModalDeal.customStatuses.includes(customStatus)) {
        showToast('This custom status already exists', 'warning');
        return;
    }
    
    // Add custom status
    currentModalDeal.customStatuses.push(customStatus);
    
    // Update in allDeals
    const deal = allDeals.find(d => d.name === currentModalDeal.name);
    if (deal) {
        deal.customStatuses = currentModalDeal.customStatuses;
    }
    
    // Save to storage
    saveDeals(allDeals, (success) => {
        if (success) {
            showToast(`Custom status "${customStatus}" added`, 'success');
            loadCustomStatuses(currentModalDeal);
            document.getElementById('custom-progress-status').value = '';
        }
    });
});

// Delete progress item
function deleteProgressItem(index) {
    console.log('🗑️ Deleting progress item at index:', index);
    if (!currentModalDeal) {
        console.error('No currentModalDeal available');
        return;
    }
    
    const progressHistory = currentModalDeal.progressHistory || [];
    console.log('Progress history before delete:', progressHistory.length, 'items');
    
    // Sort to get the same order as displayed
    const sortedProgress = [...progressHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    const itemToDelete = sortedProgress[index];
    console.log('Item to delete:', itemToDelete);
    
    // Find and remove from original array
    const originalIndex = progressHistory.findIndex(item => 
        item.status === itemToDelete.status && item.date === itemToDelete.date
    );
    console.log('Original index in unsorted array:', originalIndex);
    
    if (originalIndex > -1) {
        progressHistory.splice(originalIndex, 1);
        currentModalDeal.progressHistory = progressHistory;
        console.log('Progress history after delete:', progressHistory.length, 'items');
        
        // Update in savedDeals storage directly
        chrome.storage.local.get(['savedDeals'], (result) => {
            const savedDeals = result.savedDeals || [];
            const dealIndex = savedDeals.findIndex(d => d.name === currentModalDeal.name);
            
            if (dealIndex > -1) {
                savedDeals[dealIndex].progressHistory = progressHistory;
                
                chrome.storage.local.set({ savedDeals }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving:', chrome.runtime.lastError);
                        showToast('Failed to remove progress item', 'error');
                    } else {
                        console.log('✅ Progress item removed and saved');
                        showToast('Progress item removed', 'success', 2000);
                        loadProgressHistory(currentModalDeal);
                    }
                });
            } else {
                console.error('Deal not found in savedDeals:', currentModalDeal.name);
            }
        });
    } else {
        console.error('Could not find item to delete');
    }
}

// Modal export button
document.getElementById('modal-export-btn').addEventListener('click', () => {
    if (currentModalDeal) {
        exportDeal(currentModalDeal.name);
    }
});

// Modal delete button
document.getElementById('modal-delete-btn').addEventListener('click', () => {
    if (currentModalDeal) {
        closeDealModal();
        deleteDeal(currentModalDeal.name);
    }
});

// Scenario tab switching
document.querySelectorAll('.scenario-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const scenarioIndex = parseInt(e.target.dataset.scenario);
        loadScenario(scenarioIndex);
    });
});

// Show comparison view
document.getElementById('compare-scenarios-btn').addEventListener('click', () => {
    showComparisonView();
});

// Close comparison view
document.getElementById('close-comparison-btn').addEventListener('click', () => {
    document.getElementById('scenario-comparison').style.display = 'none';
    document.querySelector('.calculator-section').parentElement.style.display = 'block';
    document.querySelector('.modal-content').classList.remove('wide');
});

function showComparisonView() {
    // Hide calculator
    document.querySelector('.calculator-section').parentElement.style.display = 'none';
    
    // Show comparison
    document.getElementById('scenario-comparison').style.display = 'block';
    
    // Make modal wide
    document.querySelector('.modal-content').classList.add('wide');
    
    // Populate comparison
    populateComparison();
}

function populateComparison() {
    const validScenarios = [];
    
    for (let i = 0; i < 3; i++) {
        const scenario = scenarios[i];
        const cardId = `scenario-card-${i + 1}`;
        const card = document.getElementById(cardId);
        
        if (scenario.purchasePrice && scenario.results) {
            // Populate inputs
            card.querySelector('[data-field="purchasePrice"]').textContent = formatCurrency(scenario.purchasePrice);
            card.querySelector('[data-field="ebitda"]').textContent = formatCurrency(scenario.ebitda);
            card.querySelectorAll('[data-field="sbaPct"]')[0].textContent = scenario.sbaPct + '%';
            card.querySelectorAll('[data-field="buyerEquityPct"]')[0].textContent = scenario.buyerEquityPct + '%';
            card.querySelectorAll('[data-field="sellerNotePct"]')[0].textContent = scenario.sellerNotePct + '%';
            card.querySelector('[data-field="sbaRate"]').textContent = scenario.sbaRate + '%';
            card.querySelector('[data-field="sellerRate"]').textContent = scenario.sellerRate + '%';
            
            // Populate results
            const r = scenario.results;
            card.querySelector('[data-field="sbaAmount"]').textContent = formatCurrency(r.sbaAmount);
            card.querySelectorAll('[data-field="buyerEquity"]')[0].textContent = formatCurrency(r.buyerEquity);
            card.querySelector('[data-field="sellerNote"]').textContent = formatCurrency(r.sellerNote);
            card.querySelector('[data-field="totalDebtService"]').textContent = formatCurrency(r.totalDebtService);
            
            const cashflowCell = card.querySelector('[data-field="annualCashFlow"]');
            cashflowCell.textContent = formatCurrency(r.annualCashFlow);
            cashflowCell.style.color = r.annualCashFlow >= 0 ? '#27ae60' : '#e74c3c';
            
            const cocCell = card.querySelector('[data-field="cocReturn"]');
            cocCell.textContent = r.cocReturn.toFixed(1) + '%';
            cocCell.style.color = r.cocReturn >= 0 ? '#27ae60' : '#e74c3c';
            
            const dscrCell = card.querySelector('[data-field="dscr"]');
            dscrCell.textContent = r.dscr.toFixed(2);
            dscrCell.style.color = r.dscr >= 1.25 ? '#27ae60' : '#e74c3c';
            
            card.querySelector('[data-field="payback"]').textContent = 
                r.payback > 0 ? r.payback.toFixed(1) + ' yrs' : 'N/A';
            
            validScenarios.push({ index: i, scenario, results: r });
        } else {
            // Empty scenario - clear all values
            card.querySelectorAll('.scenario-value').forEach(cell => {
                cell.textContent = '-';
                cell.style.color = '';
            });
        }
    }
    
    // Find best scenario
    if (validScenarios.length > 0) {
        findBestScenario(validScenarios);
    } else {
        document.getElementById('best-scenario-summary').innerHTML = 
            '<p>Calculate scenarios to see recommendations</p>';
    }
}

function findBestScenario(validScenarios) {
    // Clear previous best indicators
    document.querySelectorAll('.scenario-card').forEach(card => {
        card.classList.remove('best-overall');
        card.querySelector('.best-badge').style.display = 'none';
    });
    
    // Find best by different metrics
    let bestCOC = validScenarios[0];
    let bestDSCR = validScenarios[0];
    let bestCashFlow = validScenarios[0];
    let lowestEquity = validScenarios[0];
    
    validScenarios.forEach(s => {
        if (s.results.cocReturn > bestCOC.results.cocReturn) bestCOC = s;
        if (s.results.dscr > bestDSCR.results.dscr) bestDSCR = s;
        if (s.results.annualCashFlow > bestCashFlow.results.annualCashFlow) bestCashFlow = s;
        if (s.results.buyerEquity < lowestEquity.results.buyerEquity) lowestEquity = s;
    });
    
    // Overall recommendation (weighted scoring)
    const scores = validScenarios.map(s => {
        const cocScore = s.results.cocReturn >= 0 ? s.results.cocReturn : 0;
        const dscrScore = s.results.dscr >= 1.25 ? s.results.dscr * 10 : 0;
        const cashflowScore = s.results.annualCashFlow >= 0 ? (s.results.annualCashFlow / 10000) : 0;
        return {
            index: s.index,
            total: cocScore * 2 + dscrScore * 1.5 + cashflowScore
        };
    });
    
    scores.sort((a, b) => b.total - a.total);
    const bestOverall = scores[0].index;
    
    // Highlight best overall card
    const bestCard = document.getElementById(`scenario-card-${bestOverall + 1}`);
    bestCard.classList.add('best-overall');
    bestCard.querySelector('.best-badge').style.display = 'inline-block';
    
    // Display summary
    const summary = document.getElementById('best-scenario-summary');
    summary.innerHTML = `
        <p><strong>🏆 Recommended: Scenario ${bestOverall + 1}</strong> - Best overall based on weighted analysis</p>
        <p>• <strong>Highest COC Return:</strong> Scenario ${bestCOC.index + 1} at ${bestCOC.results.cocReturn.toFixed(1)}%</p>
        <p>• <strong>Best DSCR:</strong> Scenario ${bestDSCR.index + 1} at ${bestDSCR.results.dscr.toFixed(2)}x</p>
        <p>• <strong>Highest Cash Flow:</strong> Scenario ${bestCashFlow.index + 1} at ${formatCurrency(bestCashFlow.results.annualCashFlow)}/year</p>
        <p>• <strong>Lowest Equity Required:</strong> Scenario ${lowestEquity.index + 1} at ${formatCurrency(lowestEquity.results.buyerEquity)}</p>
    `;
}

// Calculator recalculate button
document.getElementById('calc-recalculate-btn').addEventListener('click', () => {
    const results = saveCurrentScenario();
    if (results) {
        displayCalculatorResults(results);
    }
});

// Auto-validate percentages
['calc-sba-pct', 'calc-buyer-equity-pct', 'calc-seller-note-pct'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        const sbaPct = parseFloat(document.getElementById('calc-sba-pct').value) || 0;
        const buyerEquityPct = parseFloat(document.getElementById('calc-buyer-equity-pct').value) || 0;
        const sellerNotePct = parseFloat(document.getElementById('calc-seller-note-pct').value) || 0;
        const total = sbaPct + buyerEquityPct + sellerNotePct;
        
        const warning = document.getElementById('percentage-warning');
        if (Math.abs(total - 100) > 0.01) {
            warning.style.display = 'block';
            warning.textContent = `⚠️ Percentages total ${total.toFixed(1)}% (must be 100%)`;
        } else {
            warning.style.display = 'none';
        }
    });
});

// ===== SHARE FUNCTIONALITY =====
let shareModalDeal = null;
let shareText = '';

// Open share modal
document.getElementById('modal-share-btn').addEventListener('click', () => {
    if (!currentModalDeal) return;
    
    shareModalDeal = currentModalDeal;
    shareText = generateShareText();
    
    // Show preview
    document.getElementById('share-preview-text').textContent = shareText;
    
    // Hide SMS phone section (in case it was visible before)
    document.getElementById('sms-phone-section').style.display = 'none';
    
    // Show share modal
    document.getElementById('share-modal').style.display = 'flex';
});

// Close share modal
document.getElementById('share-modal-close').addEventListener('click', () => {
    document.getElementById('share-modal').style.display = 'none';
    document.getElementById('sms-phone-section').style.display = 'none';
});

// Close share modal when clicking outside
document.getElementById('share-modal').addEventListener('click', (e) => {
    if (e.target.id === 'share-modal') {
        document.getElementById('share-modal').style.display = 'none';
        document.getElementById('sms-phone-section').style.display = 'none';
    }
});

// Generate comprehensive share text
function generateShareText() {
    if (!shareModalDeal) return '';
    
    const deal = shareModalDeal;
    let text = '';
    
    // Header
    text += `📊 DEAL ANALYSIS: ${deal.name}\n`;
    text += `${'='.repeat(50)}\n\n`;
    
    // Overview
    text += `📍 OVERVIEW\n`;
    text += `Status: ${getStatusText(deal.status || 'none')}\n`;
    text += `Saved: ${new Date(deal.savedAt).toLocaleDateString()}\n`;
    text += `Quality Score: ${deal.results?.qualityScore || 'N/A'}/100\n`;
    text += `Link: ${deal.url}\n\n`;
    
    // Financial Highlights
    text += `💰 FINANCIAL HIGHLIGHTS\n`;
    text += `Asking Price: ${deal.inputs?.asking || 'N/A'}\n`;
    text += `EBITDA: ${deal.inputs?.ebitda || 'N/A'}\n`;
    text += `Max Price: ${deal.results?.maxPrice || 'N/A'}\n`;
    text += `COC Return: ${deal.results?.cocReturn || 'N/A'}\n`;
    text += `Total Debt: ${deal.results?.totalDebt || 'N/A'}\n`;
    text += `FCF Annual: ${deal.results?.fcfAnnual || 'N/A'}\n`;
    text += `Owner Take-Home: ${deal.results?.ownerTakeHome || 'N/A'}\n`;
    text += `Payback Period: ${deal.results?.payback || 'N/A'}\n\n`;
    
    // Broker Information
    if (deal.brokerInfo && (deal.brokerInfo.name || deal.brokerInfo.company || deal.brokerInfo.phone || deal.brokerInfo.email)) {
        text += `👔 BROKER CONTACT\n`;
        if (deal.brokerInfo.name) text += `Name: ${deal.brokerInfo.name}\n`;
        if (deal.brokerInfo.company) text += `Company: ${deal.brokerInfo.company}\n`;
        if (deal.brokerInfo.phone) text += `Phone: ${deal.brokerInfo.phone}\n`;
        if (deal.brokerInfo.email) text += `Email: ${deal.brokerInfo.email}\n`;
        text += `\n`;
    }
    
    // Deal Progress
    if (deal.progressHistory && deal.progressHistory.length > 0) {
        text += `📋 DEAL PROGRESS\n`;
        const sortedProgress = [...deal.progressHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedProgress.slice(0, 5).forEach(item => {
            text += `• ${item.status} (${new Date(item.date).toLocaleDateString()})\n`;
        });
        text += `\n`;
    }
    
    // Scenarios (if calculated)
    const validScenarios = scenarios.filter(s => s.purchasePrice && s.results);
    if (validScenarios.length > 0) {
        text += `🎯 DEAL STRUCTURE SCENARIOS\n`;
        text += `${'='.repeat(50)}\n\n`;
        
        validScenarios.forEach((scenario, idx) => {
            text += `SCENARIO ${idx + 1}\n`;
            text += `${'-'.repeat(30)}\n`;
            text += `Purchase Price: ${formatCurrency(scenario.purchasePrice)}\n`;
            text += `EBITDA/SDE: ${formatCurrency(scenario.ebitda)}\n`;
            text += `\n`;
            text += `Structure:\n`;
            text += `  SBA Loan: ${scenario.sbaPct}% (${formatCurrency(scenario.results.sbaAmount)})\n`;
            text += `  Buyer Equity: ${scenario.buyerEquityPct}% (${formatCurrency(scenario.results.buyerEquity)})\n`;
            text += `  Seller Note: ${scenario.sellerNotePct}% (${formatCurrency(scenario.results.sellerNote)})\n`;
            text += `\n`;
            text += `Terms:\n`;
            text += `  SBA Rate: ${scenario.sbaRate}% for ${scenario.sbaTerm} years\n`;
            text += `  Seller Rate: ${scenario.sellerRate}% for ${scenario.sellerTerm} years\n`;
            text += `\n`;
            text += `Results:\n`;
            text += `  Total Debt Service: ${formatCurrency(scenario.results.totalDebtService)}/year\n`;
            text += `  Annual Cash Flow: ${formatCurrency(scenario.results.annualCashFlow)}\n`;
            text += `  COC Return: ${scenario.results.cocReturn.toFixed(1)}%\n`;
            text += `  DSCR: ${scenario.results.dscr.toFixed(2)}x\n`;
            text += `  Payback Period: ${scenario.results.payback > 0 ? scenario.results.payback.toFixed(1) + ' years' : 'N/A'}\n`;
            text += `\n`;
        });
        
        // Recommendation
        if (validScenarios.length > 1) {
            const scores = validScenarios.map((s, idx) => {
                const cocScore = s.results.cocReturn >= 0 ? s.results.cocReturn : 0;
                const dscrScore = s.results.dscr >= 1.25 ? s.results.dscr * 10 : 0;
                const cashflowScore = s.results.annualCashFlow >= 0 ? (s.results.annualCashFlow / 10000) : 0;
                return {
                    index: idx,
                    total: cocScore * 2 + dscrScore * 1.5 + cashflowScore
                };
            });
            scores.sort((a, b) => b.total - a.total);
            const bestIdx = scores[0].index;
            
            text += `🏆 RECOMMENDED: Scenario ${bestIdx + 1}\n`;
            text += `Based on weighted analysis of COC return, DSCR, and cash flow.\n\n`;
        }
    }
    
    // Notes
    if (deal.notes) {
        text += `📝 NOTES\n`;
        text += `${deal.notes}\n\n`;
    }
    
    // Footer
    text += `${'='.repeat(50)}\n`;
    text += `Generated by Vettr\n`;
    text += `${new Date().toLocaleString()}\n`;
    
    return text;
}

// Email share
document.getElementById('share-email').addEventListener('click', () => {
    if (!shareText) return;
    
    const subject = encodeURIComponent(`Deal Analysis: ${shareModalDeal.name}`);
    const body = encodeURIComponent(shareText);
    const mailtoLink = `mailto:?subject=${subject}&body=${body}`;
    
    // Open email client
    window.location.href = mailtoLink;
    
    showToast('Opening email client...', 'success', 2000);
});

// SMS share
document.getElementById('share-sms').addEventListener('click', () => {
    if (!shareText) return;
    
    // Show phone number input section
    const smsSection = document.getElementById('sms-phone-section');
    smsSection.style.display = 'block';
    
    // Load last used phone number
    chrome.storage.local.get(['lastSMSNumber'], (result) => {
        if (result.lastSMSNumber) {
            document.getElementById('sms-phone-number').value = result.lastSMSNumber;
            console.log('Loaded last SMS number:', result.lastSMSNumber);
        }
    });
    
    // Focus on phone input
    document.getElementById('sms-phone-number').focus();
});

// SMS send button
document.getElementById('sms-send-btn').addEventListener('click', () => {
    sendSMS();
});

// Allow Enter key to send SMS
document.getElementById('sms-phone-number').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendSMS();
    }
});

// Send SMS function
function sendSMS() {
    if (!shareText || !shareModalDeal) return;
    
    const phoneNumber = document.getElementById('sms-phone-number').value.trim();
    
    if (!phoneNumber) {
        showToast('Please enter a phone number', 'warning');
        return;
    }
    
    // Save phone number for next time
    chrome.storage.local.set({ lastSMSNumber: phoneNumber }, () => {
        console.log('Saved SMS number:', phoneNumber);
    });
    
    // SMS has character limits, so create a shorter version
    const shortText = `Deal: ${shareModalDeal.name}\nAsking: ${shareModalDeal.inputs?.asking || 'N/A'}\nEBITDA: ${shareModalDeal.inputs?.ebitda || 'N/A'}\nQuality: ${shareModalDeal.results?.qualityScore || 'N/A'}/100\nLink: ${shareModalDeal.url}`;
    
    const body = encodeURIComponent(shortText);
    const smsLink = `sms:${phoneNumber}?&body=${body}`;
    
    // Open SMS app
    window.location.href = smsLink;
    
    showToast('Opening messages app...', 'success', 2000);
    
    // Hide phone section and close modal after a delay
    setTimeout(() => {
        document.getElementById('sms-phone-section').style.display = 'none';
        document.getElementById('share-modal').style.display = 'none';
    }, 500);
}

// Copy to clipboard
document.getElementById('share-copy').addEventListener('click', async () => {
    if (!shareText) return;
    
    try {
        await navigator.clipboard.writeText(shareText);
        showToast('Deal analysis copied to clipboard!', 'success');
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = shareText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast('Deal analysis copied to clipboard!', 'success');
        } catch (e) {
            showToast('Failed to copy to clipboard', 'error');
        }
        document.body.removeChild(textarea);
    }
});

// Native share (includes AirDrop on iOS/macOS)
document.getElementById('share-native').addEventListener('click', async () => {
    if (!shareText) return;
    
    // Check if Web Share API is available
    if (navigator.share) {
        try {
            await navigator.share({
                title: `Deal Analysis: ${shareModalDeal.name}`,
                text: shareText,
                url: shareModalDeal.url
            });
            showToast('Shared successfully!', 'success');
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Share failed:', err);
                showToast('Share cancelled or failed', 'warning');
            }
        }
    } else {
        // Fallback: copy to clipboard if Web Share API not available
        try {
            await navigator.clipboard.writeText(shareText);
            showToast('Web Share not available. Copied to clipboard instead!', 'info');
        } catch (e) {
            showToast('Sharing not supported on this device. Try Copy Link instead.', 'warning');
        }
    }
});

// ====== FONT SIZE MANAGEMENT ======
function applyFontSize(fontSize) {
    console.log('🔤 Applying font size:', fontSize + '%');
    document.body.style.fontSize = fontSize + '%';
}

function updateFontSizePreview(fontSize) {
    const previewFontSize = (fontSize / 100) * 12; // Base font size is 12px
    document.documentElement.style.setProperty('--preview-font-size', previewFontSize + 'px');
}

// Load font size on page load
(function loadFontSize() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['fontSize'], (result) => {
            const fontSize = result.fontSize || 100;
            console.log('🔤 Loading saved font size:', fontSize + '%');
            applyFontSize(fontSize);
        });
    }
})();

// ====== AUTO-REFRESH SETTINGS ======
function initializeAutoRefreshSettings() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsModalClose = document.getElementById('settings-modal-close');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const testNotificationBtn = document.getElementById('test-notification-btn');
    
    const autoRefreshCheckbox = document.getElementById('auto-refresh-enabled');
    const refreshIntervalSelect = document.getElementById('refresh-interval');
    const notifyNewDealsCheckbox = document.getElementById('notify-new-deals');
    const refreshIntervalRow = document.getElementById('refresh-interval-row');
    
    // Font size controls
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeDisplay = document.getElementById('font-size-display');
    
    // Open settings modal
    if (settingsBtn) {
        settingsBtn.addEventListener('click', async () => {
            console.log('⚙️ Opening auto-refresh settings...');
            
            // Load current settings
            const settings = await chrome.storage.local.get([
                'autoRefreshEnabled',
                'refreshInterval',
                'notifyNewDeals',
                'lastRefreshTime',
                'aggregatedDealsPool',
                'fontSize'
            ]);
            
            // Populate form
            autoRefreshCheckbox.checked = settings.autoRefreshEnabled !== false;
            refreshIntervalSelect.value = settings.refreshInterval || 60;
            notifyNewDealsCheckbox.checked = settings.notifyNewDeals !== false;
            refreshIntervalRow.style.display = autoRefreshCheckbox.checked ? 'block' : 'none';
            
            // Populate font size
            const fontSize = settings.fontSize || 100;
            if (fontSizeSlider) {
                fontSizeSlider.value = fontSize;
                if (fontSizeDisplay) {
                    fontSizeDisplay.textContent = fontSize + '%';
                }
                updateFontSizePreview(fontSize);
            }
            
            // Update last refresh time
            if (settings.lastRefreshTime) {
                const lastRefresh = new Date(settings.lastRefreshTime);
                document.getElementById('last-refresh-time').textContent = lastRefresh.toLocaleString();
                
                // Calculate next refresh
                const intervalMs = (settings.refreshInterval || 60) * 60 * 1000;
                const nextRefresh = new Date(settings.lastRefreshTime + intervalMs);
                document.getElementById('next-refresh-time').textContent = nextRefresh.toLocaleString();
            } else {
                document.getElementById('last-refresh-time').textContent = 'Never';
                document.getElementById('next-refresh-time').textContent = '-';
            }
            
            // Update stats
            const deals = settings.aggregatedDealsPool || [];
            document.getElementById('total-deals-stat').textContent = formatNumber(deals.length);
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
            const newToday = deals.filter(d => d.discoveredAt > oneDayAgo).length;
            document.getElementById('new-deals-stat').textContent = formatNumber(newToday);
            
            settingsModal.style.display = 'flex';
        });
    }
    
    // Font size slider change
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', () => {
            const fontSize = parseInt(fontSizeSlider.value);
            if (fontSizeDisplay) {
                fontSizeDisplay.textContent = fontSize + '%';
            }
            updateFontSizePreview(fontSize);
        });
    }
    
    // Toggle interval visibility
    if (autoRefreshCheckbox) {
        autoRefreshCheckbox.addEventListener('change', () => {
            refreshIntervalRow.style.display = autoRefreshCheckbox.checked ? 'block' : 'none';
        });
    }
    
    // Close modal
    if (settingsModalClose) {
        settingsModalClose.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }
    
    // Close on outside click
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.style.display = 'none';
            }
        });
    }
    
    // Save settings
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            const fontSize = fontSizeSlider ? parseInt(fontSizeSlider.value) : 100;
            
            const settings = {
                autoRefreshEnabled: autoRefreshCheckbox.checked,
                refreshInterval: parseInt(refreshIntervalSelect.value),
                notifyNewDeals: notifyNewDealsCheckbox.checked,
                fontSize: fontSize
            };
            
            console.log('💾 Saving auto-refresh settings:', settings);
            
            await chrome.storage.local.set(settings);
            
            // Apply font size immediately
            applyFontSize(fontSize);
            
            showToast('Settings saved! Auto-refresh is now ' + (settings.autoRefreshEnabled ? 'enabled' : 'disabled'), 'success');
            settingsModal.style.display = 'none';
        });
    }
    
    // Test notification
    if (testNotificationBtn) {
        testNotificationBtn.addEventListener('click', async () => {
            console.log('🔔 Testing notification...');
            
            // Request notification permission if needed
            if (Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    showToast('Notification permission denied', 'error');
                    return;
                }
            }
            
            // Send test notification via background script
            chrome.runtime.sendMessage({
                action: 'testNotification'
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to send test notification:', chrome.runtime.lastError);
                    showToast('Test notification failed', 'error');
                } else {
                    showToast('Test notification sent!', 'success');
                }
            });
        });
    }
}

// Listen for background refresh messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'VETTR_DEALS_REFRESH') {
        console.log('☁️ My Deals refresh from sync');
        loadMyDeals();
        refreshVettrAccountBar();
        sendResponse({ ok: true });
        return true;
    }
    if (message.action === 'backgroundRefresh') {
        console.log('🔄 Background refresh triggered at', new Date(message.timestamp).toLocaleTimeString());
        
        // Reload deals if on aggregator tab
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'aggregator') {
            console.log('📥 Reloading aggregated deals...');
            loadAggregatorDeals();
        }
        
        sendResponse({ success: true });
    }
});

// Initialize
loadDeals();
initializeAutoRefreshSettings();

// ===== VETTR ACCOUNT SYNC =====
let vettrNotesSyncTimer = null;
let vettrFullSyncTimer = null;
let vettrPollTimer = null;
let vettrAccountController = null;

function vettrRuntimeMessage(msg) {
    return new Promise((resolve) => {
        if (!chrome?.runtime?.sendMessage) {
            resolve({ ok: false, error: 'Extension runtime unavailable' });
            return;
        }
        chrome.runtime.sendMessage(msg, (res) => {
            if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
                return;
            }
            resolve(res || { ok: false });
        });
    });
}

function isVettrLinkedQuick() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['vettrAuthToken'], (r) => resolve(Boolean(r.vettrAuthToken)));
    });
}

function buildVettrPostBody(deal, ctx) {
    if (!deal || typeof VettrCloudSync === 'undefined') return null;
    if (ctx?.manual) return VettrCloudSync.buildManualDealRequest(ctx.manual);
    if (ctx?.aggregator) return VettrCloudSync.buildAggregatorSavedDealRequest(ctx.aggregator);
    return VettrCloudSync.buildDashboardSavedDealRequest(deal);
}

async function queueVettrPostDeal(deal, ctx) {
    const linked = await isVettrLinkedQuick();
    const body = buildVettrPostBody(deal, ctx);
    if (!body) return;
    if (!linked) {
        showToast('Saved on this device. Sign in to sync with Vettr.', 'info', 4000);
        return;
    }
    const res = await vettrRuntimeMessage({ type: 'VETTR_SYNC_DEAL', body });
    if (res?.sessionExpired) {
        refreshVettrAccountBar();
        showToast('Session expired. Sign in again.', 'warning');
        return;
    }
    if (!res?.ok) {
        console.warn('☁️ Vettr sync failed:', res?.error);
        showToast('Saved on this device. We\'ll sync when you\'re back online.', 'warning', 4000);
        return;
    }
    if (res.result && deal) {
        VettrCloudSync.applySaveResponse(deal, res.result);
        if (!deal.dealId) deal.dealId = body.dealId;
    }
}

async function queueVettrUpdateDeal(deal) {
    if (!deal) return;
    const linked = await isVettrLinkedQuick();
    if (!linked) return;
    if (!deal.vettrId) {
        return queueVettrPostDeal(deal);
    }
    const body = typeof VettrCloudSync !== 'undefined' ? VettrCloudSync.buildUpdateRequest(deal) : { notes: deal.notes, status: deal.status };
    const res = await vettrRuntimeMessage({ type: 'VETTR_UPDATE_DEAL', vettrId: deal.vettrId, body });
    if (res?.sessionExpired) refreshVettrAccountBar();
    else if (!res?.ok) console.warn('☁️ Vettr update failed:', res?.error);
}

function queueVettrDeleteDeal(deal) {
    if (!deal?.vettrId) return;
    vettrRuntimeMessage({ type: 'VETTR_DELETE_DEAL', vettrId: deal.vettrId }).then((res) => {
        if (res?.sessionExpired) refreshVettrAccountBar();
    });
}

function queueVettrUpdateDealDebounced(deal) {
    clearTimeout(vettrNotesSyncTimer);
    vettrNotesSyncTimer = setTimeout(() => queueVettrUpdateDeal(deal), 1000);
}

function maybeVettrFullSync() {
    clearTimeout(vettrFullSyncTimer);
    vettrFullSyncTimer = setTimeout(async () => {
        const linked = await isVettrLinkedQuick();
        if (!linked) return;
        const res = await vettrRuntimeMessage({ type: 'VETTR_FULL_SYNC' });
        if (res?.ok) {
            await loadMyDeals();
        } else if (res?.sessionExpired) {
            refreshVettrAccountBar();
        }
    }, 500);
}

function startVettrMyDealsPoll() {
    stopVettrMyDealsPoll();
    vettrPollTimer = setInterval(async () => {
        if (currentTab !== 'my-deals') return;
        const linked = await isVettrLinkedQuick();
        if (!linked) return;
        await vettrRuntimeMessage({ type: 'VETTR_FULL_SYNC' });
    }, 15000);
}

function stopVettrMyDealsPoll() {
    if (vettrPollTimer) {
        clearInterval(vettrPollTimer);
        vettrPollTimer = null;
    }
}

function refreshVettrAccountBar() {
    if (vettrAccountController?.refresh) vettrAccountController.refresh();
}

function initVettrAccountBar() {
    const root = document.querySelector('[data-vettr-account-root]');
    if (!root || typeof VettrAccountUI === 'undefined') return;
    vettrAccountController = VettrAccountUI.bindAccountForm(root, {
        onSignedIn: () => {
            showToast('Syncing your deals…', 'info', 2500);
            // Full sync runs inside VettrAccountUI after login; poll storage for refresh
            setTimeout(() => {
                loadMyDeals();
                refreshVettrAccountBar();
                showToast('All set — your deals are synced', 'success', 3500);
            }, 2500);
        },
        onSignedOut: () => showToast('Signed out of Vettr', 'info', 2500)
    });
}

if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.savedDeals || changes.vettrLastSyncAt) {
            if (currentTab === 'my-deals') {
                loadMyDeals();
            } else {
                loadMyDealsCount();
            }
        }
    });
}

