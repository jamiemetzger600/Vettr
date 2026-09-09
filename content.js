// --- VERSION ---
// Version is now managed centrally in version.js
// We access it here but store in a local variable scoped to this file
// Using an immediately-invoked function expression to avoid global conflicts
const getVersion = () => `v${window.EXTENSION_VERSION || '3.0.0'}`;
const EXT_VERSION = getVersion();

// Global error handler to catch any unhandled errors
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  // Prevent error from bubbling and causing extension issues
  event.preventDefault();
});

// Global promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Prevent error from bubbling
  event.preventDefault();
});

// --- 1. HTML UI TEMPLATE ---
const uiHTML = `
<div id="deal-analyzer-container">
  <div id="deal-analyzer-header">
    Vettr <span style="font-size:calc(11px * var(--font-scale)); opacity:0.8; font-weight:400;">${EXT_VERSION}</span>
    <div class="da-header-icons">
      <span id="da-save-deal-btn" class="da-header-icon" title="Save current deal (Cmd/Ctrl+S)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span>
      <span id="da-dashboard-btn" class="da-header-icon" title="Open Deals Dashboard"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
      <span id="da-coffee-btn" class="da-header-icon" title="Buy me a coffee ☕ ($10)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg></span>
      <span id="da-settings-btn" class="da-header-icon" title="Settings"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
      <span id="da-close" class="da-header-icon da-header-icon-close" title="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
    </div>
  </div>

  <!-- Deal Quality Score Banner -->
  <div id="da-quality-banner" style="background:var(--bg-secondary); border-bottom:2px solid var(--border-light); padding:8px 15px; display:flex; justify-content:space-between; align-items:center;">
    <div style="display:flex; align-items:center; gap:10px;">
      <div id="da-quality-badge" style="font-size:calc(20px * var(--font-scale));">📊</div>
      <div>
        <div style="font-size:calc(11px * var(--font-scale)); color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; font-weight:600;">Deal Quality</div>
        <div id="da-quality-text" style="font-size:calc(14px * var(--font-scale)); font-weight:700; color:var(--text-primary);">Analyzing...</div>
      </div>
    </div>
    <div id="da-quality-score" style="font-size:calc(28px * var(--font-scale)); font-weight:700; color:var(--text-secondary);">--</div>
  </div>

  <div class="da-section">
    <div class="da-flex-row">
      <div style="flex:1">
        <label class="da-label">Business EBITDA</label>
        <input type="text" id="da-ebitda" class="da-input" placeholder="0">
      </div>
      <div style="flex:1">
        <label class="da-label">Asking Price</label>
        <input type="text" id="da-asking" class="da-input" placeholder="0">
      </div>
    </div>
    <div id="da-sde-warning" class="da-warning">⚠️ SDE detected. We subtracted $200k for Owner Salary.</div>
  </div>

  <div class="da-section">
    <div style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--text-secondary); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none; padding-bottom:8px; border-bottom:1px solid var(--border-light);" id="da-financing-header">
      <span id="da-financing-arrow" style="transition:transform 0.2s; display:inline-block; transform:rotate(-90deg);">▼</span>
      <span>Financing Inputs</span>
    </div>
    <div id="da-financing-section" style="display:none; margin-top:10px;">
      <div id="da-percent-error" class="da-warning" style="display:none;">⚠️ Total percentages must equal 100%</div>

      <div style="margin-bottom:10px;">
        <div class="da-label" style="font-weight:600; color:var(--text-primary); margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;" id="da-sba-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span id="da-sba-arrow" style="transition:transform 0.2s; display:inline-block; transform:rotate(-90deg);">▼</span>
            <span>A. SBA</span>
          </div>
          <span id="da-sba-summary" style="font-size:calc(11px * var(--font-scale)); color:var(--text-secondary); font-weight:400;">80% • 9.25% • 10yr • 1.25x DSCR</span>
        </div>
      <div id="da-sba-section" style="display:none; margin-top:8px;">
        <div class="da-flex-row">
          <div style="flex:1">
            <label class="da-label">Percentage (%)</label>
            <input type="number" id="da-sba-percent" class="da-input" value="80" step="0.1" min="0" max="100">
          </div>
          <div style="flex:1">
            <label class="da-label">Loan Size ($)</label>
            <input type="text" id="da-sba-loan" class="da-input" value="" placeholder="0" readonly>
          </div>
        </div>
        <div class="da-flex-row">
          <div style="flex:1">
            <label class="da-label">Interest Rate (%)</label>
            <input type="number" id="da-bank-rate" class="da-input" value="9.25" step="0.1">
          </div>
          <div style="flex:1">
            <label class="da-label">Term (Yrs)</label>
            <input type="number" id="da-bank-term" class="da-input" value="10">
          </div>
          <div style="flex:1">
            <label class="da-label">Target DSCR</label>
            <div style="display:flex; align-items:center; gap:4px;">
              <input type="number" id="da-dscr" class="da-input" value="1.25" step="0.05" min="1.0" style="flex:1;">
              <div style="display:flex; flex-direction:column; gap:2px;">
                <button id="da-dscr-up" style="cursor:pointer; background:var(--bg-secondary); border:1px solid var(--border-light); border-radius:2px; padding:2px 6px; font-size:calc(10px * var(--font-scale)); line-height:1; color:var(--text-primary); transition:background 0.2s;" title="Increase DSCR by 0.05">▲</button>
                <button id="da-dscr-down" style="cursor:pointer; background:var(--bg-secondary); border:1px solid var(--border-light); border-radius:2px; padding:2px 6px; font-size:calc(10px * var(--font-scale)); line-height:1; color:var(--text-primary); transition:background 0.2s;" title="Decrease DSCR by 0.05">▼</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-bottom:10px;">
      <div class="da-label" style="font-weight:600; color:var(--text-primary); margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;" id="da-buyer-equity-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span id="da-buyer-equity-arrow" style="transition:transform 0.2s; display:inline-block; transform:rotate(-90deg);">▼</span>
          <span>B. Buyer Equity</span>
        </div>
        <span id="da-buyer-equity-summary" style="font-size:calc(11px * var(--font-scale)); color:var(--text-secondary); font-weight:400;">10% ($0) • $150k salary</span>
      </div>
      <div id="da-buyer-equity-section" style="display:none; margin-top:8px;">
        <div class="da-flex-row">
          <div style="flex:1">
            <label class="da-label">Percentage (%)</label>
            <input type="number" id="da-down-percent" class="da-input" value="10" step="0.1" min="0" max="100">
          </div>
          <div style="flex:1">
            <label class="da-label">Equity Amount ($)</label>
            <input type="text" id="da-down" class="da-input" value="" placeholder="0" readonly>
          </div>
        </div>
        <div class="da-row">
          <label class="da-label">Target Owner Salary (Annual) <span style="font-weight:400; color:var(--text-tertiary); font-size:calc(11px * var(--font-scale));">(Required for SBA)</span></label>
          <input type="text" id="da-target-salary" class="da-input" placeholder="150000" value="150000">
          <div id="da-salary-warning" class="da-warning" style="display:none; padding:6px 8px; margin-top:4px;">⚠️ Warning: Target salary exceeds available cash flow!</div>
        </div>
      </div>
    </div>

    <div style="margin-bottom:10px;">
      <div class="da-label" style="font-weight:600; color:var(--text-primary); margin-bottom:6px; display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="da-seller-note-enabled" style="width:auto; cursor:pointer;">
          <span id="da-seller-note-arrow" style="transition:transform 0.2s; display:inline-block; cursor:pointer; user-select:none;">▼</span>
          <label for="da-seller-note-enabled" style="cursor:pointer;">
            <span>C. Seller Note <span style="font-weight:400; color:var(--text-tertiary);">(Optional)</span></span>
          </label>
        </div>
        <span id="da-seller-note-summary" style="font-size:calc(11px * var(--font-scale)); color:var(--text-secondary); font-weight:400;">10% • 6.0% • Amortizing</span>
      </div>
      <div id="da-seller-note-section" style="display:none; margin-top:8px;">
        <div class="da-row">
          <label class="da-label">Percentage (%)</label>
          <input type="number" id="da-seller-percent" class="da-input" value="10" step="0.1" min="0" max="100">
        </div>
        <div class="da-row">
          <label class="da-label">Amount ($) <span style="font-weight:400; color:var(--text-tertiary); font-size:calc(11px * var(--font-scale));">(Auto-calculated, override to edit)</span></label>
          <input type="text" id="da-seller-amt" class="da-input" value="" placeholder="0" readonly>
        </div>
        <div class="da-flex-row">
          <div style="flex:1">
            <label class="da-label">Standby</label>
            <select id="da-seller-standby" class="da-select">
              <option value="no" selected>No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          <div style="flex:1">
            <label class="da-label">Interest Rate (%)</label>
            <input type="number" id="da-seller-rate" class="da-input" value="6.0" step="0.1">
          </div>
          <div style="flex:1">
            <label class="da-label">Payment Type</label>
            <select id="da-seller-payment-type" class="da-select">
              <option value="amortizing" selected>Amortizing</option>
              <option value="interest-only">Interest Only</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>

  <div class="da-section" style="background:var(--bg-tertiary); flex-grow:1;">
    <div id="da-deal-opportunity" class="da-warning" style="display:none; margin-bottom:12px; position:relative; padding-right:30px;">
      <span id="da-deal-opportunity-close" style="position:absolute; top:8px; right:8px; cursor:pointer; font-size:calc(16px * var(--font-scale)); opacity:0.7; line-height:1; transition:opacity 0.2s;" title="Dismiss">✕</span>
      💰 <strong>DEAL OPPORTUNITY!</strong><br>
      <span id="da-deal-savings"></span>
    </div>
    
    <!-- MAX SCENARIO -->
    <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border-light);">
      <div id="da-max-header" style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--text-secondary); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;">
        <span id="da-max-arrow" style="transition:transform 0.2s; display:inline-block; transform:rotate(-90deg);">▼</span>
        <span>Maximum Allowable (DSCR-Based)</span>
      </div>
      <div id="da-max-content" style="display:none;">
        <div class="da-result-box">
          <div class="da-result-title">Max Allowable Purchase Price</div>
          <div class="da-result-value" id="da-max-price" style="font-size:calc(16px * var(--font-scale));">$0</div>
        </div>
        <div class="da-result-box" style="border-left-color: #95a5a6;">
          <div class="da-result-title">Max Annual Debt Service</div>
          <div class="da-result-value" id="da-max-debt" style="font-size:calc(16px * var(--font-scale));">$0</div>
        </div>
      </div>
    </div>
    
    <!-- ROI METRICS -->
    <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border-light);">
      <div id="da-roi-header" style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--text-secondary); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;">
        <span id="da-roi-arrow" style="transition:transform 0.2s; display:inline-block; transform:rotate(-90deg);">▼</span>
        <span>Return on Investment (Year 1)</span>
      </div>
      <div id="da-roi-content" style="display:none;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          <div class="da-result-box" style="border-left-color: #e67e22; margin-top:0;">
            <div class="da-result-title">Cash-on-Cash Return</div>
            <div class="da-result-value" id="da-coc-return" style="font-size:calc(18px * var(--font-scale));">0%</div>
            <div style="font-size:calc(9px * var(--font-scale)); color:var(--text-tertiary); margin-top:1px;">Annual return on equity</div>
          </div>
          <div class="da-result-box" style="border-left-color: #9b59b6; margin-top:0;">
            <div class="da-result-title">Payback Period</div>
            <div class="da-result-value" id="da-payback" style="font-size:calc(18px * var(--font-scale));">0 yrs</div>
            <div style="font-size:calc(9px * var(--font-scale)); color:var(--text-tertiary); margin-top:1px;">Time to recover equity</div>
          </div>
        </div>
    </div>
  </div>
  
  <!-- TARGET OFFER CALCULATOR -->
  <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border-light);">
    <div id="da-target-offer-header" style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--text-secondary); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;">
      <span id="da-target-offer-arrow" style="transition:transform 0.2s; display:inline-block; transform:rotate(-90deg);">▼</span>
      <span>🎯 Target Offer Calculator</span>
    </div>
    <div id="da-target-offer-content" style="display:none;">
      <div style="background:var(--bg-tertiary); border:1px solid #3498db; border-radius:4px; padding:10px; margin-bottom:8px;">
        <div style="font-size:calc(11px * var(--font-scale)); color:var(--text-primary); margin-bottom:8px;">
          <strong>Calculate the maximum offer price</strong> that meets ALL requirements:<br>
          ✓ Achieves your target <span id="da-target-coc-display">25</span>% COC return<br>
          ✓ Your salary is covered ($<span id="da-target-salary-display">150k</span>)<br>
          ✓ DSCR requirement is met (<span id="da-target-dscr-display">1.25</span>x)<br>
          ✓ Never exceeds the asking price<br>
          <em style="font-size:calc(10px * var(--font-scale)); color:var(--text-secondary);">Shows which constraint limits your offer</em>
        </div>
        <button id="da-calculate-target-offer-btn" class="da-btn" style="width:100%; background:#3498db; font-weight:600;">🎯 Calculate Target Offer Price</button>
      </div>
      
      <div id="da-target-offer-results" style="display:none;">
        <div class="da-result-box" style="border-left-color:#3498db; background:var(--bg-tertiary);">
          <div class="da-result-title" style="font-weight:700; color:var(--text-primary);">🎯 Recommended Offer Price</div>
          <div class="da-result-value" id="da-target-offer-price" style="font-size:calc(20px * var(--font-scale)); font-weight:700; color:#3498db;">$0</div>
          <div style="font-size:calc(10px * var(--font-scale)); color:var(--text-secondary); margin-top:4px; line-height:1.4;" id="da-target-offer-subtitle">
            To achieve your <span id="da-target-coc-result">25</span>% COC return in <span id="da-target-payback-result">4</span> years
          </div>
        </div>
        
        <div id="da-target-comparison" style="margin-top:8px; padding:8px; border-radius:4px; font-size:calc(11px * var(--font-scale)); background:var(--bg-secondary); color:var(--text-primary);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:600;">vs. Asking Price:</span>
            <span id="da-target-diff-amount" style="font-weight:700;">$0</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span>Difference:</span>
            <span id="da-target-diff-percent" style="font-weight:700;">0%</span>
          </div>
        </div>
        
        <div style="margin-top:8px; padding:8px; background:var(--bg-secondary); border-radius:4px; font-size:calc(10px * var(--font-scale)); color:var(--text-secondary);">
          <div style="font-weight:600; margin-bottom:4px;">Financing Assumptions:</div>
          <div id="da-target-financing-breakdown" style="line-height:1.6;"></div>
        </div>
        
        <div style="margin-top:8px;">
          <div style="font-size:calc(10px * var(--font-scale)); font-weight:600; color:var(--text-secondary); margin-bottom:4px;">Projected Metrics at Target Price:</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
            <div style="background:var(--bg-secondary); padding:6px; border-radius:3px;">
              <div style="font-size:calc(9px * var(--font-scale)); color:var(--text-tertiary);">Free Cash Flow</div>
              <div id="da-target-fcf" style="font-size:calc(12px * var(--font-scale)); font-weight:700; color:#27ae60;">$0</div>
            </div>
            <div style="background:var(--bg-secondary); padding:6px; border-radius:3px;">
              <div style="font-size:calc(9px * var(--font-scale)); color:var(--text-tertiary);">Total Take-Home</div>
              <div id="da-target-takehome" style="font-size:calc(12px * var(--font-scale)); font-weight:700; color:var(--text-primary);">$0</div>
            </div>
          </div>
        </div>
        
        <button id="da-use-target-offer-btn" class="da-btn" style="width:100%; margin-top:8px; background:#27ae60; font-size:calc(11px * var(--font-scale));">✓ Use This as Actual Price</button>
      </div>
    </div>
  </div>
  
  <!-- ACTUAL SCENARIO -->
  <div style="margin-bottom:10px;">
    <div id="da-actual-header" style="font-size:calc(10px * var(--font-scale)); font-weight:700; color:var(--text-secondary); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;">
      <span id="da-actual-arrow" style="transition:transform 0.2s; display:inline-block; transform:rotate(-90deg);">▼</span>
      <span>Actual Deal Scenario</span>
    </div>
      <div id="da-actual-content" style="display:none;">
        <div class="da-result-box" style="border-left-color: #e67e22;">
          <div class="da-result-title">Offer Price <span style="font-weight:400; color:var(--text-tertiary); font-size:calc(9px * var(--font-scale));">(Click to Edit)</span></div>
          <input type="text" id="da-actual-price" class="da-input" value="$0" readonly style="font-size:calc(16px * var(--font-scale)); font-weight:700; color:var(--text-primary); border:none; background:transparent; padding:3px 0; cursor:pointer;">
        </div>
        <div class="da-result-box" style="border-left-color: #9b59b6;">
          <div class="da-result-title">Total Debt Service</div>
          <div class="da-result-value" id="da-total-debt" style="font-size:calc(16px * var(--font-scale));">$0</div>
        </div>
        <div class="da-result-box" style="border-left-color: #27ae60;">
          <div class="da-result-title">Free Cash Flow (Annual)</div>
          <div class="da-result-value" id="da-fcf-annual" style="font-size:calc(16px * var(--font-scale));">$0</div>
          <div style="font-size:calc(10px * var(--font-scale)); color:var(--text-secondary); margin-top:3px;">Monthly: <span id="da-fcf-monthly">$0</span></div>
        </div>
        <div class="da-result-box" style="border-left-color: #3498db;">
          <div class="da-result-title">Total Owner Take-Home</div>
          <div class="da-result-value" id="da-owner-salary" style="font-size:calc(16px * var(--font-scale));">$0</div>
          <div style="font-size:calc(9px * var(--font-scale)); color:var(--text-tertiary); margin-top:3px;" id="da-owner-subtitle">Salary + FCF (max available: <span id="da-max-available">$0</span>)</div>
        </div>
      </div>
    </div>
    
    <div style="display:flex; gap:6px; margin-top:6px;">
      <button id="da-recalc-btn" class="da-btn" style="flex:1;">↺ Refresh Data</button>
      <button id="da-share-btn" class="da-btn" style="flex:1; background:#3498db;">📤 Share Deal</button>
    </div>
  </div>
  
  <!-- Deal Notes Section (Bottom) -->
  <div class="da-section" style="background:var(--bg-secondary); border-top:2px solid var(--border-light);">
    <div class="da-label" style="font-weight:600; color:var(--text-primary); margin-bottom:6px; display:flex; align-items:center; gap:6px;">
      📝 Deal Notes
      <span style="font-size:calc(10px * var(--font-scale)); color:var(--text-tertiary); font-weight:400;">(Included in all exports)</span>
    </div>
    <textarea id="da-deal-notes" class="da-input" placeholder="Add notes: questions for seller, red flags, follow-ups, pros/cons..." style="width:100%; min-height:60px; font-size:calc(11px * var(--font-scale)); padding:8px; resize:vertical; font-family:inherit; border:1px solid var(--border-light);"></textarea>
    <div id="da-deal-url-link" style="display:none; margin-top:6px; padding:6px 8px; background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:4px; font-size:calc(11px * var(--font-scale));">
      🔗 <a id="da-deal-url-anchor" href="#" target="_blank" style="color:#0066cc; text-decoration:none; font-weight:500;">View Original Listing</a>
    </div>
    <div style="display:flex; gap:6px; margin-top:6px;">
      <input type="text" id="da-deal-name" class="da-input" placeholder="Deal name (for saving)" style="flex:1; font-size:calc(11px * var(--font-scale)); padding:6px 8px;">
      <select id="da-saved-deals-list" class="da-select" style="flex:1; font-size:calc(11px * var(--font-scale)); padding:6px 8px;">
        <option value="">Load saved deal...</option>
      </select>
    </div>
  </div>
  
  <!-- Footer with action buttons -->
  <div id="deal-analyzer-footer" style="position:sticky; bottom:0; z-index:10; flex-shrink:0; padding:8px 12px; background-color:var(--bg-header); border-bottom-left-radius:8px; border-bottom-right-radius:8px; display:flex; justify-content:center; align-items:center; gap:12px; border-top:1px solid var(--border-light);">
    <span id="da-save-deal-btn-footer" class="da-header-icon" title="Save current deal (Cmd/Ctrl+S)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span>
    <span id="da-dashboard-btn-footer" class="da-header-icon" title="Open Deals Dashboard"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
    <span id="da-coffee-btn-footer" class="da-header-icon" title="Buy me a coffee ☕ ($10)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg></span>
    <span id="da-settings-btn-footer" class="da-header-icon" title="Settings"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
    <span id="da-close-footer" class="da-header-icon da-header-icon-close" title="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
  </div>
</div>
`;

// Share Modal HTML
const shareModalHTML = `
<div id="da-share-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:2147483646; align-items:center; justify-content:center;">
  <div style="background:white; border-radius:8px; padding:24px; max-width:400px; width:90%; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <h3 style="margin:0; font-size:calc(18px * var(--font-scale)); color:#2c3e50;">Share Deal Analysis</h3>
      <span id="da-share-close" style="cursor:pointer; font-size:calc(24px * var(--font-scale)); color:#999; line-height:1;">&times;</span>
    </div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <button id="da-share-pdf" class="da-btn" style="background:#e74c3c;">📄 Export as PDF</button>
      <button id="da-share-email" class="da-btn" style="background:#3498db;">📧 Email</button>
      <button id="da-share-sms" class="da-btn" style="background:#27ae60;">💬 SMS</button>
      <button id="da-share-native" class="da-btn" style="background:#9b59b6;">📱 Share (AirDrop)</button>
      <button id="da-share-copy" class="da-btn" style="background:#95a5a6;">📋 Copy to Clipboard</button>
    </div>
  </div>
</div>
`;

// Settings Modal HTML
const settingsModalHTML = `
<div id="da-settings-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:2147483646; align-items:center; justify-content:center;">
  <div id="da-settings-modal-content" style="background:white; border-radius:8px; padding:24px; max-width:520px; width:90%; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <h3 style="margin:0; font-size:calc(18px * var(--font-scale)); color:#2c3e50;">⚙️ Settings & Targets</h3>
      <span id="da-settings-close" style="cursor:pointer; font-size:calc(24px * var(--font-scale)); color:#999; line-height:1;">&times;</span>
    </div>
    
    <div style="margin-bottom:20px;">
      <h4 style="font-size:calc(14px * var(--font-scale)); color:#2c3e50; margin:0 0 12px 0; border-bottom:1px solid #eee; padding-bottom:6px;">Deal Quality Targets</h4>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:calc(12px * var(--font-scale)); color:#666; margin-bottom:4px; font-weight:600;">Target Cash-on-Cash Return (%)</label>
        <input type="number" id="da-target-coc" class="da-input" value="25" step="1" min="0" max="200" style="width:100%;">
        <div style="font-size:calc(10px * var(--font-scale)); color:#999; margin-top:2px;">Your minimum acceptable annual return on equity investment</div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:calc(12px * var(--font-scale)); color:#666; margin-bottom:4px; font-weight:600;">Target Payback Period (Years)</label>
        <input type="number" id="da-target-payback" class="da-input" value="4" step="0.5" min="1" max="20" style="width:100%;">
        <div style="font-size:calc(10px * var(--font-scale)); color:#999; margin-top:2px;">Maximum years to recover your initial equity investment</div>
      </div>
    </div>
    
    <div style="margin-bottom:20px;">
      <h4 style="font-size:calc(14px * var(--font-scale)); color:#2c3e50; margin:0 0 12px 0; border-bottom:1px solid #eee; padding-bottom:6px;">My Deals (web sync)</h4>
      <p id="da-vettr-connection-status" style="font-size:calc(12px * var(--font-scale)); color:#666; margin:0 0 10px 0; line-height:1.45;">Checking connection…</p>
      <div id="da-vettr-signin-block" style="margin-bottom:12px;">
        <p style="font-size:calc(11px * var(--font-scale)); color:#666; margin:0 0 8px 0;">Sign in to sync saves to <strong>My Deals</strong> on Vettr (same list as the website).</p>
        <div style="margin-bottom:8px;">
          <label style="display:block; font-size:calc(11px * var(--font-scale)); color:#666; margin-bottom:4px;">Email</label>
          <input type="email" id="da-vettr-login-email" class="da-input" placeholder="you@example.com" style="width:100%;" autocomplete="username">
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:block; font-size:calc(11px * var(--font-scale)); color:#666; margin-bottom:4px;">Password</label>
          <input type="password" id="da-vettr-login-password" class="da-input" placeholder="Password" style="width:100%;" autocomplete="current-password">
        </div>
        <button type="button" id="da-vettr-login-btn" class="da-btn" style="background:#3498db; color:#fff; margin-right:8px;">Sign in</button>
        <button type="button" id="da-vettr-signout-btn" class="da-btn" style="background:#ecf0f1; color:#2c3e50; display:none;">Sign out</button>
        <p id="da-vettr-login-error" style="font-size:calc(11px * var(--font-scale)); color:#c0392b; margin:8px 0 0; display:none;"></p>
      </div>
      <p style="font-size:calc(11px * var(--font-scale)); color:#666; margin:0 0 8px 0;">
        <a href="#" id="da-vettr-try-web" style="color:#3498db;">Try Vettr free on the web</a>
        · <a href="#" id="da-vettr-web-signup" style="color:#3498db;">Create account</a>
      </p>
      <button type="button" id="da-vettr-advanced-toggle" class="da-btn" style="background:#ecf0f1; color:#2c3e50; font-size:calc(11px * var(--font-scale)); padding:6px 12px;">Manual setup (support only)</button>
      <div id="da-vettr-advanced" style="display:none; margin-top:12px; padding-top:12px; border-top:1px solid #eee;">
        <p style="font-size:calc(10px * var(--font-scale)); color:#999; margin:0 0 8px 0;">Only if automatic linking does not work (e.g. unusual browser setup).</p>
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:calc(12px * var(--font-scale)); color:#666; margin-bottom:4px; font-weight:600;">API base URL</label>
          <input type="text" id="da-vettr-api-url" class="da-input" placeholder="https://your-api.example.com/api" style="width:100%;" autocomplete="off">
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:calc(12px * var(--font-scale)); color:#666; margin-bottom:4px; font-weight:600;">Session token</label>
          <input type="password" id="da-vettr-token" class="da-input" placeholder="From Vettr support only" style="width:100%;" autocomplete="off">
        </div>
      </div>
    </div>
    
    <div style="margin-bottom:20px;">
      <h4 style="font-size:calc(14px * var(--font-scale)); color:#2c3e50; margin:0 0 12px 0; border-bottom:1px solid #eee; padding-bottom:6px;">Display Preferences</h4>
      <div style="margin-bottom:12px;">
        <label style="display:flex; align-items:center; cursor:pointer; gap:8px;">
          <input type="checkbox" id="da-format-compact" style="cursor:pointer;">
          <span style="font-size:calc(12px * var(--font-scale)); color:#666; font-weight:600;">Use compact number format (1.2M instead of 1,200,000)</span>
        </label>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:flex; align-items:center; cursor:pointer; gap:8px;">
          <input type="checkbox" id="da-dark-mode" style="cursor:pointer;">
          <span style="font-size:calc(12px * var(--font-scale)); color:#666; font-weight:600;">Dark Mode</span>
        </label>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:flex; align-items:center; cursor:pointer; gap:8px;">
          <input type="checkbox" id="da-auto-open" style="cursor:pointer;">
          <span style="font-size:calc(12px * var(--font-scale)); color:#666; font-weight:600;">Auto-open on business listing sites</span>
        </label>
        <div style="font-size:calc(10px * var(--font-scale)); color:#999; margin-top:2px; margin-left:28px;">Automatically show the extension when visiting business listing pages (BizBuySell, BizQuest, etc.)</div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:calc(12px * var(--font-scale)); color:#666; margin-bottom:4px; font-weight:600;">Language</label>
        <select id="da-language" class="da-select" style="width:100%;">
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:calc(12px * var(--font-scale)); color:#666; margin-bottom:4px; font-weight:600;">Currency</label>
        <select id="da-currency" class="da-select" style="width:100%;">
          <option value="USD">USD - US Dollar ($)</option>
          <option value="EUR">EUR - Euro (€)</option>
          <option value="GBP">GBP - British Pound (£)</option>
          <option value="CAD">CAD - Canadian Dollar (C$)</option>
          <option value="AUD">AUD - Australian Dollar (A$)</option>
          <option value="JPY">JPY - Japanese Yen (¥)</option>
          <option value="MXN">MXN - Mexican Peso (MX$)</option>
          <option value="CHF">CHF - Swiss Franc (CHF)</option>
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:calc(12px * var(--font-scale)); color:#666; margin-bottom:4px; font-weight:600;">Font Size</label>
        <div style="display:flex; align-items:center; gap:12px;">
          <input type="range" id="da-font-size" min="80" max="150" value="100" step="10" 
                 style="flex:1; height:6px; border-radius:3px; appearance:none; background:#e0e0e0; cursor:pointer;" />
          <span id="da-font-size-display" style="min-width:50px; font-weight:600; font-size:calc(14px * var(--font-scale));">100%</span>
        </div>
        <div style="font-size:calc(10px * var(--font-scale)); color:#999; margin-top:2px;">Adjust from 80% to 150% (independent of browser zoom)</div>
      </div>
    </div>
    
    <div style="display:flex; gap:8px;">
      <button id="da-settings-save" class="da-btn" style="flex:1; background:#27ae60;">💾 Save Settings</button>
      <button id="da-settings-reset" class="da-btn" style="flex:1; background:#95a5a6;">↺ Reset Defaults</button>
    </div>
  </div>
</div>
`;

// Debug/Diagnostics Modal HTML
const debugModalHTML = `
<div id="da-debug-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:2147483646; align-items:center; justify-content:center;">
  <div style="background:white; border-radius:8px; padding:24px; max-width:650px; width:90%; max-height:80vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <h3 style="margin:0; font-size:calc(18px * var(--font-scale)); color:#2c3e50;">🔍 Scraping Diagnostics</h3>
      <span id="da-debug-close" style="cursor:pointer; font-size:calc(24px * var(--font-scale)); color:#999; line-height:1;">&times;</span>
    </div>
    
    <div style="margin-bottom:20px;">
      <div style="background:#f8f9fa; border-radius:6px; padding:12px; margin-bottom:12px;">
        <div style="font-size:calc(12px * var(--font-scale)); color:#666; margin-bottom:8px; font-weight:600;">CURRENT PAGE</div>
        <div id="da-debug-url" style="font-size:calc(11px * var(--font-scale)); color:#333; word-break:break-all; margin-bottom:6px;"></div>
        <div style="display:flex; gap:12px; align-items:center;">
          <div><span style="font-size:calc(11px * var(--font-scale)); color:#666;">Platform:</span> <strong id="da-debug-platform" style="font-size:calc(12px * var(--font-scale)); color:#3498db;">Unknown</strong></div>
          <div><span style="font-size:calc(11px * var(--font-scale)); color:#666;">Status:</span> <span id="da-debug-status" style="font-size:calc(12px * var(--font-scale)); font-weight:600;">Not scraped</span></div>
        </div>
      </div>
      
      <div style="background:#fff3cd; border-left:4px solid #f39c12; padding:12px; margin-bottom:12px; border-radius:4px;">
        <div style="font-size:calc(12px * var(--font-scale)); color:#856404; font-weight:600; margin-bottom:4px;">💡 TIP</div>
        <div style="font-size:calc(11px * var(--font-scale)); color:#856404;">Open your browser's console (F12) to see detailed scraping logs with all attempts and strategies used.</div>
      </div>
    </div>
    
    <div style="margin-bottom:20px;">
      <h4 style="font-size:calc(14px * var(--font-scale)); color:#2c3e50; margin:0 0 12px 0; border-bottom:1px solid #eee; padding-bottom:6px;">Scraped Data</h4>
      <div style="display:grid; gap:10px;">
        <div style="background:#f8f9fa; padding:10px; border-radius:4px;">
          <div style="font-size:calc(11px * var(--font-scale)); color:#666; margin-bottom:4px;">Asking Price</div>
          <div id="da-debug-price" style="font-size:calc(14px * var(--font-scale)); font-weight:600; color:#2c3e50;">Not found</div>
        </div>
        <div style="background:#f8f9fa; padding:10px; border-radius:4px;">
          <div style="font-size:calc(11px * var(--font-scale)); color:#666; margin-bottom:4px;">EBITDA / SDE</div>
          <div id="da-debug-ebitda" style="font-size:calc(14px * var(--font-scale)); font-weight:600; color:#2c3e50;">Not found</div>
        </div>
      </div>
    </div>
    
    <div style="margin-bottom:20px;">
      <h4 style="font-size:calc(14px * var(--font-scale)); color:#2c3e50; margin:0 0 12px 0; border-bottom:1px solid #eee; padding-bottom:6px;">Actions</h4>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button id="da-debug-rescrape" class="da-btn" style="background:#3498db; font-size:calc(12px * var(--font-scale)); padding:8px 16px;">🔄 Re-scrape Page</button>
        <button id="da-debug-console" class="da-btn" style="background:#95a5a6; font-size:calc(12px * var(--font-scale)); padding:8px 16px;">📋 Open Console (F12)</button>
      </div>
    </div>
    
    <div style="background:#e7f3ff; border-left:4px solid #3498db; padding:12px; border-radius:4px; margin-bottom:12px;">
      <div style="font-size:calc(12px * var(--font-scale)); color:#1e5a8e; font-weight:600; margin-bottom:6px;">🛠️ Troubleshooting</div>
      <div style="font-size:calc(11px * var(--font-scale)); color:#1e5a8e; line-height:1.5;">
        <strong>No data found?</strong> Try these steps:<br>
        1. Make sure you're on a listing detail page (not search results)<br>
        2. Wait for the page to fully load before opening Vettr<br>
        3. Check if financial data is visible on the page<br>
        4. Some sites require login to view financial details<br>
        5. Open console (F12) for detailed scraping logs
      </div>
    </div>
    
    <div style="text-align:center; margin-top:16px;">
      <button id="da-debug-done" class="da-btn" style="background:#27ae60; font-size:calc(12px * var(--font-scale)); padding:10px 24px;">✅ Done</button>
    </div>
  </div>
</div>
`;

// Inject the UI
try {
  const div = document.createElement('div');
  div.innerHTML = uiHTML;
  document.body.appendChild(div);
} catch (error) {
  console.error('Error injecting main UI:', error);
}

// Inject the share modal
try {
  const shareDiv = document.createElement('div');
  shareDiv.innerHTML = shareModalHTML;
  document.body.appendChild(shareDiv);
} catch (error) {
  console.error('Error injecting share modal:', error);
}

// Inject the settings modal
try {
  const settingsDiv = document.createElement('div');
  settingsDiv.innerHTML = settingsModalHTML;
  document.body.appendChild(settingsDiv);
} catch (error) {
  console.error('Error injecting settings modal:', error);
}

// Inject the debug/diagnostics modal
try {
  const debugDiv = document.createElement('div');
  debugDiv.innerHTML = debugModalHTML;
  document.body.appendChild(debugDiv);
} catch (error) {
  console.error('Error injecting debug modal:', error);
}

// Coffee/Donate modal HTML (with Venmo QR code)
const venmoQrUrl = chrome.runtime.getURL('icons/venmo-qr.png');
const coffeeModalHTML = `
<div id="da-coffee-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:2147483646; align-items:center; justify-content:center; ">
  <div style="background:white; border-radius:12px; padding:24px; max-width:320px; width:90%; box-shadow:0 4px 24px rgba(0,0,0,0.3); text-align:center;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h3 style="margin:0; font-size:calc(18px * var(--font-scale)); color:#2c3e50;">☕ Buy me a coffee</h3>
      <span id="da-coffee-modal-close" style="cursor:pointer; font-size:calc(24px * var(--font-scale)); color:#999; line-height:1;">&times;</span>
    </div>
    <p style="margin:0 0 16px 0; font-size:calc(14px * var(--font-scale)); color:#666;">Suggested amount: $10</p>
    <div style="background:#f8f9fa; border-radius:8px; padding:16px; margin-bottom:16px;">
      <img src="${venmoQrUrl}" alt="Venmo QR Code" style="max-width:180px; height:auto; display:block; margin:0 auto;">
      <p style="margin:12px 0 0 0; font-size:calc(13px * var(--font-scale)); color:#333; font-weight:600;">@amco-digital</p>
      <p style="margin:4px 0 0 0; font-size:calc(11px * var(--font-scale)); color:#666;">Scan to pay with Venmo</p>
    </div>
    <a id="da-coffee-open-venmo" href="https://venmo.com/u/amco-digital" target="_blank" rel="noopener" style="display:inline-block; background:#008CFF; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; font-size:calc(14px * var(--font-scale)); margin-bottom:8px;">Open Venmo</a>
    <p style="margin:8px 0 0 0; font-size:calc(11px * var(--font-scale)); color:#999;">Or click to open Venmo in a new tab</p>
  </div>
</div>
`;
try {
  const coffeeDiv = document.createElement('div');
  coffeeDiv.innerHTML = coffeeModalHTML;
  document.body.appendChild(coffeeDiv.firstElementChild);
} catch (error) {
  console.error('Error injecting coffee modal:', error);
}

// --- 2. DRAGGABLE WINDOW LOGIC ---
const container = document.getElementById('deal-analyzer-container');
const header = document.getElementById('deal-analyzer-header');

// Check if elements exist
if (!container || !header) {
  console.error('Vettr UI elements not found. Extension may not work properly.');
}

// Load and apply font size preference
(function loadFontSize() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['userPreferences'], (result) => {
      const fontSize = result.userPreferences?.fontSize || 100;
      console.log('🔤 Loading saved font size for widget:', fontSize + '%');
      if (container) {
        // Set CSS variable for font scaling
        const scale = fontSize / 100;
        container.style.setProperty('--font-scale', scale);
        
        // Debug: Check if it was actually set
        const computedScale = getComputedStyle(container).getPropertyValue('--font-scale');
        console.log('🔤 Applied font scale:', scale, 'Computed:', computedScale);
        
        // Test: Try getting a child element's computed font size
        const testLabel = container.querySelector('.da-label');
        if (testLabel) {
          const computedFontSize = getComputedStyle(testLabel).fontSize;
          console.log('🔤 Test label computed font-size:', computedFontSize);
        }
      } else {
        console.error('🔤 Container not found during initial load!');
      }
    });
  }
})();

// START HIDDEN BY DEFAULT - only show when user clicks extension icon
if (container) {
  container.style.display = 'none';
}

// User preferences with defaults
let userPreferences = {
  targetCOC: 25, // 25% Cash-on-Cash return
  targetPayback: 4, // 4 years payback period
  compactFormat: false,
  darkMode: false, // Dark mode preference
  autoOpenOnBusinessSites: false, // Auto-open extension on business listing sites
  language: 'en', // Language code
  currency: 'USD', // Currency code
  // Persistent financing settings across tabs
  sbaPercent: 80,
  bankRate: 9.25,
  bankTerm: 10,
  dscr: 1.25,
  downPercent: 10,
  targetSalary: 250000,
  sellerNoteEnabled: false,
  sellerPercent: 10,
  sellerRate: 5.0,
  sellerStandby: 'no',
  sellerPaymentType: 'amortizing'
};
let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;

// Update max-height dynamically based on container position to allow vertical expansion
function updateMaxHeight() {
  if (!container) return;
  const rect = container.getBoundingClientRect();
  // Calculate available height from current top position to bottom of viewport
  const availableHeight = window.innerHeight - rect.top - 10; // 10px margin from bottom
  container.style.maxHeight = Math.max(200, availableHeight) + 'px';
}

// Window geometry persistence
function saveWindowGeometry() {
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  const geometry = {
    xOffset: xOffset,
    yOffset: yOffset,
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
  
  chrome.storage.local.set({ windowGeometry: geometry }, () => {
    console.log('💾 Window geometry saved:', geometry);
  });
}

function restoreWindowGeometry() {
  if (!container) return;
  
  chrome.storage.local.get(['windowGeometry'], (result) => {
    if (result.windowGeometry) {
      const geometry = result.windowGeometry;
      
      // Restore position
      if (typeof geometry.xOffset === 'number') xOffset = geometry.xOffset;
      if (typeof geometry.yOffset === 'number') yOffset = geometry.yOffset;
      
      // Apply transform to restore position
      if (typeof xOffset === 'number' && typeof yOffset === 'number') {
        container.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
      }
      
      // Restore size (with reasonable min/max constraints)
      if (geometry.width && geometry.width >= 200 && geometry.width <= 2000) {
        container.style.width = geometry.width + 'px';
      }
      if (geometry.height && geometry.height >= 200 && geometry.height <= 2000) {
        container.style.height = geometry.height + 'px';
      }
      
      // Update max-height after restoring position
      setTimeout(() => {
        updateMaxHeight();
      }, 100);
      
      console.log('✅ Window geometry restored:', geometry);
    } else {
      // Even if no saved geometry, update max-height for initial position
      setTimeout(() => {
        updateMaxHeight();
      }, 100);
    }
  });
}

if (header && container) {
  header.addEventListener("mousedown", dragStart);
  document.addEventListener("mouseup", dragEnd);
  document.addEventListener("mousemove", drag);
  
  // Update max-height on window resize
  window.addEventListener('resize', updateMaxHeight);
  
  // Initial max-height update
  setTimeout(updateMaxHeight, 100); // Small delay to ensure container is rendered
  
  // Monitor resize events to save window geometry and update max-height
  let resizeTimeout;
  const resizeObserver = new ResizeObserver(() => {
    updateMaxHeight();
    // Debounce resize saves to avoid too many storage writes
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      saveWindowGeometry();
    }, 500); // Save 500ms after resize ends
  });
  
  resizeObserver.observe(container);
}

function dragStart(e) {
  initialX = e.clientX - xOffset;
  initialY = e.clientY - yOffset;
  if (e.target === header) isDragging = true;
}
function dragEnd() { 
  isDragging = false;
  // Save position when dragging ends
  saveWindowGeometry();
}
function drag(e) {
  if (isDragging && container) {
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    
    // Prevent dragging above the top of the viewport (min 10px from top)
    const containerRect = container.getBoundingClientRect();
    const minTop = 10;
    const maxBottom = window.innerHeight - 50; // Keep at least 50px of header visible at bottom
    
    // Calculate what the new top position would be
    const newTop = 120 + currentY; // 120 is the initial top position from CSS
    
    // Constrain the Y position
    if (newTop < minTop) {
      currentY = minTop - 120;
      yOffset = currentY;
    } else if (newTop > maxBottom) {
      currentY = maxBottom - 120;
      yOffset = currentY;
    } else {
      xOffset = currentX;
      yOffset = currentY;
    }
    
    container.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    
    // Update max-height dynamically to allow vertical expansion
    const availableHeight = window.innerHeight - (120 + currentY) - 10; // 10px margin from bottom
    container.style.maxHeight = Math.max(200, availableHeight) + 'px';
  }
}

const closeBtn = document.getElementById('da-close');
if (closeBtn && container) {
  closeBtn.onclick = () => container.style.display = 'none';
}

// Footer buttons - same functionality as header buttons
const closeBtnFooter = document.getElementById('da-close-footer');
if (closeBtnFooter && container) {
  closeBtnFooter.onclick = () => container.style.display = 'none';
}

const dashboardBtnFooter = document.getElementById('da-dashboard-btn-footer');
if (dashboardBtnFooter) {
  dashboardBtnFooter.onclick = () => {
    const dashboardUrl = chrome.runtime.getURL('deals-dashboard.html');
    window.open(dashboardUrl, '_blank');
  };
}

const coffeeBtnFooter = document.getElementById('da-coffee-btn-footer');
if (coffeeBtnFooter) {
  coffeeBtnFooter.onclick = () => {
    const coffeeModal = document.getElementById('da-coffee-modal');
    if (coffeeModal) coffeeModal.style.display = 'flex';
  };
}

// Settings button handler will be added with the main settings code
// Save deal button handler will be added with the main save deal code

// Coffee button - shows donate modal with Venmo QR code
const coffeeBtn = document.getElementById('da-coffee-btn');
const coffeeModal = document.getElementById('da-coffee-modal');
const coffeeModalClose = document.getElementById('da-coffee-modal-close');
if (coffeeBtn && coffeeModal) {
  coffeeBtn.onclick = () => {
    coffeeModal.style.display = 'flex';
  };
}
if (coffeeModalClose && coffeeModal) {
  coffeeModalClose.onclick = () => {
    coffeeModal.style.display = 'none';
  };
}
// Close coffee modal when clicking overlay
if (coffeeModal) {
  coffeeModal.onclick = (e) => {
    if (e.target === coffeeModal) coffeeModal.style.display = 'none';
  };
}

// Dashboard button - opens deals dashboard in new tab
const dashboardBtn = document.getElementById('da-dashboard-btn');
if (dashboardBtn) {
  dashboardBtn.onclick = () => {
    const dashboardUrl = chrome.runtime.getURL('deals-dashboard.html');
    window.open(dashboardUrl, '_blank');
  };
  
  // Add hover effect
  dashboardBtn.addEventListener('mouseenter', () => {
    dashboardBtn.style.opacity = '1';
  });
  dashboardBtn.addEventListener('mouseleave', () => {
    dashboardBtn.style.opacity = '0.7';
  });
}

// Listen for messages from background script to toggle window
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.type === 'VETTR_NOTIFY_WEB_REFRESH') {
      window.dispatchEvent(new CustomEvent('vettr-deals-changed'));
      sendResponse({ ok: true });
      return true;
    }
    if (request.action === "toggleWindow") {
      const container = document.getElementById('deal-analyzer-container');
      if (container) {
        if (container.style.display === 'none') {
          container.style.display = 'flex';
        } else {
          container.style.display = 'none';
        }
      }
      // Send response to acknowledge message received
      sendResponse({ status: "toggled" });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ status: "error", message: error.message });
  }
  // Return true to indicate we'll send a response asynchronously (though we send it synchronously above)
  return true;
});

// Listen for font size changes from chrome.storage
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.userPreferences?.newValue?.fontSize) {
      const newFontSize = changes.userPreferences.newValue.fontSize || 100;
      console.log('🔤 Font size changed to:', newFontSize + '%');
      const container = document.getElementById('deal-analyzer-container');
      if (container) {
        const scale = newFontSize / 100;
        container.style.setProperty('--font-scale', scale);
      }
    }
  });
}

// --- 3. IMPROVED "SMART" SCRAPING LOGIC ---

// Helper: Converts "$3,000,000" string to 3000000 number
// --- PLATFORM DETECTION & SCRAPING ---

// Detect which platform we're on
function detectPlatform() {
  const url = window.location.href.toLowerCase();
  const hostname = window.location.hostname.toLowerCase();
  
  if (hostname.includes('bizquest.com')) return 'bizquest';
  if (hostname.includes('bizbuysell.com')) return 'bizbuysell';
  if (hostname.includes('crexi.com')) return 'crexi';
  if (hostname.includes('loopnet.com')) return 'loopnet';
  if (hostname.includes('zillow.com')) return 'zillow';
  if (hostname.includes('redfin.com')) return 'redfin';
  if (hostname.includes('realtor.com')) return 'realtor';
  if (hostname.includes('costar.com')) return 'costar';
  
  return 'generic';
}

// Check if current site is a business listing site
function isBusinessListingSite() {
  const platform = detectPlatform();
  // Consider known business listing platforms as business sites
  const businessPlatforms = ['bizquest', 'bizbuysell', 'crexi', 'loopnet'];
  return businessPlatforms.includes(platform);
}

// Auto-open extension if setting is enabled and we're on a business site
function checkAutoOpen() {
  if (!container) return;
  
  chrome.storage.local.get(['userPreferences'], (result) => {
    const prefs = result.userPreferences || userPreferences;
    const shouldAutoOpen = prefs.autoOpenOnBusinessSites && isBusinessListingSite();
    
    if (shouldAutoOpen && container.style.display === 'none') {
      console.log('🚀 Auto-opening extension on business listing site');
      container.style.display = 'flex';
      // Also scrape data when auto-opening
      setTimeout(() => {
        scrapeData();
      }, 500); // Small delay to ensure page content is loaded
    }
  });
}

// Wait for element to appear (for dynamic content)
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    // Check if already exists
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    
    // Set up observer
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Timeout fallback
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Platform-specific scrapers
const platformScrapers = {
  bizquest: function() {
    console.log('🏢 Using BizQuest-specific scraper');
    let data = { askingPrice: 0, ebitda: 0, isSDE: false };
    
    // BizQuest uses specific CSS classes and data attributes
    // Try multiple strategies
    
    // Strategy 1: Look for data-qa attributes (common in React apps)
    const priceEl = document.querySelector('[data-qa*="price"], [data-testid*="price"]');
    if (priceEl) {
      data.askingPrice = parseCurrency(priceEl.innerText);
      console.log('  ✅ Found price via data attribute:', data.askingPrice);
    }
    
    // Strategy 2: Look in detail cards/sections
    const detailSections = document.querySelectorAll('.details-card, .detail-section, .listing-details, [class*="detail"]');
    let sdeValue = 0;
    let ebitdaValue = 0;
    
    for (const section of detailSections) {
      const text = section.innerText || '';
      
      // Check for asking price
      if (!data.askingPrice && /asking price/i.test(text)) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (/asking price/i.test(lines[i]) && lines[i + 1]) {
            data.askingPrice = parseCurrency(lines[i + 1]);
            if (data.askingPrice > 0) {
              console.log('  ✅ Found asking price in details:', data.askingPrice);
              break;
            }
          }
        }
      }
      
      // Check for EBITDA specifically
      if (/\bebitda\b/i.test(text)) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/\bebitda\b/i.test(line) && lines[i + 1]) {
            ebitdaValue = parseCurrency(lines[i + 1]);
            if (ebitdaValue > 0) {
              console.log('  ✅ Found EBITDA in details:', ebitdaValue);
              break;
            }
          }
        }
      }
      
      // Check for SDE/Cash Flow
      if (/cash flow|sde|discretionary earnings/i.test(text)) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if ((/cash flow|sde|discretionary earnings/i.test(line)) && lines[i + 1]) {
            sdeValue = parseCurrency(lines[i + 1]);
            if (sdeValue > 0) {
              console.log('  ✅ Found SDE/Cash Flow in details:', sdeValue);
              break;
            }
          }
        }
      }
    }
    
    // Prefer EBITDA over SDE when both are present
    if (ebitdaValue > 0) {
      data.ebitda = ebitdaValue;
      data.isSDE = false;
      console.log('  ℹ️ Using EBITDA (preferred):', ebitdaValue);
      if (sdeValue > 0) {
        console.log('  ℹ️ Also found SDE (' + sdeValue + ') but using EBITDA');
      }
    } else if (sdeValue > 0) {
      data.ebitda = sdeValue;
      data.isSDE = true;
      console.log('  ℹ️ Using SDE (no EBITDA found):', sdeValue);
    }
    
    // Strategy 3: Try JSON-LD structured data (many listing sites use this)
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        const data_ld = JSON.parse(jsonLd.textContent);
        if (data_ld.offers && data_ld.offers.price) {
          data.askingPrice = parseCurrency(String(data_ld.offers.price));
          console.log('  ✅ Found price in JSON-LD:', data.askingPrice);
        }
      } catch (e) {
        console.log('  ⚠️ Could not parse JSON-LD');
      }
    }
    
    return data;
  },
  
  bizbuysell: function() {
    console.log('🏢 Using BizBuySell-specific scraper (REWRITTEN)');
    let data = { askingPrice: 0, ebitda: 0, isSDE: false };
    let foundEBITDA = false;
    let foundSDE = false;
    
    // BizBuySell uses a consistent pattern: rows with labels and values
    // The page text contains lines like:
    // "Asking Price:"
    // "$1,895,000"
    // "Cash Flow (SDE):"
    // "$424,413"
    // "EBITDA:"
    // "$403,000"
    
    const pageText = document.body.innerText || document.body.textContent || '';
    const lines = pageText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    console.log('  📄 Scanning ' + lines.length + ' lines of text...');
    
    // Scan line by line for patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      
      // Look for "Asking Price:" followed by dollar amount on next line
      if ((lowerLine === 'asking price:' || lowerLine === 'asking price') && nextLine) {
        const price = parseCurrency(nextLine);
        if (price > data.askingPrice) {
          data.askingPrice = price;
          console.log('  ✅ Found Asking Price:', data.askingPrice, '(line', i + ')');
        }
      }
      
      // Look for "EBITDA:" followed by value on next line
      if ((lowerLine === 'ebitda:' || lowerLine === 'ebitda') && nextLine) {
        // Check if next line says "Not Disclosed"
        if (!nextLine.toLowerCase().includes('not disclosed') && !nextLine.toLowerCase().includes('n/a')) {
          const ebitdaVal = parseCurrency(nextLine);
          if (ebitdaVal > 0) {
            foundEBITDA = true;
            data.ebitda = ebitdaVal;
            data.isSDE = false;
            console.log('  ✅ Found EBITDA:', data.ebitda, '(line', i + ')');
          }
        } else {
          console.log('  ⚠️ EBITDA is "Not Disclosed" (line', i + ')');
        }
      }
      
      // Look for "Cash Flow (SDE):" or similar patterns
      if ((lowerLine.includes('cash flow') && (lowerLine.includes('sde') || lowerLine.includes(':'))) && nextLine) {
        // Check if next line says "Not Disclosed"
        if (!nextLine.toLowerCase().includes('not disclosed') && !nextLine.toLowerCase().includes('n/a')) {
          const sdeVal = parseCurrency(nextLine);
          // Only use SDE if EBITDA wasn't found
          if (sdeVal > 0) {
            foundSDE = true;
            if (!foundEBITDA && data.ebitda === 0) {
              data.ebitda = sdeVal;
              data.isSDE = true;
              console.log('  ✅ Found Cash Flow (SDE):', data.ebitda, '(line', i + ')');
            } else if (data.ebitda > 0) {
              console.log('  ℹ️ Found Cash Flow (SDE):', sdeVal, 'but already have EBITDA, skipping');
            }
          }
        } else {
          console.log('  ⚠️ Cash Flow (SDE) is "Not Disclosed" (line', i + ')');
        }
      }
      
      // Also check for inline patterns like "Asking Price: $1,000,000" on same line
      if (lowerLine.includes('asking price') && lowerLine.includes('$')) {
        const price = parseCurrency(line);
        if (price > data.askingPrice) {
          data.askingPrice = price;
          console.log('  ✅ Found Asking Price (inline):', data.askingPrice);
        }
      }
      
      if (lowerLine.includes('ebitda') && lowerLine.includes('$')) {
        if (!lowerLine.includes('not disclosed')) {
          const ebitdaVal = parseCurrency(line);
          if (ebitdaVal > 0) {
            foundEBITDA = true;
            data.ebitda = ebitdaVal;
            data.isSDE = false;
            console.log('  ✅ Found EBITDA (inline):', data.ebitda);
          }
        }
      }
    }
    
    // CRITICAL: If we found EBITDA at any point, ensure isSDE is false
    // This handles cases where SDE might be processed after EBITDA in the loop
    if (foundEBITDA) {
      data.isSDE = false;
      console.log('  🔒 EBITDA was found - ensuring isSDE = false');
    }
    
    console.log('  📊 Scrape results: Asking=' + (data.askingPrice || 'NOT FOUND') + ', EBITDA/SDE=' + (data.ebitda || 'NOT FOUND') + (data.isSDE ? ' (SDE)' : ' (EBITDA)'));
    return data;
  },
  
  crexi: function() {
    console.log('🏢 Using Crexi-specific scraper');
    let data = { askingPrice: 0, ebitda: 0, isSDE: false };
    
    // Crexi is a commercial real estate platform
    // Look for price in header or summary section
    const priceSelectors = [
      '[class*="price"]',
      '[class*="Price"]',
      '.listing-price',
      '.property-price'
    ];
    
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el && !data.askingPrice) {
        const price = parseCurrency(el.innerText);
        if (price > 10000) { // Sanity check
          data.askingPrice = price;
          console.log('  ✅ Found price via selector', selector, ':', price);
          break;
        }
      }
    }
    
    // Look for financials in details/metrics section
    const metricSections = document.querySelectorAll('[class*="metric"], [class*="financial"], [class*="detail"]');
    for (const section of metricSections) {
      const text = section.innerText || '';
      const lines = text.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        
        // NOI (Net Operating Income) is common in commercial real estate
        if (line.includes('noi') || line.includes('net operating income')) {
          const value = parseCurrency(lines[i + 1] || lines[i]);
          if (value > 0 && !data.ebitda) {
            data.ebitda = value;
            data.isSDE = false;
            console.log('  ✅ Found NOI (using as EBITDA):', value);
          }
        }
        
        if (line.includes('ebitda')) {
          const value = parseCurrency(lines[i + 1] || lines[i]);
          if (value > 0) {
            data.ebitda = value;
            data.isSDE = false;
            console.log('  ✅ Found EBITDA:', value);
          }
        }
        
        if (line.includes('cash flow') || line.includes('sde')) {
          const value = parseCurrency(lines[i + 1] || lines[i]);
          if (value > 0 && !data.ebitda) {
            data.ebitda = value;
            data.isSDE = true;
            console.log('  ✅ Found Cash Flow/SDE:', value);
          }
        }
      }
    }
    
    return data;
  },
  
  loopnet: function() {
    console.log('🏢 Using LoopNet-specific scraper');
    let data = { askingPrice: 0, ebitda: 0, isSDE: false };
    
    // LoopNet is owned by CoStar - commercial real estate
    // Look for price in prominent display
    const priceSelectors = [
      '[data-testid="price"]',
      '.price-section',
      '[class*="asking-price"]',
      '[class*="AskingPrice"]'
    ];
    
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el && !data.askingPrice) {
        const price = parseCurrency(el.innerText);
        if (price > 10000) {
          data.askingPrice = price;
          console.log('  ✅ Found price via selector', selector, ':', price);
          break;
        }
      }
    }
    
    // Look for financial details
    const detailRows = document.querySelectorAll('.property-detail-row, [class*="detail-row"], tr');
    for (const row of detailRows) {
      const text = row.innerText?.toLowerCase() || '';
      
      if (text.includes('asking price') && !data.askingPrice) {
        data.askingPrice = parseCurrency(row.innerText);
        if (data.askingPrice > 0) {
          console.log('  ✅ Found asking price:', data.askingPrice);
        }
      }
      
      if (text.includes('noi') || text.includes('net operating income')) {
        const value = parseCurrency(row.innerText);
        if (value > 0 && !data.ebitda) {
          data.ebitda = value;
          data.isSDE = false;
          console.log('  ✅ Found NOI:', value);
        }
      }
      
      if (text.includes('ebitda')) {
        const value = parseCurrency(row.innerText);
        if (value > 0) {
          data.ebitda = value;
          data.isSDE = false;
          console.log('  ✅ Found EBITDA:', value);
        }
      }
    }
    
    return data;
  },
  
  zillow: function() {
    console.log('🏢 Using Zillow-specific scraper');
    let data = { askingPrice: 0, ebitda: 0, isSDE: false };
    
    // Zillow is primarily residential, but has commercial listings
    // Price is usually prominent in header
    const priceSelectors = [
      '[data-testid="price"]',
      '.ds-summary-row span',
      '[class*="price"]'
    ];
    
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el && !data.askingPrice) {
        const price = parseCurrency(el.innerText);
        if (price > 10000) {
          data.askingPrice = price;
          console.log('  ✅ Found price via selector', selector, ':', price);
          break;
        }
      }
    }
    
    // Zillow doesn't typically show EBITDA for residential
    // But may have it for commercial/business properties
    const facts = document.querySelectorAll('.ds-home-fact-list li, [class*="fact"]');
    for (const fact of facts) {
      const text = fact.innerText?.toLowerCase() || '';
      if (text.includes('annual income') || text.includes('gross income')) {
        const value = parseCurrency(fact.innerText);
        if (value > 0) {
          data.ebitda = value;
          data.isSDE = false;
          console.log('  ✅ Found annual income:', value);
        }
      }
    }
    
    return data;
  },
  
  redfin: function() {
    console.log('🏢 Using Redfin-specific scraper');
    let data = { askingPrice: 0, ebitda: 0, isSDE: false };
    
    // Redfin structure - price in header
    const priceSelectors = [
      '.home-main-stats .statsValue',
      '[data-rf-test-name="abp-price"]',
      '.price'
    ];
    
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el && !data.askingPrice) {
        const price = parseCurrency(el.innerText);
        if (price > 10000) {
          data.askingPrice = price;
          console.log('  ✅ Found price via selector', selector, ':', price);
          break;
        }
      }
    }
    
    return data;
  }
};

function parseCurrency(str) {
  if (!str) return 0;
  
  // Check for "Not Disclosed", "N/A", "Undisclosed", etc.
  if (/not\s+disclosed|undisclosed|n\/a|not\s+available|confidential/i.test(str)) {
    console.log('  ⚠️ Value is not disclosed:', str);
    return 0;
  }
  
  // Handle abbreviated formats like "1.5M", "500K", "2.3B"
  const abbrevMatch = str.match(/([\d,.]+)\s*([MmKkBb])\b/);
  if (abbrevMatch) {
    const num = parseFloat(abbrevMatch[1].replace(/,/g, ''));
    const multiplier = abbrevMatch[2].toUpperCase();
    if (multiplier === 'K') return Math.round(num * 1000);
    if (multiplier === 'M') return Math.round(num * 1000000);
    if (multiplier === 'B') return Math.round(num * 1000000000);
  }
  
  // Find all potential currency values in the string
  // Prioritize formatted numbers with commas (e.g., $400,000)
  const formattedNumbers = str.match(/\$?\s*(\d{1,3}(?:,\d{3})+)/g);
  if (formattedNumbers && formattedNumbers.length > 0) {
    // Extract the largest formatted number (most likely the main value)
    let maxValue = 0;
    for (const formatted of formattedNumbers) {
      const numStr = formatted.replace(/[$,]/g, '');
      const num = parseInt(numStr);
      if (num > maxValue) maxValue = num;
    }
    if (maxValue > 0) return maxValue;
  }
  
  // Handle standard formats: $1,000 or 100,000 or $1000000
  // Find all numbers and take the largest one (to avoid matching small numbers like years)
  const allNumbers = str.match(/\$?\s*(\d{1,3}(?:,\d{3})*|\d+)/g);
  if (allNumbers && allNumbers.length > 0) {
    let maxValue = 0;
    for (const numStr of allNumbers) {
      const cleanNum = numStr.replace(/[$,]/g, '');
      const num = parseInt(cleanNum);
      // Prefer numbers >= 1000 (to filter out years, IDs, etc.)
      if (num >= 1000 && num > maxValue) {
        maxValue = num;
      }
    }
    // If we found a large number, return it
    if (maxValue > 0) return maxValue;
    // Otherwise, return the largest number found (even if < 1000)
    if (allNumbers.length > 0) {
      const largest = Math.max(...allNumbers.map(n => parseInt(n.replace(/[$,]/g, ''))));
      return largest;
    }
  }
  
  return 0;
}

// Helper: Finds a value on the page by looking for its label
function findValueByLabel(keywords) {
  // We look at all common text containers
  const candidates = document.querySelectorAll('b, strong, span, p, div, td, dt, h4, h5, h3, h2, label, [class*="label"], [class*="field"]');

  console.log(`🔍 Searching for keywords:`, keywords);
  let foundElements = [];

  for (const el of candidates) {
    // CRITICAL: Skip elements inside the Vettr container to avoid false positives
    if (el.closest('#deal-analyzer-container')) {
      continue;
    }
    
    const text = el.innerText?.trim().toLowerCase();
    if (!text) continue;
    
    const labelFound = keywords.some(k => {
      const keyword = k.toLowerCase();
      // Match: exact match, starts with keyword, or contains keyword (if short enough)
      return text === keyword || 
             text.startsWith(keyword + ":") || 
             text.startsWith(keyword + " ") ||
             text === keyword + ":" ||
             (text.includes(keyword) && text.length < keyword.length + 100);
    });

    if (labelFound) {
      console.log(`✅ Found label "${text}" matching keywords:`, keywords);
      foundElements.push(el);
      
      // STRATEGY A: The value is in the next sibling element (e.g., <b>Price:</b> <span>$100</span>)
      let sibling = el.nextElementSibling;
      if (sibling) {
        const siblingText = sibling.innerText?.trim();
        console.log(`  → Checking next sibling: "${siblingText}"`);
        if (siblingText && siblingText.match(/\$|[\d,]+/)) {
          const value = parseCurrency(siblingText);
          console.log(`  → Strategy A (next sibling): "${siblingText}" = ${value}`);
          if (value > 0) return value;
        }
      }

      // STRATEGY B: The value is inside the parent's text (e.g., <p><b>Price:</b> $100</p>)
      if (el.parentElement) {
        const parentText = el.parentElement.innerText;
        console.log(`  → Parent element text (first 200 chars): "${parentText.substring(0, 200)}..."`);
        // Remove the label itself to isolate the number
        const cleanParent = parentText.replace(el.innerText, "");
        if (cleanParent.match(/\$|[\d,]+/)) {
          const value = parseCurrency(cleanParent);
          console.log(`  → Strategy B (parent text): first $ value found = ${value}`);
          if (value > 0) return value;
        }
      }

      // STRATEGY C: The value is in the same element? (e.g. <div>Price: $100</div>)
      if (el.innerText.match(/\$|[\d,]+/)) {
        const value = parseCurrency(el.innerText);
        console.log(`  → Strategy C (same element): "${el.innerText}" = ${value}`);
        if (value > 0) return value;
      }
      
      // STRATEGY D: Check for data attributes (React/Vue apps often use these)
      if (el.dataset) {
        for (const [key, val] of Object.entries(el.dataset)) {
          if (val && typeof val === 'string' && val.match(/\d/)) {
            const value = parseCurrency(val);
            console.log(`  → Strategy D (data-${key}): "${val}" = ${value}`);
            if (value > 0) return value;
          }
        }
      }
      
      // STRATEGY E: Check next <td> if in a table
      if (el.tagName === 'TD' || el.tagName === 'TH') {
        const nextTd = el.nextElementSibling;
        if (nextTd && (nextTd.tagName === 'TD' || nextTd.tagName === 'TH')) {
          const value = parseCurrency(nextTd.innerText);
          console.log(`  → Strategy E (next table cell): "${nextTd.innerText}" = ${value}`);
          if (value > 0) return value;
        }
      }
      
      console.log(`  ⚠️ Label found but no dollar value extracted`);
    }
  }
  
  console.log(`❌ No match found for keywords:`, keywords);
  console.log(`   Found ${foundElements.length} elements with matching labels but no valid values`);
  return 0; // Not found
}

// Helper: Scrape broker information from the page
function scrapeBrokerInfo() {
  console.log('👔 Starting scrapeBrokerInfo...');
  
  const brokerInfo = {
    name: '',
    company: '',
    phone: '',
    email: ''
  };
  
  // Common broker keywords and patterns
  const brokerKeywords = [
    'broker', 'agent', 'listing agent', 'representative', 'advisor',
    'contact', 'intermediary', 'business broker', 'representing'
  ];
  
  // Try to find broker information in various ways
  try {
    // Method 1: Look for structured contact information
    const allText = document.body.innerText || document.body.textContent || '';
    
    // Extract email addresses
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const emails = allText.match(emailPattern) || [];
    
    // Extract phone numbers (various formats)
    const phonePattern = /(\+?1?\s*\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g;
    const phones = allText.match(phonePattern) || [];
    
    // Method 2: Look for specific selectors by platform
    const platform = detectPlatform();
    
    // BizBuySell specific selectors
    if (platform === 'bizbuysell') {
      const brokerNameEl = document.querySelector('.broker-name, .agent-name, [class*="broker"] [class*="name"]');
      if (brokerNameEl) brokerInfo.name = brokerNameEl.innerText.trim();
      
      const brokerCompanyEl = document.querySelector('.broker-company, .brokerage-name, [class*="broker"] [class*="company"]');
      if (brokerCompanyEl) brokerInfo.company = brokerCompanyEl.innerText.trim();
    }
    
    // BizQuest specific selectors
    if (platform === 'bizquest') {
      const brokerNameEl = document.querySelector('[class*="broker-name"], [class*="agent-name"]');
      if (brokerNameEl) brokerInfo.name = brokerNameEl.innerText.trim();
      
      const brokerCompanyEl = document.querySelector('[class*="broker-company"], [class*="firm-name"]');
      if (brokerCompanyEl) brokerInfo.company = brokerCompanyEl.innerText.trim();
    }
    
    // Method 3: Generic search - look for elements containing broker keywords
    if (!brokerInfo.name) {
      const allElements = document.querySelectorAll('div, span, p, td, th');
      
      for (const el of allElements) {
        const text = el.innerText?.trim() || '';
        const textLower = text.toLowerCase();
        
        // Skip if too long (likely not a name/company)
        if (text.length > 100) continue;
        
        // Look for broker/agent labels
        if (brokerKeywords.some(keyword => textLower.includes(keyword))) {
          // Check if next sibling or nearby element has the actual name/company
          const nextSibling = el.nextElementSibling;
          if (nextSibling && nextSibling.innerText) {
            const potentialInfo = nextSibling.innerText.trim();
            
            if (!brokerInfo.name && potentialInfo.length < 50 && potentialInfo.length > 2) {
              // Likely a name (check if it has typical name characteristics)
              if (/^[A-Z][a-z]+(\s[A-Z][a-z]+)+$/.test(potentialInfo)) {
                brokerInfo.name = potentialInfo;
                console.log('  Found broker name via generic search:', potentialInfo);
              }
            }
            
            if (!brokerInfo.company && /\b(LLC|Inc|Corp|Company|Group|Realty|Brokers)\b/i.test(potentialInfo)) {
              brokerInfo.company = potentialInfo;
              console.log('  Found broker company via generic search:', potentialInfo);
            }
          }
          
          // Also check the element itself for company names
          if (!brokerInfo.company && /\b(LLC|Inc|Corp|Company|Group|Realty|Brokers)\b/i.test(text)) {
            brokerInfo.company = text;
            console.log('  Found broker company in element:', text);
          }
        }
      }
    }
    
    // Method 4: Extract from meta tags or structured data
    const metaTags = document.querySelectorAll('meta[property], meta[name]');
    for (const meta of metaTags) {
      const property = meta.getAttribute('property') || meta.getAttribute('name') || '';
      const content = meta.getAttribute('content') || '';
      
      if (property.includes('author') || property.includes('broker') || property.includes('agent')) {
        if (!brokerInfo.name && content.length < 50) {
          brokerInfo.name = content;
        }
      }
    }
    
    // Populate email and phone from first valid matches
    if (emails.length > 0 && !brokerInfo.email) {
      // Filter out generic emails
      const validEmail = emails.find(email => 
        !email.includes('noreply') && 
        !email.includes('support@') &&
        !email.includes('info@') &&
        !email.includes('admin@')
      );
      if (validEmail) {
        brokerInfo.email = validEmail;
        console.log('  Found broker email:', validEmail);
      }
    }
    
    if (phones.length > 0 && !brokerInfo.phone) {
      brokerInfo.phone = phones[0].trim();
      console.log('  Found broker phone:', phones[0]);
    }
    
  } catch (error) {
    console.error('❌ Error in scrapeBrokerInfo:', error);
  }
  
  console.log('👔 Broker info scraping complete:', brokerInfo);
  return brokerInfo;
}

let scrapeCallCount = 0;
let lastScrapedURL = null;
let scrapeInProgress = false;
let lastScrapeTime = 0;

function scrapeData() {
  try {
    const currentURL = window.location.href;
    const now = Date.now();
    
    // Detect if URL changed (new listing)
    const urlChanged = currentURL !== lastScrapedURL;
    
    // Prevent duplicate scrapes on the same page within 2 seconds
    if (currentURL === lastScrapedURL && (now - lastScrapeTime) < 2000) {
      console.log('⏳ Skipping duplicate scrape (same page, within 2 seconds)');
      return;
    }
    
    // Prevent concurrent scrapes
    if (scrapeInProgress) {
      console.log('⏳ Skipping - scrape already in progress');
      return;
    }
    
    scrapeInProgress = true;
    scrapeCallCount++;
    console.log(`🔄 Starting scrapeData... (Call #${scrapeCallCount})`);
    console.log('📍 Current URL:', currentURL);
    
    // Clear Deal Name if URL changed (new listing)
    if (urlChanged) {
      const dealNameField = document.getElementById('da-deal-name');
      if (dealNameField) {
        dealNameField.value = '';
        console.log('🔄 URL changed - cleared Deal Name field for auto-fill');
      }
    }
    
    // Track this scrape
    lastScrapedURL = currentURL;
    lastScrapeTime = now;
    
    // Detect platform
    const platform = detectPlatform();
    console.log('🏢 Platform detected:', platform);
    
    let askingPrice = 0;
    let ebitdaVal = 0;
    let isSDE = false;
    let ebitdaFoundByPlatform = false; // Track if EBITDA was found by platform scraper
    
    // Scrape broker information
    const brokerInfo = scrapeBrokerInfo();
    console.log('👔 Broker info scraped:', brokerInfo);
    
    // Try platform-specific scraper first
    if (platformScrapers[platform]) {
      console.log(`🎯 Attempting ${platform}-specific scraper...`);
      const platformData = platformScrapers[platform]();
      
      if (platformData.askingPrice > 0) {
        askingPrice = platformData.askingPrice;
        console.log('✅ Platform scraper found asking price:', askingPrice);
      }
      
      if (platformData.ebitda > 0) {
        ebitdaVal = platformData.ebitda;
        isSDE = platformData.isSDE;
        ebitdaFoundByPlatform = !platformData.isSDE; // True if EBITDA was found (not SDE)
        console.log('✅ Platform scraper found EBITDA/SDE:', ebitdaVal, isSDE ? '(SDE)' : '(EBITDA)');
        // Trust the platform scraper's determination - it already checks for "Not Disclosed"
      }
    }
    
    // Fallback to generic scraper if platform scraper didn't find values
    if (askingPrice === 0) {
      console.log('\n💰 Platform scraper didn\'t find price, trying generic scraper...');
      askingPrice = findValueByLabel(["Asking Price", "Price", "Purchase Price", "Sale Price", "List Price"]);
      console.log('💰 Generic scraper - Asking Price found:', askingPrice);
    }
    
    if (ebitdaVal === 0) {
      console.log('\n📊 Platform scraper didn\'t find EBITDA, trying generic scraper...');
      
      // ALWAYS prefer EBITDA over SDE when both are present
      // Priority 1: Look for explicit "EBITDA" first (most accurate for M&A)
      const ebitdaValue = findValueByLabel(["EBITDA"]);
      
      // Priority 2: Look for Cash Flow / SDE as backup
      const sdeValue = findValueByLabel(["Cash Flow", "Cash Flow (SDE)", "SDE", "Seller Discretionary Earnings", "Discretionary Earnings", "Seller's Discretionary Earnings", "Net Operating Income", "NOI"]);
      
      // Prefer EBITDA if found, otherwise use SDE
      if (ebitdaValue > 0) {
        ebitdaVal = ebitdaValue;
        isSDE = false; // EBITDA found - never treat as SDE
        ebitdaFoundByPlatform = true; // Mark that we found EBITDA
        console.log('✅ Found EBITDA (preferred):', ebitdaVal);
        if (sdeValue > 0) {
          console.log('   ℹ️ Also found SDE (' + sdeValue + ') but using EBITDA instead');
        }
      } else if (sdeValue > 0) {
        ebitdaVal = sdeValue;
        isSDE = true; // Only set to true if EBITDA was NOT found
        console.log('✅ Found SDE/Cash Flow (no EBITDA available):', ebitdaVal);
      } else {
        console.log('⚠️ No EBITDA or SDE found');
      }
    }
    
    // Trust the platform scraper's determination of EBITDA vs SDE
    // The platform scraper already has logic to prefer EBITDA when both are present
    if (ebitdaFoundByPlatform) {
      isSDE = false;
      console.log('✅ Platform scraper found EBITDA - isSDE = false');
    }
    
    // Store results for diagnostics
    const businessDescription = scrapeBusinessDescription(platform);
    lastScrapeData = {
      platform: platform,
      askingPrice: askingPrice,
      ebitda: ebitdaVal,
      isSDE: isSDE,
      brokerInfo: brokerInfo,
      description: businessDescription,
      timestamp: new Date().toISOString()
    };

    // 3. Update Inputs with formatted numbers (with $ for currency fields)
    const askingField = document.getElementById('da-asking');
    if (askingPrice > 0 && askingField) {
        askingField.value = '$' + formatNumber(askingPrice);
        console.log('✅ Updated Asking Price field:', askingField.value);
    } else {
        console.log('⚠️ No asking price to update');
    }

    const ebitdaField = document.getElementById('da-ebitda');
    const sdeWarning = document.getElementById('da-sde-warning');
    
    // Always start by hiding the warning - only show if SDE is detected
    if (sdeWarning) sdeWarning.classList.remove('visible');
    
    if (ebitdaVal > 0 && ebitdaField) {
        // Show warning and subtract $200k ONLY when SDE/Cashflow present but no EBITDA
        if (isSDE) {
            // SDE or Cashflow found, no EBITDA - show warning and subtract $200k for owner salary
            console.log('⚠️ SDE detected - subtracting $200k for owner salary');
            console.log(`   Original SDE: $${formatNumber(ebitdaVal)} → After: $${formatNumber(Math.max(0, ebitdaVal - 200000))}`);
            if (sdeWarning) sdeWarning.classList.add('visible');
            ebitdaVal = Math.max(0, ebitdaVal - 200000);
            ebitdaField.value = '$' + formatNumber(ebitdaVal);
            lastScrapeData.ebitda = ebitdaVal;
        } else {
            // EBITDA present - don't show warning, don't subtract
            ebitdaField.value = '$' + formatNumber(ebitdaVal);
            console.log('✅ Using EBITDA:', ebitdaField.value);
        }
        lastScrapeData.isSDE = isSDE;
    } else {
        console.log('⚠️ No EBITDA/SDE value to update');
    }
    
    // Auto-fill Deal Name if empty
    const dealNameField = document.getElementById('da-deal-name');
    if (dealNameField && !dealNameField.value.trim()) {
      const businessName = getBusinessName();
      if (businessName && businessName !== 'Deal-Analysis') {
        dealNameField.value = businessName;
        console.log('✅ Auto-filled Deal Name:', businessName);
      }
    }
    
    // Log scraping summary
    console.log('\n📋 SCRAPING SUMMARY:');
    console.log('   Platform:', platform);
    console.log('   Asking Price:', askingPrice > 0 ? '$' + formatNumber(askingPrice) : 'Not found');
    console.log('   EBITDA/SDE:', ebitdaVal > 0 ? '$' + formatNumber(ebitdaVal) + (isSDE ? ' (SDE)' : ' (EBITDA)') : 'Not found');

    console.log('🏁 Scraping complete, triggering calculation...');
    calculate();
    
    console.log('');
    scrapeInProgress = false;
  } catch (error) {
    console.error('❌ Error in scrapeData:', error);
    scrapeInProgress = false;
  }
}

// Helper: Parse number from formatted string (removes commas and $)
function parseNumber(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[,$]/g, '');
  return parseFloat(cleaned) || 0;
}

// Helper: Safely get element value (handles null/undefined)
function safeGetValue(id, defaultValue = '') {
  const element = document.getElementById(id);
  return element ? (element.value || defaultValue) : defaultValue;
}

// Helper: Safely get element text content (handles null/undefined)
function safeGetText(id, defaultValue = '') {
  const element = document.getElementById(id);
  return element ? (element.innerText || defaultValue) : defaultValue;
}

// Helper: Format number with commas
function formatNumber(n) {
  if (userPreferences.compactFormat) {
    return formatCompact(n);
  }
  
  // Use i18n currency formatting if available
  if (window.i18n && userPreferences.currency) {
    const locale = window.i18n.getLocaleForCurrency(userPreferences.currency);
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  }
  
  return n.toLocaleString(undefined, {maximumFractionDigits:0});
}

// Helper: Format number in compact form (1.2M, 500K, etc.)
function formatCompact(n) {
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + 'M';
  } else if (n >= 1000) {
    return (n / 1000).toFixed(0) + 'K';
  }
  return n.toFixed(0);
}

// Helper: Format currency with commas (handles negative numbers)
function fmt(n) {
  if (n < 0) {
    // Use i18n for negative numbers
    if (window.i18n && userPreferences.currency) {
      return "-" + window.i18n.formatCurrency(Math.abs(n));
    }
    return "-$" + formatNumber(Math.abs(n));
  }
  
  // Use i18n for positive numbers
  if (window.i18n && userPreferences.currency) {
    return window.i18n.formatCurrency(n);
  }
  
  return "$" + formatNumber(n);
}

// Helper: Calculate Deal Quality Score (0-100)
function calculateDealQualityScore(askingPrice, maxPrice, cocReturn, paybackPeriod) {
  let score = 0;
  
  // Component 1: Price Score (40 points)
  // Perfect score if asking <= max, lose points as asking exceeds max
  if (maxPrice > 0) {
    const priceRatio = askingPrice / maxPrice;
    if (priceRatio <= 1.0) {
      score += 40; // Perfect score if at or below max
    } else if (priceRatio <= 1.1) {
      score += 30; // 10% above max = 30 points
    } else if (priceRatio <= 1.2) {
      score += 20; // 20% above max = 20 points
    } else if (priceRatio <= 1.3) {
      score += 10; // 30% above max = 10 points
    }
    // else 0 points if >30% above max
  }
  
  // Component 2: Cash-on-Cash Return Score (35 points)
  // Compare to target COC
  const targetCOC = userPreferences.targetCOC;
  if (cocReturn >= targetCOC * 1.5) {
    score += 35; // 50% above target = perfect
  } else if (cocReturn >= targetCOC) {
    score += 30; // At or above target = great
  } else if (cocReturn >= targetCOC * 0.75) {
    score += 20; // 75% of target = okay
  } else if (cocReturn >= targetCOC * 0.5) {
    score += 10; // 50% of target = poor
  }
  // else 0 points if < 50% of target
  
  // Component 3: Payback Period Score (25 points)
  // Compare to target payback
  const targetPayback = userPreferences.targetPayback;
  if (paybackPeriod > 0 && paybackPeriod < 100) {
    if (paybackPeriod <= targetPayback * 0.75) {
      score += 25; // 25% faster than target = perfect
    } else if (paybackPeriod <= targetPayback) {
      score += 20; // At or better than target = great
    } else if (paybackPeriod <= targetPayback * 1.5) {
      score += 15; // Within 50% of target = okay
    } else if (paybackPeriod <= targetPayback * 2) {
      score += 5; // Within 2x target = poor
    }
  }
  // else 0 points if no valid payback
  
  return Math.round(score);
}

// Helper: Update Deal Quality Banner
function updateDealQualityBanner(score, askingPrice, maxPrice, cocReturn, paybackPeriod) {
  const badge = document.getElementById('da-quality-badge');
  const text = document.getElementById('da-quality-text');
  const scoreDisplay = document.getElementById('da-quality-score');
  const banner = document.getElementById('da-quality-banner');
  
  if (!badge || !text || !scoreDisplay || !banner) return;
  
  scoreDisplay.innerText = score;
  
  if (score >= 80) {
    badge.innerText = '🟢';
    text.innerText = 'Excellent Deal';
    text.style.color = '#27ae60';
    scoreDisplay.style.color = '#27ae60';
    banner.style.borderBottomColor = '#27ae60';
  } else if (score >= 60) {
    badge.innerText = '🟡';
    text.innerText = 'Good Deal';
    text.style.color = '#f39c12';
    scoreDisplay.style.color = '#f39c12';
    banner.style.borderBottomColor = '#f39c12';
  } else if (score >= 40) {
    badge.innerText = '🟠';
    text.innerText = 'Fair Deal';
    text.style.color = '#e67e22';
    scoreDisplay.style.color = '#e67e22';
    banner.style.borderBottomColor = '#e67e22';
  } else {
    badge.innerText = '🔴';
    text.innerText = 'Weak Deal';
    text.style.color = '#e74c3c';
    scoreDisplay.style.color = '#e74c3c';
    banner.style.borderBottomColor = '#e74c3c';
  }
}

// Track which fields have been manually overridden
const overrides = {
  sbaLoan: false,
  downPayment: false,
  sellerNote: false,
  actualPrice: false
};

// --- UPDATE FINANCING SUMMARIES ---
function updateFinancingSummaries() {
  // Update SBA summary
  const sbaPercent = parseFloat(document.getElementById('da-sba-percent').value) || 0;
  const bankRate = parseFloat(document.getElementById('da-bank-rate').value) || 0;
  const bankTerm = parseFloat(document.getElementById('da-bank-term').value) || 0;
  const dscr = parseFloat(document.getElementById('da-dscr').value) || 0;
  document.getElementById('da-sba-summary').innerText = `${sbaPercent}% • ${bankRate}% • ${bankTerm}yr • ${dscr}x DSCR`;
  
  // Update Buyer Equity summary with salary validation
  const downPercent = parseFloat(document.getElementById('da-down-percent').value) || 0;
  const downPayment = parseNumber(document.getElementById('da-down').value) || 0;
  const targetSalary = parseNumber(document.getElementById('da-target-salary').value) || 0;
  const salaryFormatted = targetSalary >= 1000 ? '$' + Math.round(targetSalary / 1000) + 'k' : '$' + targetSalary;
  const downFormatted = downPayment >= 1000 ? '$' + Math.round(downPayment / 1000) + 'k' : '$' + downPayment;
  
  // Check if salary is feasible (only if we have enough data to calculate)
  const ebitda = parseNumber(document.getElementById('da-ebitda').value) || 0;
  const summaryEl = document.getElementById('da-buyer-equity-summary');
  
  if (ebitda > 0 && targetSalary > 0) {
    // Quick calculation of available cash flow
    const bankRateDecimal = (parseFloat(document.getElementById('da-bank-rate').value) || 0) / 100;
    const bankYears = parseFloat(document.getElementById('da-bank-term').value) || 10;
    const actualPrice = parseNumber(document.getElementById('da-actual-price').value) || 0;
    
    if (actualPrice > 0 && bankRateDecimal > 0 && bankYears > 0) {
      const sbaLoanSize = (sbaPercent / 100) * actualPrice;
      const r = bankRateDecimal / 12;
      const n = bankYears * 12;
      const monthlyPayment = sbaLoanSize * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      const sbaAnnualDebtService = monthlyPayment * 12;
      
      // Add seller note debt service if applicable
      const sellerNoteEnabled = document.getElementById('da-seller-note-enabled').checked;
      let sellerAnnualDebtService = 0;
      if (sellerNoteEnabled) {
        const sellerPercent = parseFloat(document.getElementById('da-seller-percent').value) || 0;
        const sellerNoteAmt = (sellerPercent / 100) * actualPrice;
        const sellerRate = (parseFloat(document.getElementById('da-seller-rate').value) || 0) / 100;
        const sellerPaymentType = document.getElementById('da-seller-payment-type').value;
        const sellerStandby = document.getElementById('da-seller-standby').value;
        
        if (sellerNoteAmt > 0 && sellerStandby === 'no') {
          if (sellerPaymentType === 'interest-only') {
            sellerAnnualDebtService = sellerNoteAmt * sellerRate;
          } else {
            const sellerYears = 5;
            const rSeller = sellerRate / 12;
            const nSeller = sellerYears * 12;
            if (rSeller > 0) {
              const monthlySeller = sellerNoteAmt * (rSeller * Math.pow(1 + rSeller, nSeller)) / (Math.pow(1 + rSeller, nSeller) - 1);
              sellerAnnualDebtService = monthlySeller * 12;
            } else {
              sellerAnnualDebtService = sellerNoteAmt / sellerYears;
            }
          }
        }
      }
      
      const totalDebtService = sbaAnnualDebtService + sellerAnnualDebtService;
      const availableCashFlow = ebitda - totalDebtService;
      
      // If salary exceeds available cash flow, make it red and bold
      if (targetSalary > availableCashFlow) {
        summaryEl.innerHTML = `${downPercent}% (${downFormatted}) • <span style="color:#e74c3c; font-weight:700;">${salaryFormatted} salary ⚠️</span>`;
      } else {
        summaryEl.innerText = `${downPercent}% (${downFormatted}) • ${salaryFormatted} salary`;
      }
    } else {
      summaryEl.innerText = `${downPercent}% (${downFormatted}) • ${salaryFormatted} salary`;
    }
  } else {
    summaryEl.innerText = `${downPercent}% (${downFormatted}) • ${salaryFormatted} salary`;
  }
  
  // Update Seller Note summary
  const sellerNoteEnabled = document.getElementById('da-seller-note-enabled').checked;
  const sellerPercent = parseFloat(document.getElementById('da-seller-percent').value) || 0;
  const sellerRate = parseFloat(document.getElementById('da-seller-rate').value) || 0;
  const sellerPaymentType = document.getElementById('da-seller-payment-type').value;
  const sellerStandby = document.getElementById('da-seller-standby').value;
  
  if (sellerNoteEnabled) {
    let summary = `${sellerPercent}% • ${sellerRate}% • ${sellerPaymentType === 'interest-only' ? 'Interest Only' : 'Amortizing'}`;
    if (sellerStandby === 'yes') {
      summary += ' • Standby';
    }
    document.getElementById('da-seller-note-summary').innerText = summary;
    document.getElementById('da-seller-note-summary').style.opacity = '1';
  } else {
    document.getElementById('da-seller-note-summary').innerText = 'Not enabled';
    document.getElementById('da-seller-note-summary').style.opacity = '0.4';
  }
}

// --- 4. FINANCIAL MATH ---
function calculate() {
  // Get Inputs
  const ebitda = parseNumber(document.getElementById('da-ebitda').value) || 0;
  const targetDSCR = parseFloat(document.getElementById('da-dscr').value) || 1.25;
  const bankRate = (parseFloat(document.getElementById('da-bank-rate').value) || 0) / 100;
  const bankYears = parseFloat(document.getElementById('da-bank-term').value) || 10;
  
  // 1. Calculate Max Annual Debt Service the business can afford
  const maxAnnualDebtService = ebitda / targetDSCR;

  // 2. Get percentages
  const sbaPercent = parseFloat(document.getElementById('da-sba-percent').value) || 0;
  const downPercent = parseFloat(document.getElementById('da-down-percent').value) || 0;
  const sellerNoteEnabled = document.getElementById('da-seller-note-enabled').checked;
  const sellerPercent = sellerNoteEnabled ? (parseFloat(document.getElementById('da-seller-percent').value) || 0) : 0;
  
  // Validate that percentages total 100%
  const totalPercent = sbaPercent + downPercent + sellerPercent;
  const percentError = document.getElementById('da-percent-error');
  if (Math.abs(totalPercent - 100) > 0.01) {
    percentError.style.display = 'block';
    percentError.innerHTML = `⚠️ Total percentages must equal 100% (currently ${totalPercent.toFixed(1)}%)`;
  } else {
    percentError.style.display = 'none';
  }
  
  const sellerRate = (parseFloat(document.getElementById('da-seller-rate').value) || 0) / 100;
  const sellerPaymentType = document.getElementById('da-seller-payment-type').value;
  const sellerStandby = document.getElementById('da-seller-standby').value;
  
  // 3. Calculate Debt Service per $1 of Loan for each component
  // Using PMT formula: DS per $1 = -PMT(rate, periods, 1)
  
  // SBA Debt Service per $1
  let sbaDebtServicePer1 = 0;
  if (bankRate > 0 && bankYears > 0) {
    const r = bankRate / 12;
    const n = bankYears * 12;
    // Monthly payment per $1 of loan
    const monthlyPer1 = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    sbaDebtServicePer1 = monthlyPer1 * 12; // Annual
  } else if (bankYears > 0) {
    sbaDebtServicePer1 = 1 / bankYears;
  }
  
  // Seller Note Debt Service per $1 (if enabled)
  let sellerDebtServicePer1 = 0;
  if (sellerNoteEnabled && sellerPercent > 0) {
    if (sellerPaymentType === 'interest-only') {
      sellerDebtServicePer1 = sellerRate;
    } else {
      // Amortizing - assume 5 year term
      const sellerYears = 5;
      const r = sellerRate / 12;
      const n = sellerYears * 12;
      if (r === 0) {
        sellerDebtServicePer1 = 1 / sellerYears;
      } else {
        const monthlyPer1 = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        sellerDebtServicePer1 = monthlyPer1 * 12;
      }
    }
  }
  
  // 4. Calculate Total Debt Service per $1 of Purchase Price
  // Formula: (SBA % × DS per $1 of SBA) + (Seller % × DS per $1 of Seller)
  // NOTE: If seller note is on standby, exclude it from DSCR calculation per SBA lender treatment
  const sellerDebtServiceForDSCR = (sellerStandby === 'yes') ? 0 : sellerDebtServicePer1;
  const totalDebtServicePer1OfPrice = 
    (sbaPercent / 100) * sbaDebtServicePer1 + 
    (sellerPercent / 100) * sellerDebtServiceForDSCR;
  
  // 5. Calculate Max Purchase Price using DSCR methodology
  // Formula: Max Price = EBITDA ÷ (DSCR × Total DS per $1 of Price)
  // Simplified: Max Price = Max Annual Debt Service ÷ Total DS per $1 of Price
  let maxPurchasePrice = 0;
  if (totalDebtServicePer1OfPrice > 0) {
    maxPurchasePrice = maxAnnualDebtService / totalDebtServicePer1OfPrice;
  }
  
  // 5a. Determine Actual Purchase Price
  const askingPrice = parseNumber(document.getElementById('da-asking').value) || 0;
  let actualPurchasePrice;
  let isDealOpportunity = false;
  
  // Check if user has manually overridden the actual price
  if (overrides.actualPrice) {
    actualPurchasePrice = parseNumber(document.getElementById('da-actual-price').value) || askingPrice || maxPurchasePrice;
  } else {
    // Default to Asking Price to show realistic ROI returns
    // User can use "Calculate Target Offer" or manually edit to change it
    if (askingPrice > 0) {
      actualPurchasePrice = askingPrice;
      // Mark as opportunity if asking is below DSCR max
      if (askingPrice < maxPurchasePrice) {
        isDealOpportunity = true;
      }
    } else {
      // Fallback to max if no asking price
      actualPurchasePrice = maxPurchasePrice;
    }
    // Update the field
    document.getElementById('da-actual-price').value = fmt(actualPurchasePrice);
  }
  
  // 6. Calculate component amounts from Actual Purchase Price and percentages
  let sbaLoanSize, downPayment, sellerNoteAmt;
  
  // When actual price is overridden, always recalculate components based on it
  const shouldRecalcComponents = overrides.actualPrice;
  
  if (!overrides.sbaLoan || shouldRecalcComponents) {
    sbaLoanSize = (sbaPercent / 100) * actualPurchasePrice;
    document.getElementById('da-sba-loan').value = fmt(sbaLoanSize);
  } else {
    sbaLoanSize = parseNumber(document.getElementById('da-sba-loan').value) || 0;
  }
  
  if (!overrides.downPayment || shouldRecalcComponents) {
    downPayment = (downPercent / 100) * actualPurchasePrice;
    document.getElementById('da-down').value = fmt(downPayment);
    console.log(`💰 Recalculated Buyer Equity: ${downPercent}% of $${formatNumber(actualPurchasePrice)} = $${formatNumber(downPayment)}`);
  } else {
    downPayment = parseNumber(document.getElementById('da-down').value) || 0;
  }
  
  if (sellerNoteEnabled) {
    if (!overrides.sellerNote || shouldRecalcComponents) {
      sellerNoteAmt = (sellerPercent / 100) * actualPurchasePrice;
      document.getElementById('da-seller-amt').value = fmt(sellerNoteAmt);
    } else {
      sellerNoteAmt = parseNumber(document.getElementById('da-seller-amt').value) || 0;
    }
  } else {
    sellerNoteAmt = 0;
  }

  // Update financing summaries after component amounts are recalculated
  updateFinancingSummaries();

  // 7. Calculate SBA Annual Debt Service (actual payment based on loan size)
  let sbaAnnualDebtService = 0;
  if (sbaLoanSize > 0 && bankRate > 0) {
    const r = bankRate / 12;
    const n = bankYears * 12;
    const monthlyPayment = sbaLoanSize * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    sbaAnnualDebtService = monthlyPayment * 12;
  } else if (sbaLoanSize > 0) {
    sbaAnnualDebtService = sbaLoanSize / bankYears;
  }

  // 8. Calculate Seller Note Annual Debt Service (actual payment based on note amount)
  let sellerAnnualDebtService = 0;
  if (sellerNoteAmt > 0) {
    if (sellerPaymentType === 'interest-only') {
      sellerAnnualDebtService = sellerNoteAmt * sellerRate;
    } else {
      // Amortizing - assume 5 year term
      const sellerYears = 5;
      const r = sellerRate / 12;
      const n = sellerYears * 12;
      if (r === 0) {
        sellerAnnualDebtService = sellerNoteAmt / sellerYears;
      } else {
        const monthly = sellerNoteAmt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        sellerAnnualDebtService = monthly * 12;
      }
    }
  }

  // 9. Total Debt Service (SBA + Seller Note, unless seller note is standby)
  const totalDebtService = sbaAnnualDebtService + (sellerStandby === 'yes' ? 0 : sellerAnnualDebtService);

  // 10. Get Target Salary first
  const targetSalary = parseNumber(document.getElementById('da-target-salary').value) || 0;
  
  // 11. Calculate Free Cash Flow AFTER salary
  // Available Cash Flow = EBITDA - Total Debt Service
  const availableCashFlow = ebitda - totalDebtService;
  
  // Free Cash Flow = Available Cash Flow - Target Salary (can be negative)
  const freeCashFlowAnnual = availableCashFlow - targetSalary;
  const freeCashFlowMonthly = freeCashFlowAnnual / 12;
  
  // Validate that target salary doesn't exceed available cash flow
  const salaryWarning = document.getElementById('da-salary-warning');
  if (targetSalary > availableCashFlow && availableCashFlow > 0) {
    salaryWarning.style.display = 'block';
    salaryWarning.innerHTML = `⚠️ Warning: Target salary ($${formatNumber(targetSalary)}) exceeds available cash flow ($${formatNumber(availableCashFlow)})!`;
  } else {
    salaryWarning.style.display = 'none';
  }
  
  // Total Owner Take-Home = Salary + Remaining Free Cash Flow (can show cash shortfall if negative)
  const totalOwnerTakeHome = targetSalary + freeCashFlowAnnual;

  // 12. Calculate ROI Metrics
  const totalEquityInvested = downPayment;
  
  // Cash-on-Cash Return = Total Owner Take-Home / Total Equity Invested
  // This includes both salary and free cash flow as return on investment
  let cashOnCashReturn = 0;
  if (totalEquityInvested > 0) {
    cashOnCashReturn = (totalOwnerTakeHome / totalEquityInvested) * 100;
  }
  
  // Payback Period = Total Equity Invested / Total Owner Take-Home
  // How long to recover the initial equity investment
  let paybackPeriod = 0;
  if (totalOwnerTakeHome > 0) {
    paybackPeriod = totalEquityInvested / totalOwnerTakeHome;
  }

  // Debug logging
  console.log('=== DSCR Calculation Debug ===');
  console.log('EBITDA:', fmt(ebitda));
  console.log('Target DSCR:', targetDSCR);
  console.log('Max Annual Debt Service:', fmt(maxAnnualDebtService));
  console.log('SBA DS per $1:', sbaDebtServicePer1.toFixed(6));
  console.log('Seller DS per $1:', sellerDebtServicePer1.toFixed(6));
  console.log('Seller Note Standby:', sellerStandby);
  console.log('Seller DS per $1 (for DSCR):', sellerDebtServiceForDSCR.toFixed(6));
  console.log('Total DS per $1 of Price:', totalDebtServicePer1OfPrice.toFixed(6));
  console.log('Max Purchase Price:', fmt(maxPurchasePrice));
  console.log('Asking Price:', fmt(askingPrice));
  console.log('Actual Purchase Price:', fmt(actualPurchasePrice));
  console.log('Deal Opportunity:', isDealOpportunity);
  console.log('SBA Loan Size:', fmt(sbaLoanSize));
  console.log('Down Payment:', fmt(downPayment));
  console.log('Seller Note:', fmt(sellerNoteAmt));
  console.log('SBA Annual Debt Service:', fmt(sbaAnnualDebtService));
  console.log('Seller Annual Debt Service:', fmt(sellerAnnualDebtService));
  console.log('Total Debt Service:', fmt(totalDebtService));
  console.log('Available Cash Flow (EBITDA - Debt):', fmt(availableCashFlow));
  console.log('Target Salary:', fmt(targetSalary));
  console.log('Free Cash Flow AFTER Salary:', fmt(freeCashFlowAnnual));
  console.log('Free Cash Flow Monthly:', fmt(freeCashFlowMonthly));
  console.log('Total Owner Take-Home:', fmt(totalOwnerTakeHome));
  console.log('=== ROI Metrics ===');
  console.log('Total Equity Invested:', fmt(totalEquityInvested));
  console.log('Total Owner Take-Home (Year 1):', fmt(totalOwnerTakeHome));
  console.log('Cash-on-Cash Return:', cashOnCashReturn.toFixed(2) + '%');
  console.log('Payback Period:', paybackPeriod.toFixed(2) + ' years');

  // Display Deal Opportunity Banner
  const dealOpportunityDiv = document.getElementById('da-deal-opportunity');
  const dealSavingsSpan = document.getElementById('da-deal-savings');
  if (isDealOpportunity && dealOpportunityDiv && dealSavingsSpan) {
    const savings = maxPurchasePrice - askingPrice;
    dealOpportunityDiv.style.display = 'block';
    dealSavingsSpan.innerText = `Asking price is ${fmt(savings)} below your max allowable price!`;
  } else if (dealOpportunityDiv) {
    dealOpportunityDiv.style.display = 'none';
  }

  // Display Results
  const maxPriceEl = document.getElementById('da-max-price');
  const maxDebtEl = document.getElementById('da-max-debt');
  const totalDebtEl = document.getElementById('da-total-debt');
  const fcfAnnualEl = document.getElementById('da-fcf-annual');
  const fcfMonthlyEl = document.getElementById('da-fcf-monthly');
  const ownerSalaryEl = document.getElementById('da-owner-salary');
  const maxAvailableEl = document.getElementById('da-max-available');
  
  if (maxPriceEl) maxPriceEl.innerText = fmt(maxPurchasePrice);
  if (maxDebtEl) maxDebtEl.innerText = fmt(maxAnnualDebtService);
  if (totalDebtEl) totalDebtEl.innerText = fmt(totalDebtService);
  
  // Free Cash Flow - color red if negative
  if (fcfAnnualEl) {
    fcfAnnualEl.innerText = fmt(freeCashFlowAnnual);
    fcfAnnualEl.style.color = freeCashFlowAnnual < 0 ? '#e74c3c' : 'var(--result-value)';
  }
  if (fcfMonthlyEl) {
    fcfMonthlyEl.innerText = fmt(freeCashFlowMonthly);
    fcfMonthlyEl.style.color = freeCashFlowMonthly < 0 ? '#e74c3c' : 'var(--text-secondary)';
  }
  
  // Total Owner Take-Home - color red if negative
  if (ownerSalaryEl) {
    ownerSalaryEl.innerText = fmt(totalOwnerTakeHome);
    ownerSalaryEl.style.color = totalOwnerTakeHome < 0 ? '#e74c3c' : 'var(--result-value)';
  }
  
  if (maxAvailableEl) maxAvailableEl.innerText = fmt(availableCashFlow);
  
  // Display ROI Metrics
  const cocElement = document.getElementById('da-coc-return');
  if (cocElement) {
    cocElement.innerText = cashOnCashReturn.toFixed(1) + '%';
    // Color code based on return quality
    if (cashOnCashReturn >= 100) {
      cocElement.style.color = '#27ae60'; // Green for excellent (100%+)
    } else if (cashOnCashReturn >= 50) {
      cocElement.style.color = '#2ecc71'; // Light green for very good (50%+)
    } else if (cashOnCashReturn >= 25) {
      cocElement.style.color = '#f39c12'; // Orange for good (25%+)
    } else if (cashOnCashReturn >= 0) {
      cocElement.style.color = '#e67e22'; // Dark orange for fair (0%+)
    } else {
      cocElement.style.color = '#e74c3c'; // Red for negative
    }
  }
  
  const paybackEl = document.getElementById('da-payback');
  if (paybackEl) {
    if (paybackPeriod > 0 && paybackPeriod < 100) {
      paybackEl.innerText = paybackPeriod.toFixed(1) + ' yrs';
      // Color code based on payback period
      if (paybackPeriod <= 2) {
        paybackEl.style.color = '#27ae60'; // Green for excellent (2yr or less)
      } else if (paybackPeriod <= 4) {
        paybackEl.style.color = '#2ecc71'; // Light green for very good (4yr or less)
      } else if (paybackPeriod <= 6) {
        paybackEl.style.color = '#f39c12'; // Orange for good (6yr or less)
      } else if (paybackPeriod <= 10) {
        paybackEl.style.color = '#e67e22'; // Dark orange for fair (10yr or less)
      } else {
        paybackEl.style.color = '#e74c3c'; // Red for poor (10yr+)
      }
    } else {
      paybackEl.innerText = paybackPeriod >= 100 ? '∞' : 'N/A';
      paybackEl.style.color = 'var(--text-secondary)';
    }
  }

  // Calculate and Update Deal Quality Score
  const dealScore = calculateDealQualityScore(
    askingPrice || actualPurchasePrice, 
    maxPurchasePrice, 
    cashOnCashReturn, 
    paybackPeriod
  );
  updateDealQualityBanner(
    dealScore, 
    askingPrice || actualPurchasePrice, 
    maxPurchasePrice, 
    cashOnCashReturn, 
    paybackPeriod
  );

  saveState();
}

// Check if input field should have $ prefix
function isCurrencyField(id) {
  const currencyFields = ['da-ebitda', 'da-asking', 'da-target-salary', 'da-actual-price', 'da-sba-loan', 'da-down', 'da-seller-amt'];
  return currencyFields.includes(id);
}

// Make readonly field editable when clicked
function makeEditable(fieldId, overrideKey) {
  const field = document.getElementById(fieldId);
  if (field && field.hasAttribute('readonly')) {
    field.removeAttribute('readonly');
    overrides[overrideKey] = true;
    field.focus();
    // Select all text for easy replacement
    field.select();
  }
}

// Format input on blur (add commas and $ for currency fields)
function formatInputOnBlur(e) {
  // Safety check: only process extension's own inputs
  const isExtensionInput = (e.target.id && e.target.id.startsWith('da-')) || 
                          e.target.classList.contains('da-input') || 
                          e.target.classList.contains('da-select');
  if (!isExtensionInput) {
    return; // Don't modify inputs that don't belong to the extension
  }
  
  const val = parseNumber(e.target.value);
  if (val > 0) {
    const formatted = formatNumber(val);
    if (isCurrencyField(e.target.id)) {
      e.target.value = '$' + formatted;
    } else {
      e.target.value = formatted;
    }
  } else if (e.target.value === '' || e.target.value === '0') {
    e.target.value = '';
  }
}

// Remove commas and $ on focus for easier editing
function unformatInputOnFocus(e) {
  // Safety check: only process extension's own inputs
  const isExtensionInput = (e.target.id && e.target.id.startsWith('da-')) || 
                          e.target.classList.contains('da-input') || 
                          e.target.classList.contains('da-select');
  if (!isExtensionInput) {
    return; // Don't modify inputs that don't belong to the extension
  }
  
  e.target.value = e.target.value.replace(/[,$]/g, '');
}

// Live format input as user types (add commas in real-time)
function liveFormatInput(e) {
  // Safety check: only process extension's own inputs
  const isExtensionInput = (e.target.id && e.target.id.startsWith('da-')) || 
                          e.target.classList.contains('da-input') || 
                          e.target.classList.contains('da-select');
  if (!isExtensionInput) {
    return; // Don't modify inputs that don't belong to the extension
  }
  
  console.log('🔢 Live formatting:', e.target.id, 'value:', e.target.value);
  
  // Get current value and cursor position
  const input = e.target;
  const cursorPos = input.selectionStart;
  const oldValue = input.value;
  
  // Don't format if empty
  if (!oldValue || oldValue === '$') {
    return;
  }
  
  // Remove all non-digit characters except decimal point
  let cleanValue = oldValue.replace(/[^\d.]/g, '');
  
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
  const shouldAddDollar = isCurrencyField(input.id) && formatted;
  if (shouldAddDollar) {
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

// --- TARGET OFFER CALCULATOR ---
function calculateTargetOffer() {
  console.log('=== TARGET OFFER CALCULATOR ===');
  
  // Get all inputs
  const ebitda = parseNumber(document.getElementById('da-ebitda').value) || 0;
  const targetSalary = parseNumber(document.getElementById('da-target-salary').value) || 0;
  const askingPrice = parseNumber(document.getElementById('da-asking').value) || 0;
  
  // Get target metrics from user preferences
  const targetCOC = userPreferences.targetCOC || 25; // %
  const targetPaybackYears = userPreferences.targetPayback || 4; // years
  
  // Get financing structure
  const sbaPercent = parseFloat(document.getElementById('da-sba-percent').value) || 0;
  const downPercent = parseFloat(document.getElementById('da-down-percent').value) || 0;
  const sellerNoteEnabled = document.getElementById('da-seller-note-enabled').checked;
  const sellerPercent = sellerNoteEnabled ? (parseFloat(document.getElementById('da-seller-percent').value) || 0) : 0;
  
  const bankRate = (parseFloat(document.getElementById('da-bank-rate').value) || 0) / 100;
  const bankYears = parseFloat(document.getElementById('da-bank-term').value) || 10;
  const targetDSCR = parseFloat(document.getElementById('da-dscr').value) || 1.25;
  
  const sellerRate = (parseFloat(document.getElementById('da-seller-rate').value) || 0) / 100;
  const sellerPaymentType = document.getElementById('da-seller-payment-type').value;
  const sellerStandby = document.getElementById('da-seller-standby').value;
  
  // Validate inputs
  if (ebitda <= 0) {
    alert('Please enter a valid EBITDA value first.');
    return;
  }
  
  if (Math.abs((sbaPercent + downPercent + sellerPercent) - 100) > 0.01) {
    alert('Total financing percentages must equal 100% before calculating target offer.');
    return;
  }
  
  // Update display with current targets (these are shown in the collapsed description)
  // Note: The actual display elements are updated in the subtitle after calculation
  console.log('Target COC:', targetCOC + '%');
  console.log('Target Payback:', targetPaybackYears + ' years');
  
  // CALCULATION STRATEGY (Constraint-Based Approach):
  // 
  // The buyer has THREE hard constraints:
  // 1. LENDER CONSTRAINT: DSCR must be met (EBITDA / Debt Service >= Target DSCR)
  // 2. SALARY CONSTRAINT: Owner must be able to pay themselves (EBITDA - Debt Service >= Salary)
  // 3. EQUITY CONSTRAINT: Buyer puts down X% equity
  //
  // We solve for the MAXIMUM price that satisfies ALL three constraints.
  // Then we calculate what COC return this achieves (it may be higher or lower than target).
  //
  // Math:
  // Let P = Purchase Price
  // Constraint 1 (DSCR): EBITDA / (P * ds) >= targetDSCR
  //                     P <= EBITDA / (targetDSCR * ds)
  //
  // Constraint 2 (Salary): EBITDA - (P * ds) >= Salary
  //                        P * ds <= EBITDA - Salary
  //                        P <= (EBITDA - Salary) / ds
  //
  // Maximum price = MIN(DSCR constraint, Salary constraint)
  // Then calculate: Actual COC = (EBITDA - P*ds) / (P*d) * 100%
  
  // Calculate debt service coefficients (DS per $1 of price)
  let sbaDebtServicePer1 = 0;
  if (bankRate > 0 && bankYears > 0) {
    const r = bankRate / 12;
    const n = bankYears * 12;
    const monthlyPer1 = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    sbaDebtServicePer1 = monthlyPer1 * 12;
  } else if (bankYears > 0) {
    sbaDebtServicePer1 = 1 / bankYears;
  }
  
  let sellerDebtServicePer1 = 0;
  if (sellerNoteEnabled && sellerPercent > 0) {
    if (sellerPaymentType === 'interest-only') {
      sellerDebtServicePer1 = sellerRate;
    } else {
      const sellerYears = 5;
      const r = sellerRate / 12;
      const n = sellerYears * 12;
      if (r === 0) {
        sellerDebtServicePer1 = 1 / sellerYears;
      } else {
        const monthlyPer1 = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        sellerDebtServicePer1 = monthlyPer1 * 12;
      }
    }
  }
  
  // Adjust for standby
  const sellerDebtServiceForCalc = (sellerStandby === 'yes') ? 0 : sellerDebtServicePer1;
  
  // Total debt service per $1 of price
  const totalDebtServicePer1 = 
    (sbaPercent / 100) * sbaDebtServicePer1 + 
    (sellerPercent / 100) * sellerDebtServiceForCalc;
  
  console.log('SBA DS per $1:', sbaDebtServicePer1);
  console.log('Seller DS per $1:', sellerDebtServicePer1);
  console.log('Total DS per $1:', totalDebtServicePer1);
  
  // === CONSTRAINT-BASED CALCULATION ===
  const E = ebitda;
  const S = targetSalary;
  const d = downPercent / 100;
  const ds = totalDebtServicePer1;
  
  if (E <= 0) {
    alert('EBITDA must be greater than 0 to calculate target offer.');
    return;
  }
  
  if (d <= 0) {
    alert('Equity percentage must be greater than 0 to calculate target offer.');
    return;
  }
  
  if (ds <= 0) {
    alert('Cannot calculate with zero debt service. Please check your financing structure.');
    return;
  }
  
  console.log('\n=== CONSTRAINT-BASED CALCULATION ===');
  console.log('EBITDA:', fmt(E));
  console.log('Target Salary:', fmt(S));
  console.log('Equity %:', (d * 100).toFixed(1) + '%');
  console.log('Debt Service per $1:', ds.toFixed(6));
  console.log('Target DSCR:', targetDSCR);
  
  // CONSTRAINT 1: DSCR Requirement (Lender)
  // EBITDA / Debt Service >= Target DSCR
  // EBITDA / (P * ds) >= targetDSCR
  // P <= EBITDA / (targetDSCR * ds)
  const maxPriceFromDSCR = E / (targetDSCR * ds);
  console.log('\n📊 CONSTRAINT 1 (DSCR):');
  console.log('   Max price (DSCR-based):', fmt(maxPriceFromDSCR));
  
  // CONSTRAINT 2: Salary Coverage (Owner needs to live)
  // EBITDA - Debt Service >= Salary
  // EBITDA - (P * ds) >= Salary
  // P <= (EBITDA - Salary) / ds
  let maxPriceFromSalary = Infinity;
  if (S > 0) {
    if (E <= S) {
      alert('❌ Cannot Calculate Target Offer\n\nEBITDA ($' + formatNumber(E) + ') is less than or equal to your target salary ($' + formatNumber(S) + ').\n\nThere is no room for debt service.\n\nOptions:\n• Lower target salary\n• Find a business with higher EBITDA');
      return;
    }
    maxPriceFromSalary = (E - S) / ds;
    console.log('\n💰 CONSTRAINT 2 (Salary):');
    console.log('   Cash available for debt service:', fmt(E - S));
    console.log('   Max price (Salary-based):', fmt(maxPriceFromSalary));
  } else {
    console.log('\n💰 CONSTRAINT 2 (Salary): No salary requirement');
  }
  
  // CONSTRAINT 3: Target COC Return
  // COC = (EBITDA - Debt Service) / Equity
  // targetCOC/100 = (E - P*ds) / (P*d)
  // targetCOC/100 * P * d = E - P*ds
  // P * (targetCOC/100 * d + ds) = E
  // P = E / (targetCOC/100 * d + ds)
  const cocDecimal = targetCOC / 100;
  const maxPriceFromCOC = E / (cocDecimal * d + ds);
  console.log('\n🎯 CONSTRAINT 3 (Target COC):');
  console.log('   Target COC:', targetCOC + '%');
  console.log('   Max price (COC-based):', fmt(maxPriceFromCOC));
  
  // CONSTRAINT 4: Asking Price (Never recommend higher than asking)
  let maxPriceFromAsking = Infinity;
  if (askingPrice > 0) {
    maxPriceFromAsking = askingPrice;
    console.log('\n💵 CONSTRAINT 4 (Asking Price):');
    console.log('   Max price (Asking Price):', fmt(maxPriceFromAsking));
  }
  
  // Take the MINIMUM of ALL constraints (most restrictive wins)
  const targetOfferPrice = Math.min(maxPriceFromDSCR, maxPriceFromSalary, maxPriceFromCOC, maxPriceFromAsking);
  
  // Determine which constraint was binding
  let bindingConstraint = '';
  if (targetOfferPrice === maxPriceFromAsking && askingPrice > 0) {
    bindingConstraint = 'Asking Price';
  } else if (targetOfferPrice === maxPriceFromCOC) {
    bindingConstraint = 'Target COC';
  } else if (targetOfferPrice === maxPriceFromSalary) {
    bindingConstraint = 'Salary';
  } else {
    bindingConstraint = 'DSCR';
  }
  
  console.log('\n🎯 BINDING CONSTRAINT:', bindingConstraint);
  console.log('🎯 RECOMMENDED OFFER PRICE:', fmt(targetOfferPrice));
  
  // Validate result
  if (targetOfferPrice <= 0 || !isFinite(targetOfferPrice)) {
    alert('Unable to calculate a valid target offer price. Please check your inputs and financing structure.');
    return;
  }
  
  // === CALCULATE ACTUAL METRICS AT THIS PRICE ===
  const equity = targetOfferPrice * d;
  const sbaLoan = targetOfferPrice * (sbaPercent / 100);
  const sellerNote = targetOfferPrice * (sellerPercent / 100);
  const totalDebtService = targetOfferPrice * totalDebtServicePer1;
  const availableCash = E - totalDebtService;
  const freeCashFlow = availableCash - S;
  const totalTakeHome = availableCash; // Salary + FCF = Total available
  const actualCOC = (totalTakeHome / equity) * 100;
  const actualPayback = equity / totalTakeHome;
  const actualDSCR = E / totalDebtService;
  
  console.log('\n📈 ACTUAL METRICS AT TARGET PRICE:');
  console.log('   Equity Investment:', fmt(equity));
  console.log('   SBA Loan:', fmt(sbaLoan));
  console.log('   Seller Note:', fmt(sellerNote));
  console.log('   Total Debt Service:', fmt(totalDebtService));
  console.log('   Available Cash (EBITDA - DS):', fmt(availableCash));
  console.log('   Target Salary:', fmt(S));
  console.log('   Free Cash Flow:', fmt(freeCashFlow));
  console.log('   Total Take-Home:', fmt(totalTakeHome));
  console.log('   Actual COC:', actualCOC.toFixed(1) + '%');
  console.log('   Actual Payback:', actualPayback.toFixed(1) + ' years');
  console.log('   Actual DSCR:', actualDSCR.toFixed(2) + 'x');
  
  // Validation checks
  if (freeCashFlow < 0) {
    console.error('⚠️ WARNING: Negative FCF detected! This should not happen.');
  }
  if (actualDSCR < targetDSCR - 0.01) {
    console.error('⚠️ WARNING: DSCR below target! This should not happen.');
  }
  
  // Show informative message about what constraint limited the price
  console.log('\n💡 BINDING CONSTRAINT: ' + bindingConstraint);
  if (bindingConstraint === 'Asking Price') {
    console.log('   Recommended price matches asking price (would exceed asking if higher)');
  } else if (bindingConstraint === 'Target COC') {
    console.log('   Price limited by your ' + targetCOC + '% COC target');
    console.log('   Higher price would result in lower COC return');
  } else if (bindingConstraint === 'Salary') {
    console.log('   Salary requirement ($' + formatNumber(S) + ') was the limiting factor');
  } else if (bindingConstraint === 'DSCR') {
    console.log('   DSCR requirement (' + targetDSCR + 'x) was the limiting factor');
  }
  
  // Display results
  document.getElementById('da-target-offer-price').innerText = fmt(targetOfferPrice);
  document.getElementById('da-target-fcf').innerText = fmt(freeCashFlow);
  document.getElementById('da-target-takehome').innerText = fmt(totalTakeHome);
  
  // Update subtitle to show actual achieved metrics and binding constraint
  const subtitleEl = document.getElementById('da-target-offer-subtitle');
  if (subtitleEl) {
    let constraintMsg = '';
    if (bindingConstraint === 'Asking Price') {
      constraintMsg = ' • <span style="color:#e67e22;">Limited by asking price</span>';
    } else if (bindingConstraint === 'Target COC') {
      constraintMsg = ' • <span style="color:#27ae60;">Meets your ' + targetCOC + '% COC target ✓</span>';
    } else if (bindingConstraint === 'Salary') {
      constraintMsg = ' • <span style="color:#e67e22;">Limited by salary requirement</span>';
    } else if (bindingConstraint === 'DSCR') {
      constraintMsg = ' • <span style="color:#e67e22;">Limited by DSCR requirement</span>';
    }
    subtitleEl.innerHTML = `Achieves <strong>${actualCOC.toFixed(0)}% COC</strong> return with <strong>${actualPayback.toFixed(1)} year</strong> payback • DSCR: ${actualDSCR.toFixed(2)}x${constraintMsg}`;
  }
  
  // Compare to asking price
  if (askingPrice > 0) {
    const diff = targetOfferPrice - askingPrice;
    const diffPercent = (diff / askingPrice) * 100;
    
    document.getElementById('da-target-diff-amount').innerText = fmt(Math.abs(diff));
    document.getElementById('da-target-diff-percent').innerText = Math.abs(diffPercent).toFixed(1) + '%';
    
    const comparisonDiv = document.getElementById('da-target-comparison');
    const diffAmountEl = document.getElementById('da-target-diff-amount');
    const diffPercentEl = document.getElementById('da-target-diff-percent');
    if (diff < 0) {
      // Target is below asking - good!
      comparisonDiv.style.background = 'var(--success-bg)';
      comparisonDiv.style.border = '1px solid var(--success-border)';
      comparisonDiv.style.color = 'var(--success-text)';
      diffAmountEl.style.color = 'var(--success-text)';
      diffPercentEl.style.color = 'var(--success-text)';
      diffAmountEl.innerText = '-' + fmt(Math.abs(diff)) + ' (below asking)';
    } else {
      // Target is above asking - acceptable
      comparisonDiv.style.background = 'var(--warning-bg)';
      comparisonDiv.style.border = '1px solid var(--warning-text)';
      comparisonDiv.style.color = 'var(--warning-text)';
      diffAmountEl.style.color = 'var(--warning-text)';
      diffPercentEl.style.color = 'var(--warning-text)';
      diffAmountEl.innerText = '+' + fmt(diff) + ' (above asking)';
    }
  } else {
    const comparisonDiv = document.getElementById('da-target-comparison');
    const diffAmountEl = document.getElementById('da-target-diff-amount');
    const diffPercentEl = document.getElementById('da-target-diff-percent');
    comparisonDiv.style.background = 'var(--bg-secondary)';
    comparisonDiv.style.border = 'none';
    comparisonDiv.style.color = 'var(--text-primary)';
    diffAmountEl.style.color = '';
    diffPercentEl.style.color = '';
    diffAmountEl.innerText = 'N/A (no asking price)';
    diffPercentEl.innerText = 'N/A';
  }
  
  // Display financing breakdown
  let breakdownHTML = `
    • SBA Loan (${sbaPercent}%): ${fmt(sbaLoan)}<br>
    • Buyer Equity (${downPercent}%): ${fmt(equity)}<br>
  `;
  if (sellerNoteEnabled) {
    breakdownHTML += `• Seller Note (${sellerPercent}%): ${fmt(sellerNote)} `;
    breakdownHTML += `[${sellerPaymentType}, ${(sellerRate * 100).toFixed(1)}%${sellerStandby === 'yes' ? ', standby' : ''}]<br>`;
  }
  breakdownHTML += `• Target DSCR: ${targetDSCR}x<br>`;
  breakdownHTML += `• Target Owner Salary: ${fmt(targetSalary)}`;
  
  document.getElementById('da-target-financing-breakdown').innerHTML = breakdownHTML;
  
  // Show results section
  document.getElementById('da-target-offer-results').style.display = 'block';
  
  // Store the calculated target offer price for use later
  window.calculatedTargetOffer = targetOfferPrice;
}

// Event listener for Calculate Target Offer button
const calculateTargetOfferBtn = document.getElementById('da-calculate-target-offer-btn');
console.log('🎯 Target Offer Button found:', calculateTargetOfferBtn);
if (calculateTargetOfferBtn) {
  calculateTargetOfferBtn.addEventListener('click', () => {
    console.log('🎯 Calculate Target Offer button clicked!');
    calculateTargetOffer();
  });
  console.log('✅ Target Offer button event listener attached');
} else {
  console.error('❌ Target Offer button NOT found in DOM!');
}

// Event listener for Use Target Offer button
const useTargetOfferBtn = document.getElementById('da-use-target-offer-btn');
if (useTargetOfferBtn) {
  useTargetOfferBtn.addEventListener('click', () => {
    if (window.calculatedTargetOffer) {
      // Set the actual price field to the calculated target offer
      const actualPriceField = document.getElementById('da-actual-price');
      actualPriceField.value = fmt(window.calculatedTargetOffer);
      
      // Mark as overridden so it doesn't auto-recalculate
      overrides.actualPrice = true;
      actualPriceField.removeAttribute('readonly');
      
      // Recalculate everything with this new price
      calculate();
      
      // Visual feedback
      useTargetOfferBtn.innerHTML = '✓ Applied!';
      setTimeout(() => {
        useTargetOfferBtn.innerHTML = '✓ Use This as Actual Price';
      }, 2000);
    }
  });
}

// --- 5. SAVE SETTINGS ---
function saveState() {
    const state = {
        targetSalary: document.getElementById('da-target-salary').value,
        actualPrice: document.getElementById('da-actual-price').value,
        sbaPercent: document.getElementById('da-sba-percent').value,
        sbaLoan: document.getElementById('da-sba-loan').value,
        bankRate: document.getElementById('da-bank-rate').value,
        bankTerm: document.getElementById('da-bank-term').value,
        downPercent: document.getElementById('da-down-percent').value,
        down: document.getElementById('da-down').value,
        sellerNoteEnabled: document.getElementById('da-seller-note-enabled').checked,
        sellerPercent: document.getElementById('da-seller-percent').value,
        sellerAmt: document.getElementById('da-seller-amt').value,
        sellerRate: document.getElementById('da-seller-rate').value,
        sellerStandby: document.getElementById('da-seller-standby').value,
        sellerPaymentType: document.getElementById('da-seller-payment-type').value,
        dscr: document.getElementById('da-dscr').value,
        dealName: document.getElementById('da-deal-name').value,
        dealNotes: document.getElementById('da-deal-notes').value,
        overrides: overrides
    };
    chrome.storage.local.set({daState: state});
    
    // Also update userPreferences for cross-tab persistence
    saveFinancingPreferences();
}

// Save financing settings to userPreferences for cross-tab persistence
function saveFinancingPreferences() {
    userPreferences.sbaPercent = parseFloat(document.getElementById('da-sba-percent').value) || 80;
    userPreferences.bankRate = parseFloat(document.getElementById('da-bank-rate').value) || 9.25;
    userPreferences.bankTerm = parseFloat(document.getElementById('da-bank-term').value) || 10;
    userPreferences.dscr = parseFloat(document.getElementById('da-dscr').value) || 1.25;
    userPreferences.downPercent = parseFloat(document.getElementById('da-down-percent').value) || 10;
    userPreferences.targetSalary = parseNumber(document.getElementById('da-target-salary').value) || 250000;
    userPreferences.sellerNoteEnabled = document.getElementById('da-seller-note-enabled').checked;
    userPreferences.sellerPercent = parseFloat(document.getElementById('da-seller-percent').value) || 10;
    userPreferences.sellerRate = parseFloat(document.getElementById('da-seller-rate').value) || 5.0;
    userPreferences.sellerStandby = document.getElementById('da-seller-standby').value || 'no';
    userPreferences.sellerPaymentType = document.getElementById('da-seller-payment-type').value || 'amortizing';
    
    chrome.storage.local.set({ userPreferences: userPreferences });
    console.log('💾 Saved financing preferences for cross-tab persistence');
}

function loadState() {
    // Load both userPreferences (cross-tab settings) and daState (same-tab state)
    chrome.storage.local.get(['userPreferences', 'daState'], function(result) {
        // First, load user preferences (cross-tab persistent settings)
        if (result.userPreferences) {
            userPreferences = result.userPreferences;
            console.log('📋 Loaded user preferences for cross-tab persistence');
        }
        
        // Apply user preferences as defaults
        document.getElementById('da-target-salary').value = userPreferences.targetSalary || 250000;
        document.getElementById('da-sba-percent').value = userPreferences.sbaPercent || 80;
        document.getElementById('da-bank-rate').value = userPreferences.bankRate || 9.25;
        document.getElementById('da-bank-term').value = userPreferences.bankTerm || 10;
        document.getElementById('da-dscr').value = userPreferences.dscr || 1.25;
        document.getElementById('da-down-percent').value = userPreferences.downPercent || 10;
        
        const sellerNoteEnabled = userPreferences.sellerNoteEnabled || false;
        document.getElementById('da-seller-note-enabled').checked = sellerNoteEnabled;
        document.getElementById('da-seller-note-section').style.display = sellerNoteEnabled ? 'block' : 'none';
        document.getElementById('da-seller-percent').value = userPreferences.sellerPercent || 10;
        document.getElementById('da-seller-rate').value = userPreferences.sellerRate || 5.0;
        document.getElementById('da-seller-standby').value = userPreferences.sellerStandby || 'no';
        document.getElementById('da-seller-payment-type').value = userPreferences.sellerPaymentType || 'amortizing';
        
        // Then, override with daState if it exists (for same-tab state restoration)
        if (result.daState) {
            const state = result.daState;
            console.log('📋 Loaded daState for same-tab restoration');
            
            // Restore overrides
            if (state.overrides) {
                Object.assign(overrides, state.overrides);
            }
            
            // Target Salary
            if (state.targetSalary) {
                document.getElementById('da-target-salary').value = state.targetSalary;
            }
            
            // Actual Price (only restore if user had manually overridden it)
            const actualPriceVal = state.actualPrice ? parseNumber(state.actualPrice) : 0;
            const actualPriceField = document.getElementById('da-actual-price');
            if (overrides.actualPrice && actualPriceVal > 0) {
                actualPriceField.value = '$' + formatNumber(actualPriceVal);
                actualPriceField.removeAttribute('readonly');
            } else {
                actualPriceField.setAttribute('readonly', 'readonly');
            }
            
            // SBA
            if (state.sbaPercent) {
                document.getElementById('da-sba-percent').value = state.sbaPercent;
            }
            const sbaLoanVal = state.sbaLoan ? parseNumber(state.sbaLoan) : 0;
            const sbaLoanField = document.getElementById('da-sba-loan');
            if (overrides.sbaLoan && sbaLoanVal > 0) {
                sbaLoanField.value = '$' + formatNumber(sbaLoanVal);
                sbaLoanField.removeAttribute('readonly');
            } else {
                sbaLoanField.setAttribute('readonly', 'readonly');
            }
            
            if (state.bankRate) {
                document.getElementById('da-bank-rate').value = state.bankRate;
            }
            if (state.bankTerm) {
                document.getElementById('da-bank-term').value = state.bankTerm;
            }
            
            // Buyer Equity
            if (state.downPercent) {
                document.getElementById('da-down-percent').value = state.downPercent;
            }
            const downVal = state.down ? parseNumber(state.down) : 0;
            const downField = document.getElementById('da-down');
            if (overrides.downPayment && downVal > 0) {
                downField.value = '$' + formatNumber(downVal);
                downField.removeAttribute('readonly');
            } else {
                downField.setAttribute('readonly', 'readonly');
            }
            
            // Seller Note
            if (state.hasOwnProperty('sellerNoteEnabled')) {
                const stateSellerEnabled = state.sellerNoteEnabled;
                document.getElementById('da-seller-note-enabled').checked = stateSellerEnabled;
                document.getElementById('da-seller-note-section').style.display = stateSellerEnabled ? 'block' : 'none';
            }
            if (state.sellerPercent) {
                document.getElementById('da-seller-percent').value = state.sellerPercent;
            }
            const sellerAmtVal = state.sellerAmt ? parseNumber(state.sellerAmt) : 0;
            const sellerAmtField = document.getElementById('da-seller-amt');
            if (overrides.sellerNote && sellerAmtVal > 0) {
                sellerAmtField.value = '$' + formatNumber(sellerAmtVal);
                sellerAmtField.removeAttribute('readonly');
            } else {
                sellerAmtField.setAttribute('readonly', 'readonly');
            }
            
            if (state.sellerRate) {
                document.getElementById('da-seller-rate').value = state.sellerRate;
            }
            if (state.sellerStandby) {
                document.getElementById('da-seller-standby').value = state.sellerStandby;
            }
            if (state.sellerPaymentType) {
                document.getElementById('da-seller-payment-type').value = state.sellerPaymentType;
            }
            if (state.dscr) {
                document.getElementById('da-dscr').value = state.dscr;
            }
            
            // Deal Name & Notes (always from state, not preferences)
            // Only set dealName if it exists in state (don't clear it, let auto-fill work)
            if (state.dealName) {
                document.getElementById('da-deal-name').value = state.dealName;
            }
            document.getElementById('da-deal-notes').value = state.dealNotes || '';
        }
        scrapeData();
    });
}

// Set up event listeners - only for extension's own inputs
try {
  // Only select inputs/selects that belong to the extension
  // Check if element has ID starting with "da-" or has class "da-input"/"da-select"
  document.querySelectorAll('input, select').forEach(el => {
    const isExtensionInput = (el.id && el.id.startsWith('da-')) || 
                            el.classList.contains('da-input') || 
                            el.classList.contains('da-select');
    
    if (!isExtensionInput) {
      return; // Skip inputs that don't belong to the extension
    }
    
    // Skip SBA percent - it has its own handler to reset overrides first
    if (el.id !== 'da-sba-percent') {
      el.addEventListener('input', calculate);
    }
    if (el.type === 'text') {
      // Add live formatting on input for text fields (currency and large numbers)
      el.addEventListener('input', liveFormatInput);
      el.addEventListener('blur', formatInputOnBlur);
      el.addEventListener('focus', unformatInputOnFocus);
    }
  });
} catch (error) {
  console.error('Error setting up input event listeners:', error);
}

// Make auto-calculated fields editable on click
const actualPriceField = document.getElementById('da-actual-price');
if (actualPriceField) {
  actualPriceField.addEventListener('click', () => {
    makeEditable('da-actual-price', 'actualPrice');
  });
}

const sbaLoanField = document.getElementById('da-sba-loan');
if (sbaLoanField) {
  sbaLoanField.addEventListener('click', () => {
    makeEditable('da-sba-loan', 'sbaLoan');
  });
}

const downField = document.getElementById('da-down');
if (downField) {
  downField.addEventListener('click', () => {
    makeEditable('da-down', 'downPayment');
  });
}

const sellerAmtField = document.getElementById('da-seller-amt');
if (sellerAmtField) {
  sellerAmtField.addEventListener('click', () => {
    makeEditable('da-seller-amt', 'sellerNote');
  });
}

// Seller note checkbox - enables/disables the seller note
const sellerNoteCheckbox = document.getElementById('da-seller-note-enabled');
if (sellerNoteCheckbox) {
  sellerNoteCheckbox.addEventListener('change', (e) => {
    const sellerAmtField = document.getElementById('da-seller-amt');
    if (!e.target.checked && sellerAmtField) {
      sellerAmtField.value = '';
      overrides.sellerNote = false;
    }
    calculate();
  });
}

// Seller note arrow - collapses/expands the section
let sellerNoteCollapsed = false;
const sellerNoteArrow = document.getElementById('da-seller-note-arrow');
const sellerNoteSection = document.getElementById('da-seller-note-section');

if (sellerNoteArrow && sellerNoteSection && sellerNoteCheckbox) {
  sellerNoteArrow.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent triggering checkbox
    
    // Only allow collapse/expand if checkbox is checked
    if (!sellerNoteCheckbox.checked) {
      return;
    }
    
    sellerNoteCollapsed = !sellerNoteCollapsed;
    if (sellerNoteCollapsed) {
      sellerNoteSection.style.display = 'none';
      sellerNoteArrow.style.transform = 'rotate(-90deg)';
    } else {
      sellerNoteSection.style.display = 'block';
      sellerNoteArrow.style.transform = 'rotate(0deg)';
    }
    
    // Save state
    chrome.storage.local.set({ sellerNoteCollapsed: sellerNoteCollapsed });
  });
}

// When checkbox is checked, show section and reset arrow
if (sellerNoteCheckbox && sellerNoteSection && sellerNoteArrow) {
  sellerNoteCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      sellerNoteSection.style.display = 'block';
      sellerNoteArrow.style.transform = 'rotate(0deg)';
      sellerNoteCollapsed = false;
    } else {
      sellerNoteSection.style.display = 'none';
      sellerNoteArrow.style.transform = 'rotate(-90deg)';
    }
  });
}

// Restore seller note collapsed state
if (sellerNoteCheckbox && sellerNoteSection && sellerNoteArrow) {
  chrome.storage.local.get(['sellerNoteCollapsed'], (result) => {
    if (result.sellerNoteCollapsed && sellerNoteCheckbox.checked) {
      sellerNoteCollapsed = true;
      sellerNoteSection.style.display = 'none';
      sellerNoteArrow.style.transform = 'rotate(-90deg)';
    }
  });
}

// Reset overrides when key inputs change
const askingField = document.getElementById('da-asking');
if (askingField) {
  askingField.addEventListener('input', () => {
    // When asking price changes, reset actual price override
    overrides.actualPrice = false;
    const actualPriceField = document.getElementById('da-actual-price');
    if (actualPriceField) {
      actualPriceField.setAttribute('readonly', 'readonly');
    }
    calculate();
  });
}

const sbaPercentField = document.getElementById('da-sba-percent');
if (sbaPercentField) {
  sbaPercentField.addEventListener('input', () => {
    // When SBA % changes, reset the loan size override so it recalculates
    overrides.sbaLoan = false;
    const sbaLoanField = document.getElementById('da-sba-loan');
    if (sbaLoanField) {
      sbaLoanField.setAttribute('readonly', 'readonly');
    }
    calculate();
  });
}

const downPercentField = document.getElementById('da-down-percent');
if (downPercentField) {
  downPercentField.addEventListener('input', () => {
    if (!overrides.downPayment) {
      calculate();
    }
  });
}

const sellerPercentField = document.getElementById('da-seller-percent');
if (sellerPercentField) {
  sellerPercentField.addEventListener('input', () => {
    if (!overrides.sellerNote) {
      calculate();
    }
  });
}

// Contact Me button - opens email (only if element exists)
const contactBtn = document.getElementById('da-contact-btn');
if (contactBtn) {
  contactBtn.addEventListener('click', () => {
    const subject = encodeURIComponent('Vettr - Ideas, Bug Reports, Suggestions, Issues, Praise');
    window.open(`mailto:jamiemetzger@gmail.com?subject=${subject}`, '_blank');
  });
}

// --- 6. COLLAPSIBLE SECTIONS ---
// Helper function to create collapsible section
function setupCollapsible(headerId, contentId, arrowId, storageKey) {
  const header = document.getElementById(headerId);
  const content = document.getElementById(contentId);
  const arrow = document.getElementById(arrowId);
  let collapsed = true; // Default to collapsed

  header.addEventListener('click', () => {
    collapsed = !collapsed;
    if (collapsed) {
      content.style.display = 'none';
      arrow.style.transform = 'rotate(-90deg)';
    } else {
      content.style.display = 'block';
      arrow.style.transform = 'rotate(0deg)';
    }
    // Save state
    const saveObj = {};
    saveObj[storageKey] = collapsed;
    chrome.storage.local.set(saveObj);
  });

  // Restore collapsed state (defaults to collapsed if no saved state)
  chrome.storage.local.get([storageKey], (result) => {
    if (result[storageKey] !== undefined) {
      // Use saved state
      collapsed = result[storageKey];
    } else {
      // Default to collapsed on first launch
      collapsed = true;
    }
    
    if (collapsed) {
      content.style.display = 'none';
      arrow.style.transform = 'rotate(-90deg)';
    } else {
      content.style.display = 'block';
      arrow.style.transform = 'rotate(0deg)';
    }
  });
}

// Setup all collapsible sections
setupCollapsible('da-max-header', 'da-max-content', 'da-max-arrow', 'maxCollapsed');
setupCollapsible('da-roi-header', 'da-roi-content', 'da-roi-arrow', 'roiCollapsed');
setupCollapsible('da-target-offer-header', 'da-target-offer-content', 'da-target-offer-arrow', 'targetOfferCollapsed');
setupCollapsible('da-actual-header', 'da-actual-content', 'da-actual-arrow', 'actualCollapsed');
setupCollapsible('da-financing-header', 'da-financing-section', 'da-financing-arrow', 'financingCollapsed');
setupCollapsible('da-sba-header', 'da-sba-section', 'da-sba-arrow', 'sbaCollapsed');
setupCollapsible('da-buyer-equity-header', 'da-buyer-equity-section', 'da-buyer-equity-arrow', 'buyerEquityCollapsed');

// --- DSCR UP/DOWN BUTTONS ---
const dscrInput = document.getElementById('da-dscr');
const dscrUpBtn = document.getElementById('da-dscr-up');
const dscrDownBtn = document.getElementById('da-dscr-down');

if (dscrUpBtn && dscrInput) {
  dscrUpBtn.addEventListener('click', () => {
    const currentValue = parseFloat(dscrInput.value) || 1.0;
    const newValue = Math.round((currentValue + 0.05) * 100) / 100; // Round to 2 decimals
    dscrInput.value = newValue;
    calculate();
  });
  
  // Hover effect
  dscrUpBtn.addEventListener('mouseenter', () => {
    dscrUpBtn.style.background = 'var(--bg-tertiary)';
  });
  dscrUpBtn.addEventListener('mouseleave', () => {
    dscrUpBtn.style.background = 'var(--bg-secondary)';
  });
}

if (dscrDownBtn && dscrInput) {
  dscrDownBtn.addEventListener('click', () => {
    const currentValue = parseFloat(dscrInput.value) || 1.0;
    const newValue = Math.max(1.0, Math.round((currentValue - 0.05) * 100) / 100); // Don't go below 1.0
    dscrInput.value = newValue;
    calculate();
  });
  
  // Hover effect
  dscrDownBtn.addEventListener('mouseenter', () => {
    dscrDownBtn.style.background = 'var(--bg-tertiary)';
  });
  dscrDownBtn.addEventListener('mouseleave', () => {
    dscrDownBtn.style.background = 'var(--bg-secondary)';
  });
}

// --- 7. SHARE FUNCTIONALITY ---
const shareModal = document.getElementById('da-share-modal');
const shareBtn = document.getElementById('da-share-btn');
const shareClose = document.getElementById('da-share-close');

// Open share modal
if (shareBtn && shareModal) {
  shareBtn.addEventListener('click', () => {
    shareModal.style.display = 'flex';
  });
}

// Close share modal
if (shareClose && shareModal) {
  shareClose.addEventListener('click', () => {
    shareModal.style.display = 'none';
  });
}

// Close modal when clicking outside
if (shareModal) {
  shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) {
      shareModal.style.display = 'none';
    }
  });
}

// --- Vettr account (overlay settings) ---
function bindVettrAccountControls() {
  const signinBlock = document.getElementById('da-vettr-signin-block');
  if (!signinBlock || signinBlock.dataset.vettrBound === '1') return;
  const parent = signinBlock.parentElement;
  if (!parent || typeof VettrAccountUI === 'undefined') return;

  signinBlock.dataset.vettrBound = '1';
  parent.setAttribute('data-vettr-account-root', '');

  const statusEl = document.getElementById('da-vettr-connection-status');
  if (statusEl) {
    statusEl.setAttribute('data-vettr-status', '');
  }
  signinBlock.setAttribute('data-vettr-signin', '');

  const emailInput = document.getElementById('da-vettr-login-email');
  const passInput = document.getElementById('da-vettr-login-password');
  const loginBtn = document.getElementById('da-vettr-login-btn');
  const signoutBtn = document.getElementById('da-vettr-signout-btn');
  const errorEl = document.getElementById('da-vettr-login-error');
  const tryWeb = document.getElementById('da-vettr-try-web');
  const signup = document.getElementById('da-vettr-web-signup');

  if (emailInput) emailInput.setAttribute('data-vettr-email-input', '');
  if (passInput) passInput.setAttribute('data-vettr-password-input', '');
  if (loginBtn) loginBtn.setAttribute('data-vettr-login-btn', '');
  if (signoutBtn) signoutBtn.setAttribute('data-vettr-signout-btn', '');
  if (errorEl) errorEl.setAttribute('data-vettr-error', '');
  if (tryWeb) tryWeb.setAttribute('data-vettr-open-web', '');
  if (signup) signup.setAttribute('data-vettr-signup', '');

  let linkedEl = parent.querySelector('[data-vettr-linked]');
  if (!linkedEl) {
    linkedEl = document.createElement('div');
    linkedEl.setAttribute('data-vettr-linked', '');
    linkedEl.style.display = 'none';
    linkedEl.style.marginBottom = '12px';
    linkedEl.innerHTML =
      '<span style="color:#15803d;font-size:calc(12px * var(--font-scale));">✓ Synced as <strong data-vettr-email></strong></span>' +
      '<p data-vettr-last-sync style="display:none;margin:6px 0 0;font-size:calc(11px * var(--font-scale));color:#64748b;"></p>';
    parent.insertBefore(linkedEl, signinBlock);
  } else if (!linkedEl.querySelector('[data-vettr-last-sync]')) {
    const syncLine = document.createElement('p');
    syncLine.setAttribute('data-vettr-last-sync', '');
    syncLine.style.display = 'none';
    syncLine.style.margin = '6px 0 0';
    syncLine.style.fontSize = 'calc(11px * var(--font-scale))';
    syncLine.style.color = '#64748b';
    linkedEl.appendChild(syncLine);
  }

  VettrAccountUI.bindAccountForm(parent, {
    compactLinked: true,
    onSignedIn: () => {
      if (statusEl) statusEl.textContent = 'Syncing My Deals…';
    },
    onSignedOut: () => {
      if (statusEl) statusEl.textContent = 'Sign in to sync My Deals with Vettr.';
    }
  });
}

// --- 8. SETTINGS FUNCTIONALITY ---
const settingsModal = document.getElementById('da-settings-modal');
const settingsBtn = document.getElementById('da-settings-btn');
const settingsBtnFooter = document.getElementById('da-settings-btn-footer');
const settingsClose = document.getElementById('da-settings-close');
const settingsSave = document.getElementById('da-settings-save');
const settingsReset = document.getElementById('da-settings-reset');

// Function to open settings modal (shared by header and footer buttons)
function openSettingsModal() {
  // Load current preferences into modal fields
  const targetCocField = document.getElementById('da-target-coc');
  const targetPaybackField = document.getElementById('da-target-payback');
  const formatCompactField = document.getElementById('da-format-compact');
  
  // Ensure preferences are loaded (in case page just loaded)
  chrome.storage.local.get(['userPreferences', 'vettrApiBaseUrl', 'vettrAuthToken'], (result) => {
    if (result.userPreferences) {
      userPreferences = result.userPreferences;
    }
      
      // Set field values from preferences
      if (targetCocField) targetCocField.value = userPreferences.targetCOC;
      if (targetPaybackField) targetPaybackField.value = userPreferences.targetPayback;
      if (formatCompactField) formatCompactField.checked = userPreferences.compactFormat;
      
      // Set dark mode and language/currency
      const darkModeField = document.getElementById('da-dark-mode');
      const autoOpenField = document.getElementById('da-auto-open');
      const languageField = document.getElementById('da-language');
      const currencyField = document.getElementById('da-currency');
      const fontSizeField = document.getElementById('da-font-size');
      const fontSizeDisplay = document.getElementById('da-font-size-display');
      if (darkModeField) darkModeField.checked = userPreferences.darkMode || false;
      if (autoOpenField) autoOpenField.checked = userPreferences.autoOpenOnBusinessSites || false;
      if (languageField) languageField.value = userPreferences.language || 'en';
      if (currencyField) currencyField.value = userPreferences.currency || 'USD';
      const vettrApiField = document.getElementById('da-vettr-api-url');
      const vettrTokenField = document.getElementById('da-vettr-token');
      if (vettrApiField) vettrApiField.value = result.vettrApiBaseUrl || '';
      if (vettrTokenField) vettrTokenField.value = result.vettrAuthToken || '';
      const vettrAdv = document.getElementById('da-vettr-advanced');
      const vettrAdvToggle = document.getElementById('da-vettr-advanced-toggle');
      if (vettrAdv) vettrAdv.style.display = 'none';
      if (vettrAdvToggle) vettrAdvToggle.textContent = 'Manual setup (support only)';

      if (fontSizeField) {
        const fontSize = userPreferences.fontSize || 100;
        fontSizeField.value = fontSize;
        if (fontSizeDisplay) fontSizeDisplay.textContent = fontSize + '%';
        
        // Add slider input listener for live preview (only if not already added)
        if (!fontSizeField.dataset.listenerAdded) {
          fontSizeField.addEventListener('input', function() {
            const newSize = parseInt(this.value);
            const display = document.getElementById('da-font-size-display');
            if (display) display.textContent = newSize + '%';
            
            // Apply immediately for live preview
            const widgetContainer = document.getElementById('deal-analyzer-container');
            if (widgetContainer) {
              const scale = newSize / 100;
              widgetContainer.style.setProperty('--font-scale', scale);
              console.log('🔤 Live preview - Font scale:', scale, 'Container found:', !!widgetContainer);
            } else {
              console.error('🔤 Container not found for live preview');
            }
          });
          fontSizeField.dataset.listenerAdded = 'true';
        }
      }
      
      // Apply dark mode styling to modal if dark mode is enabled
      if (userPreferences.darkMode) {
        applyDarkModeToSettingsModal(true);
      } else {
        applyDarkModeToSettingsModal(false);
      }
      
      settingsModal.style.display = 'flex';
    });
}

// Open settings modal - header and footer buttons
if (settingsBtn && settingsModal) {
  settingsBtn.addEventListener('click', openSettingsModal);
}
if (settingsBtnFooter && settingsModal) {
  settingsBtnFooter.addEventListener('click', openSettingsModal);
}

// Close settings modal
if (settingsClose && settingsModal) {
  settingsClose.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });
}

// Close modal when clicking outside (on the dark overlay)
if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });
  
  // Prevent clicks inside the modal content from closing it
  const modalContent = document.getElementById('da-settings-modal-content');
  if (modalContent) {
    modalContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  bindVettrAccountControls();
  if (settingsModal && !settingsModal.dataset.vettrAdvancedToggleBound) {
    settingsModal.dataset.vettrAdvancedToggleBound = '1';
    settingsModal.addEventListener('click', (e) => {
      if (e.target.id !== 'da-vettr-advanced-toggle') return;
      const adv = document.getElementById('da-vettr-advanced');
      const btn = document.getElementById('da-vettr-advanced-toggle');
      if (!adv || !btn) return;
      const open = adv.style.display !== 'block';
      adv.style.display = open ? 'block' : 'none';
      btn.textContent = open ? 'Hide manual setup' : 'Manual setup (support only)';
    });
  }
}

// Save settings
if (settingsSave && settingsModal) {
  settingsSave.addEventListener('click', () => {
    // Update preferences
    const targetCocField = document.getElementById('da-target-coc');
    const targetPaybackField = document.getElementById('da-target-payback');
    const formatCompactField = document.getElementById('da-format-compact');
    const darkModeField = document.getElementById('da-dark-mode');
    const autoOpenField = document.getElementById('da-auto-open');
    const languageField = document.getElementById('da-language');
    const currencyField = document.getElementById('da-currency');
    const fontSizeField = document.getElementById('da-font-size');
    const vettrApiField = document.getElementById('da-vettr-api-url');
    const vettrTokenField = document.getElementById('da-vettr-token');
    
    // Validate and parse values
    const newTargetCOC = targetCocField ? (parseFloat(targetCocField.value) || 25) : 25;
    const newTargetPayback = targetPaybackField ? (parseFloat(targetPaybackField.value) || 4) : 4;
    const newCompactFormat = formatCompactField ? formatCompactField.checked : false;
    const newDarkMode = darkModeField ? darkModeField.checked : false;
    const newAutoOpen = autoOpenField ? autoOpenField.checked : false;
    const newLanguage = languageField ? languageField.value : 'en';
    const newCurrency = currencyField ? currencyField.value : 'USD';
    const newFontSize = fontSizeField ? parseInt(fontSizeField.value) : 100;
    
    // Update preferences object
    userPreferences.targetCOC = newTargetCOC;
    userPreferences.targetPayback = newTargetPayback;
    userPreferences.compactFormat = newCompactFormat;
    userPreferences.darkMode = newDarkMode;
    userPreferences.autoOpenOnBusinessSites = newAutoOpen;
    userPreferences.language = newLanguage;
    userPreferences.currency = newCurrency;
    userPreferences.fontSize = newFontSize;
    
    // Apply dark mode immediately
    applyDarkMode(newDarkMode);
    
    // Apply font size immediately
    if (container) {
      // Set CSS variable for font scaling
      const scale = newFontSize / 100;
      container.style.setProperty('--font-scale', scale);
      console.log('🔤 Font size applied - Scale:', scale, '(' + newFontSize + '%)');
    }
    
    // Apply language and currency
    if (window.i18n) {
      window.i18n.setLanguage(newLanguage);
      window.i18n.setCurrency(newCurrency);
      // Reload UI with new language (would need to update all text elements)
      // For now, just save preferences - full i18n update would require more work
    }
    
    const vettrApiUrl = vettrApiField ? vettrApiField.value.trim() : '';
    const vettrAuthToken = vettrTokenField ? vettrTokenField.value.trim() : '';
    const vettrAdv = document.getElementById('da-vettr-advanced');
    const advancedOpen = vettrAdv && vettrAdv.style.display === 'block';

    const storagePayload = { userPreferences: userPreferences };
    if (advancedOpen) {
      if (vettrApiUrl) storagePayload.vettrApiBaseUrl = vettrApiUrl;
      if (vettrAuthToken) storagePayload.vettrAuthToken = vettrAuthToken;
    }

    chrome.storage.local.set(storagePayload, () => {
      console.log('✅ Settings saved successfully:', userPreferences);
      
      // Check if we should auto-open after saving settings
      checkAutoOpen();
      
      // Verify save by reading back
      chrome.storage.local.get(['userPreferences'], (result) => {
        console.log('✅ Verified saved settings:', result.userPreferences);
      });
    });
    
    // Recalculate with new targets immediately
    calculate();
    
    // Update Target Offer Calculator display
    updateTargetOfferDisplay();
    
    // Close modal with success feedback
    const saveBtn = document.getElementById('da-settings-save');
    if (saveBtn) {
      const originalText = saveBtn.innerHTML;
      const originalBg = saveBtn.style.background;
      saveBtn.innerHTML = '✅ Saved!';
      saveBtn.style.background = '#27ae60';
      setTimeout(() => {
        settingsModal.style.display = 'none';
        saveBtn.innerHTML = originalText;
        saveBtn.style.background = originalBg || '#27ae60';
      }, 1000);
    } else {
      // If button not found, just close modal
      settingsModal.style.display = 'none';
    }
  });
}

// Reset to defaults
if (settingsReset) {
  settingsReset.addEventListener('click', () => {
    const targetCocField = document.getElementById('da-target-coc');
    const targetPaybackField = document.getElementById('da-target-payback');
    const formatCompactField = document.getElementById('da-format-compact');
    const darkModeField = document.getElementById('da-dark-mode');
    const languageField = document.getElementById('da-language');
    const currencyField = document.getElementById('da-currency');
    const fontSizeField = document.getElementById('da-font-size');
    const fontSizeDisplay = document.getElementById('da-font-size-display');
    
    if (targetCocField) targetCocField.value = 25;
    if (targetPaybackField) targetPaybackField.value = 4;
    if (formatCompactField) formatCompactField.checked = false;
    if (darkModeField) darkModeField.checked = false;
    if (languageField) languageField.value = 'en';
    if (currencyField) currencyField.value = 'USD';
    if (fontSizeField) {
      fontSizeField.value = 100;
      if (fontSizeDisplay) fontSizeDisplay.textContent = '100%';
    }
  });
}

// Make settings modal draggable
(function makeSettingsModalDraggable() {
  const settingsModal = document.getElementById('da-settings-modal');
  const modalContent = document.getElementById('da-settings-modal-content');
  
  if (!modalContent) return;
  
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;
  
  // Make the modal header area act as drag handle
  const modalHeader = modalContent.querySelector('h3')?.parentElement;
  if (modalHeader) {
    modalHeader.style.cursor = 'move';
    modalHeader.style.userSelect = 'none';
    
    modalHeader.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
  }
  
  function dragStart(e) {
    // Only drag on header, not on close button
    if (e.target.id === 'da-settings-close') return;
    
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    
    if (e.target === modalHeader || modalHeader.contains(e.target)) {
      isDragging = true;
      modalContent.style.transition = 'none';
    }
  }
  
  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      
      xOffset = currentX;
      yOffset = currentY;
      
      setTranslate(currentX, currentY, modalContent);
    }
  }
  
  function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }
  
  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate(${xPos}px, ${yPos}px)`;
  }
})();

// Apply dark mode styling to settings modal
function applyDarkModeToSettingsModal(enabled) {
  const settingsModal = document.getElementById('da-settings-modal');
  if (!settingsModal) return;
  
  const modalContent = settingsModal.querySelector('#da-settings-modal-content');
  if (!modalContent) return;
  
  // Update modal content background and text color
  modalContent.style.backgroundColor = enabled ? '#2d2d2d' : 'white';
  modalContent.style.color = enabled ? '#e0e0e0' : '#2c3e50';
  
  // Update all headings (h3, h4) - force update regardless of current style
  const headings = modalContent.querySelectorAll('h3, h4');
  headings.forEach(heading => {
    heading.style.color = enabled ? '#e0e0e0' : '#2c3e50';
  });
  
  // Update h4 border colors
  const h4Elements = modalContent.querySelectorAll('h4');
  h4Elements.forEach(h4 => {
    h4.style.borderBottom = enabled ? '1px solid #404040' : '1px solid #eee';
  });
  
  // Update all label spans (label text)
  const labels = modalContent.querySelectorAll('label');
  labels.forEach(label => {
    const spans = label.querySelectorAll('span');
    spans.forEach(span => {
      span.style.color = enabled ? '#b0b0b0' : '#666';
    });
  });
  
  // Update description divs (small gray text)
  const allDivs = modalContent.querySelectorAll('div');
  allDivs.forEach(div => {
    // Check if it's a description div (has 10px font size and contains descriptive text)
    const fontSize = div.style.fontSize;
    if (fontSize && (fontSize.includes('10px') || fontSize === '10px')) {
      div.style.color = enabled ? '#888' : '#999';
    }
  });
  
  // Update close button
  const closeBtn = settingsModal.querySelector('#da-settings-close');
  if (closeBtn) {
    closeBtn.style.color = enabled ? '#b0b0b0' : '#999';
  }
  
  // Update input fields
  const numberInputs = modalContent.querySelectorAll('input[type="number"]');
  numberInputs.forEach(input => {
    input.style.backgroundColor = enabled ? '#2d2d2d' : 'white';
    input.style.color = enabled ? '#e0e0e0' : '#2c3e50';
    input.style.borderColor = enabled ? '#404040' : '#ccc';
  });
  
  // Update select elements
  const selects = modalContent.querySelectorAll('select');
  selects.forEach(select => {
    select.style.backgroundColor = enabled ? '#2d2d2d' : 'white';
    select.style.color = enabled ? '#e0e0e0' : '#2c3e50';
    select.style.borderColor = enabled ? '#404040' : '#ccc';
  });
  
  // Walk through all elements and update any remaining color styles
  const walker = document.createTreeWalker(
    modalContent,
    NodeFilter.SHOW_ELEMENT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    const style = node.style;
    if (style.color) {
      const color = style.color.toLowerCase();
      // Update #666 colors (label text) - rgb(102, 102, 102)
      if (color === 'rgb(102, 102, 102)' || color === '#666' || color.includes('102, 102, 102')) {
        style.color = enabled ? '#b0b0b0' : '#666';
      }
      // Update #999 colors (description text) - rgb(153, 153, 153)
      if (color === 'rgb(153, 153, 153)' || color === '#999' || color.includes('153, 153, 153')) {
        style.color = enabled ? '#888' : '#999';
      }
      // Update #2c3e50 colors (headings) - rgb(44, 62, 80)
      if (color === 'rgb(44, 62, 80)' || color === '#2c3e50' || color.includes('44, 62, 80')) {
        style.color = enabled ? '#e0e0e0' : '#2c3e50';
      }
    }
  }
}

// Apply dark mode to the container
function applyDarkMode(enabled) {
  const container = document.getElementById('deal-analyzer-container');
  if (container) {
    if (enabled) {
      container.classList.add('dark-mode');
    } else {
      container.classList.remove('dark-mode');
    }
  }
  
  // Update settings modal
  applyDarkModeToSettingsModal(enabled);
  
  // Also update other modals
  const debugModal = document.getElementById('da-debug-modal');
  const shareModal = document.getElementById('da-share-modal');
  
  if (debugModal) {
    const modalContent = debugModal.querySelector('div');
    if (modalContent) {
      modalContent.style.backgroundColor = enabled ? '#2d2d2d' : 'white';
      modalContent.style.color = enabled ? '#e0e0e0' : '#2c3e50';
    }
  }
  
  if (shareModal) {
    const modalContent = shareModal.querySelector('div');
    if (modalContent) {
      modalContent.style.backgroundColor = enabled ? '#2d2d2d' : 'white';
      modalContent.style.color = enabled ? '#e0e0e0' : '#333';
    }
  }
}

// Load user preferences on startup
function loadUserPreferences() {
  chrome.storage.local.get(['userPreferences'], (result) => {
    if (result.userPreferences) {
      userPreferences = result.userPreferences;
      console.log('Loaded preferences:', userPreferences);
      
      // Apply dark mode if enabled
      if (userPreferences.darkMode) {
        applyDarkMode(true);
      }
      
      // Initialize i18n if available
      if (window.i18n) {
        if (userPreferences.language) {
          window.i18n.setLanguage(userPreferences.language);
        }
        if (userPreferences.currency) {
          window.i18n.setCurrency(userPreferences.currency);
        }
      }
      
      // Apply preferences immediately after loading
      // This ensures the UI is updated with saved preferences
      calculate(); // Recalculate with loaded preferences
      
      // Check if we should auto-open on business sites
      checkAutoOpen();
    } else {
      // Even if no saved preferences, check auto-open with defaults
      checkAutoOpen();
    }
  });
}

// --- DEBUG/DIAGNOSTICS MODAL HANDLERS ---

// Global variable to store last scrape results for diagnostics
let lastScrapeData = {
  platform: 'unknown',
  askingPrice: 0,
  ebitda: 0,
  isSDE: false,
  description: '',
  timestamp: null
};

const debugModal = document.getElementById('da-debug-modal');
const debugBtn = document.getElementById('da-debug-btn');
const debugClose = document.getElementById('da-debug-close');
const debugDone = document.getElementById('da-debug-done');
const debugRescrape = document.getElementById('da-debug-rescrape');
const debugConsole = document.getElementById('da-debug-console');

// Update debug modal with scrape data
function updateDebugModal() {
  const debugUrl = document.getElementById('da-debug-url');
  const debugPlatform = document.getElementById('da-debug-platform');
  const debugStatus = document.getElementById('da-debug-status');
  const debugPrice = document.getElementById('da-debug-price');
  const debugEbitda = document.getElementById('da-debug-ebitda');
  
  if (debugUrl) debugUrl.innerText = window.location.href;
  if (debugPlatform) {
    debugPlatform.innerText = lastScrapeData.platform || 'generic';
    debugPlatform.style.color = lastScrapeData.platform !== 'generic' ? '#27ae60' : '#3498db';
  }
  
  const hasData = lastScrapeData.askingPrice > 0 || lastScrapeData.ebitda > 0;
  if (debugStatus) {
    debugStatus.innerText = hasData ? '✅ Data Found' : '⚠️ No Data Found';
    debugStatus.style.color = hasData ? '#27ae60' : '#e67e22';
  }
  
  if (debugPrice) {
    if (lastScrapeData.askingPrice > 0) {
      debugPrice.innerText = '$' + formatNumber(lastScrapeData.askingPrice);
      debugPrice.style.color = '#27ae60';
    } else {
      debugPrice.innerText = '❌ Not found';
      debugPrice.style.color = '#e74c3c';
    }
  }
  
  if (debugEbitda) {
    if (lastScrapeData.ebitda > 0) {
      const type = lastScrapeData.isSDE ? 'SDE' : 'EBITDA';
      debugEbitda.innerText = '$' + formatNumber(lastScrapeData.ebitda) + ' (' + type + ')';
      debugEbitda.style.color = '#27ae60';
    } else {
      debugEbitda.innerText = '❌ Not found';
      debugEbitda.style.color = '#e74c3c';
    }
  }
}

// Open debug modal
if (debugBtn && debugModal) {
  debugBtn.addEventListener('click', () => {
    updateDebugModal();
    debugModal.style.display = 'flex';
  });
}

// Close debug modal
if (debugClose && debugModal) {
  debugClose.addEventListener('click', () => {
    debugModal.style.display = 'none';
  });
}

if (debugDone && debugModal) {
  debugDone.addEventListener('click', () => {
    debugModal.style.display = 'none';
  });
}

// Close modal when clicking outside
if (debugModal) {
  debugModal.addEventListener('click', (e) => {
    if (e.target === debugModal) {
      debugModal.style.display = 'none';
    }
  });
}

// Re-scrape button
if (debugRescrape) {
  debugRescrape.addEventListener('click', () => {
    console.log('🔄 Manual re-scrape triggered from diagnostics panel');
    scrapeData();
    setTimeout(() => {
      updateDebugModal();
    }, 500);
  });
}

// Open console button (info only - can't programmatically open devtools)
if (debugConsole) {
  debugConsole.addEventListener('click', () => {
    alert('Press F12 (or Cmd+Option+I on Mac) to open the browser console and view detailed scraping logs.');
  });
}

// Generate PDF-ready HTML
function generatePDFHTML() {
  try {
    const listingUrl = window.location.href;
    const ebitda = safeGetValue('da-ebitda', '$0');
    const askingPrice = safeGetValue('da-asking', '$0');
    const maxPrice = safeGetText('da-max-price', '$0');
    const offerPrice = safeGetValue('da-actual-price', '$0');
    const maxDebt = safeGetText('da-max-debt', '$0');
    const totalDebt = safeGetText('da-total-debt', '$0');
    const fcfAnnual = safeGetText('da-fcf-annual', '$0');
    const fcfMonthly = safeGetText('da-fcf-monthly', '$0');
    const ownerTakeHome = safeGetText('da-owner-salary', '$0');
    const targetSalary = safeGetValue('da-target-salary', '$0');
    const maxAvailable = safeGetText('da-max-available', '$0');
    
    const sbaPercent = safeGetValue('da-sba-percent', '0');
    const sbaLoan = safeGetValue('da-sba-loan', '$0');
    const downPercent = safeGetValue('da-down-percent', '0');
    const downPayment = safeGetValue('da-down', '$0');
    const bankRate = safeGetValue('da-bank-rate', '0');
    const bankTerm = safeGetValue('da-bank-term', '0');
    const dscr = safeGetValue('da-dscr', '0');
    
    const cocReturn = safeGetText('da-coc-return', '0%');
    const payback = safeGetText('da-payback', '0 yrs');
    
    const sellerNoteCheckbox = document.getElementById('da-seller-note-enabled');
    const sellerNoteEnabled = sellerNoteCheckbox ? sellerNoteCheckbox.checked : false;
    let sellerNoteHTML = '';
    if (sellerNoteEnabled) {
      const sellerPercent = safeGetValue('da-seller-percent', '0');
      const sellerAmt = safeGetValue('da-seller-amt', '$0');
      const sellerRate = safeGetValue('da-seller-rate', '0');
      const sellerStandby = safeGetValue('da-seller-standby', 'no') === 'yes' ? ' (Standby)' : '';
      const sellerPaymentType = safeGetValue('da-seller-payment-type', 'amortizing') === 'interest-only' ? 'Interest Only' : 'Amortizing';
      sellerNoteHTML = `
        <tr><td style="padding:8px; border-bottom:1px solid #eee;"><strong>Seller Note:</strong></td><td style="padding:8px; border-bottom:1px solid #eee;">${sellerPercent}% (${sellerAmt}) @ ${sellerRate}%${sellerStandby} - ${sellerPaymentType}</td></tr>
      `;
    }
  
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Deal Analysis Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #0d2e4e; border-bottom: 3px solid #0d2e4e; padding-bottom: 10px; }
    h2 { color: #0d2e4e; margin-top: 30px; border-bottom: 2px solid #ddd; padding-bottom: 8px; }
    .section { margin: 20px 0; }
    .metric-box { background: #f8f9fa; border-left: 4px solid #27ae60; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .metric-box.orange { border-left-color: #e67e22; }
    .metric-box.purple { border-left-color: #9b59b6; }
    .metric-box.blue { border-left-color: #3498db; }
    .metric-box.teal { border-left-color: #16a085; }
    .metric-box.red { border-left-color: #e74c3c; }
    .metric-box.gray { border-left-color: #95a5a6; }
    .metric-title { font-size: 11px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
    .metric-value { font-size: 24px; font-weight: 700; color: #2c3e50; margin-top: 5px; }
    .metric-subtitle { font-size: 12px; color: #999; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    td { padding: 8px; border-bottom: 1px solid #eee; }
    .url { color: #3498db; word-break: break-all; font-size: 12px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; font-size: 11px; color: #999; text-align: center; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
  </style>
</head>
<body>
  <h1>Deal Analysis Report</h1>
  <p><strong>Listing URL:</strong><br><span class="url">${listingUrl}</span></p>
  <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  
  <h2>Financial Overview</h2>
  <table>
    <tr><td style="padding:8px; border-bottom:1px solid #eee;"><strong>Business EBITDA:</strong></td><td style="padding:8px; border-bottom:1px solid #eee;">${ebitda}</td></tr>
    <tr><td style="padding:8px; border-bottom:1px solid #eee;"><strong>Asking Price:</strong></td><td style="padding:8px; border-bottom:1px solid #eee;">${askingPrice}</td></tr>
  </table>
  
  <h2>Maximum Allowable (DSCR-Based)</h2>
  <div class="grid">
    <div class="metric-box">
      <div class="metric-title">Max Allowable Purchase Price</div>
      <div class="metric-value">${maxPrice}</div>
    </div>
    <div class="metric-box gray">
      <div class="metric-title">Max Annual Debt Service</div>
      <div class="metric-value">${maxDebt}</div>
    </div>
  </div>
  
  <h2>Return on Investment (Year 1)</h2>
  <div class="grid">
    <div class="metric-box orange">
      <div class="metric-title">Cash-on-Cash Return</div>
      <div class="metric-value">${cocReturn}</div>
      <div class="metric-subtitle">Annual return on equity</div>
    </div>
    <div class="metric-box purple">
      <div class="metric-title">Payback Period</div>
      <div class="metric-value">${payback}</div>
      <div class="metric-subtitle">Time to recover equity</div>
    </div>
  </div>
  
  <h2>Financing Structure</h2>
  <table>
    <tr><td style="padding:8px; border-bottom:1px solid #eee;"><strong>SBA Loan:</strong></td><td style="padding:8px; border-bottom:1px solid #eee;">${sbaPercent}% (${sbaLoan}) @ ${bankRate}% for ${bankTerm} years</td></tr>
    <tr><td style="padding:8px; border-bottom:1px solid #eee;"><strong>Target DSCR:</strong></td><td style="padding:8px; border-bottom:1px solid #eee;">${dscr}</td></tr>
    <tr><td style="padding:8px; border-bottom:1px solid #eee;"><strong>Buyer Equity:</strong></td><td style="padding:8px; border-bottom:1px solid #eee;">${downPercent}% (${downPayment})</td></tr>
    ${sellerNoteHTML}
  </table>
  
  <h2>Actual Deal Scenario</h2>
  <div class="metric-box orange">
    <div class="metric-title">Offer Price</div>
    <div class="metric-value">${offerPrice}</div>
  </div>
  <div class="grid">
    <div class="metric-box purple">
      <div class="metric-title">Total Debt Service</div>
      <div class="metric-value">${totalDebt}</div>
    </div>
    <div class="metric-box">
      <div class="metric-title">Free Cash Flow (Annual)</div>
      <div class="metric-value">${fcfAnnual}</div>
      <div class="metric-subtitle">Monthly: ${fcfMonthly}</div>
    </div>
  </div>
  <div class="metric-box blue">
    <div class="metric-title">Total Owner Take-Home</div>
    <div class="metric-value">${ownerTakeHome}</div>
    <div class="metric-subtitle">Target Salary: ${targetSalary} + Free Cash Flow (max available: ${maxAvailable})</div>
  </div>
  
  <div class="footer">
    Generated by Vettr ${EXT_VERSION}
  </div>
</body>
</html>`;
  } catch (error) {
    console.error('Error in generatePDFHTML:', error);
    return '<html><body>Error generating PDF HTML</body></html>';
  }
}

// Generate share text
function generateShareText() {
  try {
    const listingUrl = window.location.href;
    const ebitda = safeGetValue('da-ebitda', '$0');
    const askingPrice = safeGetValue('da-asking', '$0');
    const maxPrice = safeGetText('da-max-price', '$0');
    const offerPrice = safeGetValue('da-actual-price', '$0');
    const totalDebt = safeGetText('da-total-debt', '$0');
    const fcfAnnual = safeGetText('da-fcf-annual', '$0');
    const ownerTakeHome = safeGetText('da-owner-salary', '$0');
    const targetSalary = safeGetValue('da-target-salary', '$0');
    
    const sbaPercent = safeGetValue('da-sba-percent', '0');
    const sbaLoan = safeGetValue('da-sba-loan', '$0');
    const downPercent = safeGetValue('da-down-percent', '0');
    const downPayment = safeGetValue('da-down', '$0');
    const bankRate = safeGetValue('da-bank-rate', '0');
    const bankTerm = safeGetValue('da-bank-term', '0');
    const dscr = safeGetValue('da-dscr', '0');
    
    // ROI Metrics
    const cocReturn = safeGetText('da-coc-return', '0%');
    const payback = safeGetText('da-payback', '0 yrs');
    const qualityScore = safeGetText('da-quality-score', '--');
    
    // Deal notes
    const dealNotes = safeGetValue('da-deal-notes', '').trim();
    const dealName = safeGetValue('da-deal-name', '').trim();
    
    const sellerNoteCheckbox = document.getElementById('da-seller-note-enabled');
    const sellerNoteEnabled = sellerNoteCheckbox ? sellerNoteCheckbox.checked : false;
    let sellerNoteText = '';
    if (sellerNoteEnabled) {
      const sellerPercent = safeGetValue('da-seller-percent', '0');
      const sellerAmt = safeGetValue('da-seller-amt', '$0');
      const sellerRate = safeGetValue('da-seller-rate', '0');
      const sellerStandby = safeGetValue('da-seller-standby', 'no') === 'yes' ? ' (Standby)' : '';
      sellerNoteText = `\n• Seller Note: ${sellerPercent}% (${sellerAmt}) @ ${sellerRate}%${sellerStandby}`;
    }
  
  let notesSection = '';
  if (dealNotes) {
    notesSection = `\n\n📝 DEAL NOTES:\n${dealNotes}`;
  }
  
  let nameHeader = dealName ? `${dealName}\n\n` : '';
  
  return `📊 DEAL ANALYSIS SUMMARY
${nameHeader}🔗 Listing: ${listingUrl}

💰 FINANCIALS:
• Business EBITDA: ${ebitda}
• Asking Price: ${askingPrice}
• Max Allowable Price: ${maxPrice}
• Offer Price: ${offerPrice}

🎯 DEAL QUALITY SCORE: ${qualityScore}/100

💵 FINANCING STRUCTURE:
• SBA Loan: ${sbaPercent}% (${sbaLoan}) @ ${bankRate}% (${bankTerm} years)
• Buyer Equity: ${downPercent}% (${downPayment})${sellerNoteText}
• Target DSCR: ${dscr}

📈 CASH FLOW:
• Annual Debt Service: ${totalDebt}
• Target Owner Salary: ${targetSalary}
• Free Cash Flow: ${fcfAnnual}
• Total Owner Take-Home: ${ownerTakeHome}

📊 RETURN ON INVESTMENT (Year 1):
• Cash-on-Cash Return: ${cocReturn}
• Payback Period: ${payback}${notesSection}

---
Generated by Vettr ${VERSION}`;
  } catch (error) {
    console.error('Error in generateShareText:', error);
    return 'Error generating share text. Please try again.';
  }
}

// Helper function to get business name from page
function normalizeScrapedDescription(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);
}

function isDescriptionSectionHeading(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  if (t.length > 80) return false;
  const stopSections = [
    'financial details', 'detailed information', 'facilities', 'support & training',
    'support and training', 'competition', 'growth opportunities', 'reason for selling',
    'buy a franchise', 'similar listings', 'contact the seller', 'request more info',
    'business location', 'listing statistics', 'related businesses', 'share this listing'
  ];
  return stopSections.some((h) => t === h || t.startsWith(h));
}

function scrapeBusinessDescription(platform) {
  const MAX = 8000;

  // Strategy 1: heading "Business Description" + following siblings
  const headingCandidates = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,div,strong');
  for (const el of headingCandidates) {
    const label = (el.innerText || '').trim();
    if (!/^business description$/i.test(label) && !/^listing description$/i.test(label) && !/^about this business$/i.test(label)) {
      continue;
    }
    const parts = [];
    let sibling = el.nextElementSibling;
    while (sibling) {
      if (/^H[1-6]$/.test(sibling.tagName)) break;
      const chunk = (sibling.innerText || '').trim();
      if (chunk && isDescriptionSectionHeading(chunk.split('\n')[0])) break;
      if (chunk) parts.push(chunk);
      sibling = sibling.nextElementSibling;
    }
    if (parts.length) {
      const text = normalizeScrapedDescription(parts.join('\n\n'));
      if (text.length > 40) {
        console.log('✅ Found business description via heading DOM:', text.length, 'chars');
        return text.slice(0, MAX);
      }
    }
  }

  // Strategy 2: BizBuySell / generic — text after "Business Description" until next section
  const pageText = document.body.innerText || document.body.textContent || '';
  const lines = pageText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower !== 'business description' && !lower.startsWith('business description')) continue;
    const parts = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (isDescriptionSectionHeading(lines[j])) break;
      if (/^(asking price|cash flow|ebitda|gross revenue|inventory|ffe|rent|real estate|year established)/i.test(lines[j])) continue;
      if (lines[j].length < 4) continue;
      parts.push(lines[j]);
    }
    const text = normalizeScrapedDescription(parts.join('\n\n'));
    if (text.length > 40) {
      console.log('✅ Found business description via page text:', text.length, 'chars');
      return text.slice(0, MAX);
    }
  }

  // Strategy 3: meta description
  const meta = document.querySelector('meta[name="description"]');
  if (meta && meta.content && meta.content.trim().length > 40) {
    console.log('✅ Using meta description fallback');
    return normalizeScrapedDescription(meta.content).slice(0, MAX);
  }

  console.log('⚠️ No business description found on page');
  return '';
}

function getBusinessName() {
  // Try multiple strategies to find the business name
  
  // Strategy 1: Look for page title (most reliable)
  const pageTitle = document.title;
  console.log('Page title:', pageTitle);
  
  if (pageTitle && pageTitle !== 'Business For Sale') {
    // Clean up the title - remove common suffixes and location info
    let cleanTitle = pageTitle
      .replace(/\s*\|\s*For Sale in.*$/i, '') // Remove "| For Sale in [location]" and everything after
      .replace(/\s*-\s*BizQuest.*$/i, '')
      .replace(/\s*\|\s*BizBuySell.*$/i, '')
      .replace(/\s*-\s*Business For Sale.*$/i, '')
      .replace(/\s*\|\s*Crexi.*$/i, '')
      .replace(/\s*-\s*BizBuySell.*$/i, '')
      .replace(/\s*\|\s*BizQuest.*$/i, '') // Catch BizQuest.com
      .trim();
    
    console.log('Cleaned title:', cleanTitle);
    
    if (cleanTitle.length > 0 && cleanTitle.length < 150) {
      return cleanTitle;
    }
  }
  
  // Strategy 2: Look for h1 heading
  const h1 = document.querySelector('h1');
  if (h1 && h1.innerText && h1.innerText.trim().length > 0 && h1.innerText.trim().length < 150) {
    console.log('Found h1:', h1.innerText.trim());
    return h1.innerText.trim();
  }
  
  // Strategy 3: Look for specific business name selectors
  const selectors = [
    '[data-testid="listing-title"]',
    '.listing-title',
    '.business-name',
    'h1.title',
    '[class*="title"]',
    '[class*="heading"]'
  ];
  
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText && el.innerText.trim().length > 0 && el.innerText.trim().length < 150) {
      console.log('Found via selector', selector, ':', el.innerText.trim());
      return el.innerText.trim();
    }
  }
  
  console.log('No business name found, using fallback');
  // Fallback: Use generic name
  return 'Deal-Analysis';
}

// Helper function to sanitize filename
function sanitizeFilename(filename) {
  // Remove or replace invalid filename characters
  let sanitized = filename
    .replace(/[<>:"/\\|?*]/g, '-')  // Replace invalid chars with dash
    .replace(/\s+/g, ' ')             // Normalize whitespace
    .replace(/--+/g, '-')             // Replace multiple dashes with single dash
    .replace(/\.+$/, '')              // Remove trailing dots
    .trim();
  
  // Limit length but try to keep whole words
  if (sanitized.length > 80) {
    sanitized = sanitized.substring(0, 80).trim();
    // Remove partial word at end
    const lastSpace = sanitized.lastIndexOf(' ');
    if (lastSpace > 50) {
      sanitized = sanitized.substring(0, lastSpace);
    }
  }
  
  console.log('Sanitized filename:', sanitized);
  return sanitized;
}

// Generate actual PDF file with colors and formatting
function generatePDFFile() {
  try {
    // Check if jsPDF is loaded
    if (typeof window.jspdf === 'undefined') {
      throw new Error('jsPDF library not loaded. Please reload the page.');
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Get all the data
    const listingUrl = window.location.href;
    const ebitda = safeGetValue('da-ebitda', '$0');
    const askingPrice = safeGetValue('da-asking', '$0');
    const maxPrice = safeGetText('da-max-price', '$0');
    const offerPrice = safeGetValue('da-actual-price', '$0');
    const maxDebt = safeGetText('da-max-debt', '$0');
    const totalDebt = safeGetText('da-total-debt', '$0');
    const fcfAnnual = safeGetText('da-fcf-annual', '$0');
    const fcfMonthly = safeGetText('da-fcf-monthly', '$0');
    const ownerTakeHome = safeGetText('da-owner-salary', '$0');
    const targetSalary = safeGetValue('da-target-salary', '$0');
    const maxAvailable = safeGetText('da-max-available', '$0');
    
    const sbaPercent = safeGetValue('da-sba-percent', '0');
    const sbaLoan = safeGetValue('da-sba-loan', '$0');
    const downPercent = safeGetValue('da-down-percent', '0');
    const downPayment = safeGetValue('da-down', '$0');
    const bankRate = safeGetValue('da-bank-rate', '0');
    const bankTerm = safeGetValue('da-bank-term', '0');
    const dscr = safeGetValue('da-dscr', '0');
    
    const cocReturn = safeGetText('da-coc-return', '0%');
    const payback = safeGetText('da-payback', '0 yrs');
    const qualityScore = safeGetText('da-quality-score', '--');
    
    // Deal notes and name
    const dealNotes = safeGetValue('da-deal-notes', '').trim();
    const dealName = safeGetValue('da-deal-name', '').trim();
  
  // Helper function to draw a colored box
  const drawBox = (x, y, width, height, borderColor, bgColor) => {
    doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
    doc.rect(x, y, width, height, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.8);
    doc.line(x, y, x, y + height);
  };
  
  let y = 15;
  
  // Header with background
  doc.setFillColor(13, 46, 78); // Navy blue
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont(undefined, 'bold');
  const headerTitle = dealName || 'DEAL ANALYSIS REPORT';
  doc.text(headerTitle, 15, 16);
  
  y = 30;
  
  // Deal Quality Score & Date
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(`Quality Score: ${qualityScore}/100`, 15, y);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, 100, y);
  y += 6;
  
  // Clickable URL
  doc.setTextColor(52, 152, 219); // Blue
  doc.setFont(undefined, 'italic');
  doc.textWithLink('View Listing', 15, y, { url: listingUrl });
  doc.setTextColor(0, 0, 0);
  y += 10;
  
  // Financial Overview Section
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 102, 102);
  doc.text('FINANCIAL OVERVIEW', 15, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Business EBITDA: ${ebitda}`, 20, y);
  y += 5;
  doc.text(`Asking Price: ${askingPrice}`, 20, y);
  y += 10;
  
  // Maximum Allowable Section with colored boxes
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 102, 102);
  doc.text('MAXIMUM ALLOWABLE (DSCR-BASED)', 15, y);
  y += 6;
  
  // Green box for Max Price
  drawBox(15, y - 3, 3, 16, [39, 174, 96], [248, 249, 250]);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(85, 85, 85);
  doc.text('MAX ALLOWABLE PURCHASE PRICE', 22, y);
  y += 4;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 62, 80);
  doc.text(maxPrice, 22, y);
  y += 10;
  
  // Gray box for Max Debt
  drawBox(15, y - 3, 3, 16, [149, 165, 166], [248, 249, 250]);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(85, 85, 85);
  doc.text('MAX ANNUAL DEBT SERVICE', 22, y);
  y += 4;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 62, 80);
  doc.text(maxDebt, 22, y);
  y += 12;
  
  // ROI Section with colored boxes
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 102, 102);
  doc.text('RETURN ON INVESTMENT (YEAR 1)', 15, y);
  y += 6;
  
  // Orange box - Cash on Cash
  drawBox(15, y - 3, 3, 16, [230, 126, 34], [248, 249, 250]);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(85, 85, 85);
  doc.text('CASH-ON-CASH RETURN', 22, y);
  y += 4;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 62, 80);
  doc.text(cocReturn, 22, y);
  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(153, 153, 153);
  y += 4;
  doc.text('Annual return on equity', 22, y);
  y += 8;
  
  // Purple box - Payback
  drawBox(15, y - 3, 3, 16, [155, 89, 182], [248, 249, 250]);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(85, 85, 85);
  doc.text('PAYBACK PERIOD', 22, y);
  y += 4;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 62, 80);
  doc.text(payback, 22, y);
  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(153, 153, 153);
  y += 4;
  doc.text('Time to recover equity', 22, y);
  y += 12;
  
  // Financing Structure
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 102, 102);
  doc.text('FINANCING STRUCTURE', 15, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`SBA Loan: ${sbaPercent}% (${sbaLoan}) @ ${bankRate}% for ${bankTerm} years`, 20, y);
  y += 5;
  doc.text(`Target DSCR: ${dscr}`, 20, y);
  y += 5;
  doc.text(`Buyer Equity: ${downPercent}% (${downPayment})`, 20, y);
  y += 5;
  
  // Seller Note if enabled
  const sellerNoteCheckbox = document.getElementById('da-seller-note-enabled');
  const sellerNoteEnabled = sellerNoteCheckbox ? sellerNoteCheckbox.checked : false;
  if (sellerNoteEnabled) {
    const sellerPercent = safeGetValue('da-seller-percent', '0');
    const sellerAmt = safeGetValue('da-seller-amt', '$0');
    const sellerRate = safeGetValue('da-seller-rate', '0');
    const sellerStandby = safeGetValue('da-seller-standby', 'no') === 'yes' ? ' (Standby)' : '';
    const sellerPaymentType = safeGetValue('da-seller-payment-type', 'amortizing') === 'interest-only' ? 'Interest Only' : 'Amortizing';
    doc.text(`Seller Note: ${sellerPercent}% (${sellerAmt}) @ ${sellerRate}%${sellerStandby} - ${sellerPaymentType}`, 20, y);
    y += 5;
  }
  y += 5;
  
  // Actual Deal Scenario with colored boxes
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 102, 102);
  doc.text('ACTUAL DEAL SCENARIO', 15, y);
  y += 6;
  
  // Orange box - Offer Price
  drawBox(15, y - 3, 3, 16, [230, 126, 34], [248, 249, 250]);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(85, 85, 85);
  doc.text('OFFER PRICE', 22, y);
  y += 4;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 62, 80);
  doc.text(offerPrice, 22, y);
  y += 10;
  
  // Purple box - Total Debt Service
  drawBox(15, y - 3, 3, 16, [155, 89, 182], [248, 249, 250]);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(85, 85, 85);
  doc.text('TOTAL DEBT SERVICE', 22, y);
  y += 4;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 62, 80);
  doc.text(totalDebt, 22, y);
  y += 10;
  
  // Green box - Free Cash Flow
  drawBox(15, y - 3, 3, 20, [39, 174, 96], [248, 249, 250]);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(85, 85, 85);
  doc.text('FREE CASH FLOW (ANNUAL)', 22, y);
  y += 4;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 62, 80);
  doc.text(fcfAnnual, 22, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(102, 102, 102);
  doc.text(`Monthly: ${fcfMonthly}`, 22, y);
  y += 9;
  
  // Blue box - Total Owner Take-Home
  drawBox(15, y - 3, 3, 20, [52, 152, 219], [248, 249, 250]);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(85, 85, 85);
  doc.text('TOTAL OWNER TAKE-HOME', 22, y);
  y += 4;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(44, 62, 80);
  doc.text(ownerTakeHome, 22, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(153, 153, 153);
  doc.text(`Salary: ${targetSalary} + FCF (max available: ${maxAvailable})`, 22, y);
  y += 15;
  
  // Deal Notes Section (if present)
  if (dealNotes) {
    // Add page break if needed
    if (y > 250) {
      doc.addPage();
      y = 15;
    }
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(102, 102, 102);
    doc.text('DEAL NOTES', 15, y);
    y += 6;
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    
    // Split notes into lines (max ~85 chars per line)
    const noteLines = doc.splitTextToSize(dealNotes, 180);
    noteLines.forEach(line => {
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(line, 15, y);
      y += 5;
    });
    y += 5;
  }
  
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated by Vettr ${VERSION}`, 15, y);
  
  return doc;
  } catch (error) {
    console.error('Error in generatePDFFile:', error);
    throw error; // Re-throw so calling code can handle it
  }
}

// PDF Export
const sharePdfBtn = document.getElementById('da-share-pdf');
if (sharePdfBtn && shareModal) {
  sharePdfBtn.addEventListener('click', () => {
    try {
      const doc = generatePDFFile();
      const businessName = sanitizeFilename(getBusinessName());
      const filename = `${businessName}.pdf`;
      doc.save(filename);
      shareModal.style.display = 'none';
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('PDF generation failed: ' + err.message + '\n\nPlease reload the extension and try again.');
    }
  });
}

// Email share
const shareEmailBtn = document.getElementById('da-share-email');
if (shareEmailBtn && shareModal) {
  shareEmailBtn.addEventListener('click', () => {
    try {
      const subject = encodeURIComponent('Deal Analysis - Business Acquisition Opportunity');
      const body = encodeURIComponent(generateShareText());
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
      shareModal.style.display = 'none';
    } catch (err) {
      console.error('Email share error:', err);
      alert('Email share failed: ' + err.message);
    }
  });
}

// SMS share
const shareSmsBtn = document.getElementById('da-share-sms');
if (shareSmsBtn && shareModal) {
  shareSmsBtn.addEventListener('click', () => {
    try {
      const body = encodeURIComponent(generateShareText());
      window.open(`sms:?&body=${body}`, '_blank');
      shareModal.style.display = 'none';
    } catch (err) {
      console.error('SMS share error:', err);
      alert('SMS share failed: ' + err.message);
    }
  });
}

// Native share (includes AirDrop on Apple devices) - Share as actual PDF
const shareNativeBtn = document.getElementById('da-share-native');
if (shareNativeBtn && shareModal) {
  shareNativeBtn.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        // Generate the actual PDF file
        const doc = generatePDFFile();
        const pdfBlob = doc.output('blob');
        const businessName = sanitizeFilename(getBusinessName());
        const filename = `${businessName}.pdf`;
        
        // Check if we can share files (better for AirDrop)
        if (navigator.canShare) {
          try {
            const file = new File([pdfBlob], filename, { type: 'application/pdf' });
            const fileShareData = {
              title: 'Deal Analysis - Business Acquisition',
              files: [file]
            };
            
            if (navigator.canShare(fileShareData)) {
              await navigator.share(fileShareData);
              shareModal.style.display = 'none';
              return;
            }
          } catch (fileErr) {
            console.log('PDF file sharing not supported:', fileErr);
          }
        }
        
        // Fallback to text-only sharing
        const shareText = generateShareText();
        await navigator.share({
          title: 'Deal Analysis - Business Acquisition',
          text: shareText
        });
        shareModal.style.display = 'none';
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share error:', err);
          alert('Share failed: ' + err.message + '\n\nTry the "Export as PDF" button to download, then AirDrop the file.');
        }
      }
    } else {
      alert('Native sharing not supported on this browser. Try the "Export as PDF" button instead.');
    }
  });
}

// Copy to clipboard
const shareCopyBtn = document.getElementById('da-share-copy');
if (shareCopyBtn) {
  shareCopyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(generateShareText());
      const btn = document.getElementById('da-share-copy');
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        btn.style.background = '#27ae60';
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = '#95a5a6';
        }, 2000);
      }
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = generateShareText();
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      
      const btn = document.getElementById('da-share-copy');
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        btn.style.background = '#27ae60';
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = '#95a5a6';
        }, 2000);
      }
    }
  });
}

loadUserPreferences();
loadState();

// Restore window geometry on page load
restoreWindowGeometry();

// Update Target Offer Calculator display with user's actual settings
function updateTargetOfferDisplay() {
  // Update COC, salary and DSCR displays in the description
  const cocDisplay = document.getElementById('da-target-coc-display');
  const salaryDisplay = document.getElementById('da-target-salary-display');
  const dscrDisplay = document.getElementById('da-target-dscr-display');
  
  // Update COC display
  if (cocDisplay) {
    cocDisplay.innerText = userPreferences.targetCOC || 25;
  }
  
  // Update salary display
  if (salaryDisplay) {
    const targetSalary = parseNumber(document.getElementById('da-target-salary')?.value) || 150000;
    const salaryK = Math.round(targetSalary / 1000);
    salaryDisplay.innerText = salaryK + 'k';
  }
  
  // Update DSCR display
  if (dscrDisplay) {
    const targetDSCR = parseFloat(document.getElementById('da-dscr')?.value) || 1.25;
    dscrDisplay.innerText = targetDSCR;
  }
  
  console.log('✅ Target Offer display updated (COC: ' + (userPreferences.targetCOC || 25) + '%)');
}

// Call after preferences are loaded
setTimeout(updateTargetOfferDisplay, 100);

// Debug: Log current preferences after 1 second to verify persistence
setTimeout(() => {
  console.log('🔍 Current user preferences after load:', userPreferences);
  chrome.storage.local.get(['userPreferences'], (result) => {
    console.log('🔍 User preferences in storage:', result.userPreferences);
  });
}, 1000);

// --- 9. KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl + E: Toggle extension
  if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
    e.preventDefault();
    if (container.style.display === 'none') {
      container.style.display = 'flex';
    } else {
      container.style.display = 'none';
    }
  }
  
  // Cmd/Ctrl + S: Save deal (only when extension is visible)
  if ((e.metaKey || e.ctrlKey) && e.key === 's' && container.style.display === 'flex') {
    e.preventDefault();
    saveDeal();
  }
});

// --- 10. SAVE & LOAD DEALS ---
function tryVettrCloudSyncAfterSave(dealData) {
  if (typeof VettrCloudSync === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
  chrome.storage.local.get(['vettrApiBaseUrl', 'vettrAuthToken', 'userPreferences', 'daState'], (cfg) => {
    if (!cfg.vettrAuthToken || !cfg.vettrApiBaseUrl) {
      console.log('☁️ My Deals sync: not linked yet — sign in on Vettr in this browser, or use Manual setup in extension Settings if support asked you to.');
      return;
    }
    try {
      var body = VettrCloudSync.buildSaveDealRequest(dealData, {
        pageUrl: window.location.href,
        lastScrapeData: lastScrapeData || {},
        userPreferences: cfg.userPreferences || userPreferences,
        overrides: (cfg.daState && cfg.daState.overrides) || {}
      });
      chrome.runtime.sendMessage({ type: 'VETTR_SYNC_DEAL', body: body }, function (res) {
        if (chrome.runtime.lastError) {
          console.warn('☁️ Vettr Cloud:', chrome.runtime.lastError.message);
          return;
        }
        if (res && res.ok) {
          console.log('☁️ Vettr Cloud: deal synced to web My Deals');
          if (res.result && dealData) {
            VettrCloudSync.applySaveResponse(dealData, res.result);
            if (!dealData.dealId) dealData.dealId = body.dealId;
            chrome.storage.local.get(['savedDeals'], function (store) {
              const list = store.savedDeals || [];
              const idx = list.findIndex(function (d) {
                return d.name === dealData.name || (d.url && d.url === dealData.url);
              });
              if (idx !== -1) {
                Object.assign(list[idx], {
                  dealId: dealData.dealId,
                  vettrId: dealData.vettrId,
                  vettrUpdatedAt: dealData.vettrUpdatedAt,
                  cloudSyncedAt: dealData.cloudSyncedAt
                });
                chrome.storage.local.set({ savedDeals: list });
              }
            });
          }
        } else if (res && res.error) console.warn('☁️ Vettr Cloud sync failed:', res.error);
      });
    } catch (e) {
      console.warn('☁️ Vettr Cloud payload error:', e);
    }
  });
}

function saveDeal() {
  // Get or generate deal name
  let dealName = safeGetValue('da-deal-name', '').trim();
  if (!dealName) {
    // Auto-generate name from URL or business name
    const urlParts = window.location.pathname.split('/');
    dealName = `Deal ${new Date().toLocaleDateString()}`;
  }
  
  // Gather all deal data
  const dealData = {
    name: dealName,
    url: window.location.href,
    savedAt: new Date().toISOString(),
    description: lastScrapeData?.description || '',
    notes: safeGetValue('da-deal-notes', ''),
    brokerInfo: lastScrapeData?.brokerInfo || {
      name: '',
      company: '',
      phone: '',
      email: ''
    },
    inputs: {
      ebitda: safeGetValue('da-ebitda', ''),
      asking: safeGetValue('da-asking', ''),
      sbaPercent: safeGetValue('da-sba-percent', ''),
      sbaLoan: safeGetValue('da-sba-loan', ''),
      bankRate: safeGetValue('da-bank-rate', ''),
      bankTerm: safeGetValue('da-bank-term', ''),
      dscr: safeGetValue('da-dscr', ''),
      downPercent: safeGetValue('da-down-percent', ''),
      down: safeGetValue('da-down', ''),
      targetSalary: safeGetValue('da-target-salary', ''),
      sellerNoteEnabled: document.getElementById('da-seller-note-enabled')?.checked || false,
      sellerPercent: safeGetValue('da-seller-percent', ''),
      sellerAmt: safeGetValue('da-seller-amt', ''),
      sellerRate: safeGetValue('da-seller-rate', ''),
      sellerStandby: safeGetValue('da-seller-standby', ''),
      sellerPaymentType: safeGetValue('da-seller-payment-type', ''),
      actualPrice: safeGetValue('da-actual-price', '')
    },
    results: {
      maxPrice: safeGetText('da-max-price', ''),
      totalDebt: safeGetText('da-total-debt', ''),
      fcfAnnual: safeGetText('da-fcf-annual', ''),
      ownerTakeHome: safeGetText('da-owner-salary', ''),
      cocReturn: safeGetText('da-coc-return', ''),
      payback: safeGetText('da-payback', ''),
      qualityScore: safeGetText('da-quality-score', '')
    }
  };
  
  // Load existing saved deals
  chrome.storage.local.get(['savedDeals'], (result) => {
    let savedDeals = result.savedDeals || [];
    
    // Check if deal with this name already exists
    const existingIndex = savedDeals.findIndex(d => d.name === dealName);
    if (existingIndex >= 0) {
      // Update existing deal
      savedDeals[existingIndex] = dealData;
    } else {
      // Add new deal
      savedDeals.push(dealData);
    }
    
    // Save to storage
    chrome.storage.local.set({ savedDeals: savedDeals }, () => {
      console.log('Deal saved:', dealName);
      updateSavedDealsList();
      tryVettrCloudSyncAfterSave(dealData);
      
      // Visual feedback
      const saveBtn = document.getElementById('da-save-deal-btn');
      const originalText = saveBtn.innerHTML;
      saveBtn.innerHTML = '✅ Saved!';
      setTimeout(() => {
        saveBtn.innerHTML = originalText;
      }, 2000);
    });
  });
}

function loadDeal(dealName) {
  chrome.storage.local.get(['savedDeals'], (result) => {
    const savedDeals = result.savedDeals || [];
    const deal = savedDeals.find(d => d.name === dealName);
    
    if (!deal) return;
    
    // Load all inputs
    document.getElementById('da-deal-name').value = deal.name;
    document.getElementById('da-deal-notes').value = deal.notes || '';
    document.getElementById('da-ebitda').value = deal.inputs.ebitda;
    document.getElementById('da-asking').value = deal.inputs.asking;
    document.getElementById('da-sba-percent').value = deal.inputs.sbaPercent;
    document.getElementById('da-sba-loan').value = deal.inputs.sbaLoan;
    document.getElementById('da-bank-rate').value = deal.inputs.bankRate;
    document.getElementById('da-bank-term').value = deal.inputs.bankTerm;
    document.getElementById('da-dscr').value = deal.inputs.dscr;
    document.getElementById('da-down-percent').value = deal.inputs.downPercent;
    document.getElementById('da-down').value = deal.inputs.down;
    document.getElementById('da-target-salary').value = deal.inputs.targetSalary;
    document.getElementById('da-seller-note-enabled').checked = deal.inputs.sellerNoteEnabled;
    document.getElementById('da-seller-percent').value = deal.inputs.sellerPercent;
    document.getElementById('da-seller-amt').value = deal.inputs.sellerAmt;
    document.getElementById('da-seller-rate').value = deal.inputs.sellerRate;
    document.getElementById('da-seller-standby').value = deal.inputs.sellerStandby;
    document.getElementById('da-seller-payment-type').value = deal.inputs.sellerPaymentType;
    document.getElementById('da-actual-price').value = deal.inputs.actualPrice;
    
    // Show seller note section if enabled
    if (deal.inputs.sellerNoteEnabled) {
      document.getElementById('da-seller-note-section').style.display = 'block';
    }
    
    // Show deal URL link if available
    const dealUrlLink = document.getElementById('da-deal-url-link');
    const dealUrlAnchor = document.getElementById('da-deal-url-anchor');
    if (deal.url && dealUrlLink && dealUrlAnchor) {
      dealUrlAnchor.href = deal.url;
      dealUrlLink.style.display = 'block';
      console.log('Deal URL loaded:', deal.url);
    } else if (dealUrlLink) {
      dealUrlLink.style.display = 'none';
    }
    
    // Recalculate
    calculate();
    
    console.log('Deal loaded:', dealName);
  });
}

function updateSavedDealsList() {
  chrome.storage.local.get(['savedDeals'], (result) => {
    const savedDeals = result.savedDeals || [];
    const select = document.getElementById('da-saved-deals-list');
    
    // Clear existing options except first
    select.innerHTML = '<option value="">Load saved deal...</option>';
    
    // Add saved deals
    savedDeals.forEach(deal => {
      const option = document.createElement('option');
      option.value = deal.name;
      option.textContent = `${deal.name} (${new Date(deal.savedAt).toLocaleDateString()})`;
      select.appendChild(option);
    });
  });
}

// Event listeners for save/load
const saveDealBtn = document.getElementById('da-save-deal-btn');
if (saveDealBtn) {
  saveDealBtn.addEventListener('click', saveDeal);
}

// Footer save deal button
const saveDealBtnFooter = document.getElementById('da-save-deal-btn-footer');
if (saveDealBtnFooter) {
  saveDealBtnFooter.addEventListener('click', saveDeal);
}

const savedDealsList = document.getElementById('da-saved-deals-list');
if (savedDealsList) {
  savedDealsList.addEventListener('change', (e) => {
    if (e.target.value) {
      loadDeal(e.target.value);
    } else {
      // Hide the deal URL link when no deal is selected
      const dealUrlLink = document.getElementById('da-deal-url-link');
      if (dealUrlLink) {
        dealUrlLink.style.display = 'none';
      }
    }
  });
}

// Auto-save notes as user types (debounced)
let notesTimeout;
const dealNotesField = document.getElementById('da-deal-notes');
if (dealNotesField) {
  dealNotesField.addEventListener('input', () => {
    clearTimeout(notesTimeout);
    notesTimeout = setTimeout(() => {
      saveState(); // Save notes with current state
    }, 1000);
  });
}

// Load saved deals list on startup
updateSavedDealsList();

if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.savedDeals) {
      updateSavedDealsList();
    }
  });
}

// Recalc button - refreshes data from page
const recalcBtn = document.getElementById('da-recalc-btn');
if (recalcBtn) {
  recalcBtn.addEventListener('click', () => {
    console.log('🔄 Refresh Data button clicked');
    // Force a fresh scrape
    scrapeData();
  });
} else {
  console.warn('⚠️ Refresh button not found');
}

// Deal opportunity close button - dismisses the banner
const dealOpportunityClose = document.getElementById('da-deal-opportunity-close');
const dealOpportunityDiv = document.getElementById('da-deal-opportunity');
if (dealOpportunityClose && dealOpportunityDiv) {
  dealOpportunityClose.addEventListener('click', () => {
    dealOpportunityDiv.style.display = 'none';
  });
  
  // Add hover effect
  dealOpportunityClose.addEventListener('mouseenter', () => {
    dealOpportunityClose.style.opacity = '1';
  });
  dealOpportunityClose.addEventListener('mouseleave', () => {
    dealOpportunityClose.style.opacity = '0.7';
  });
}

// --- AUTO-REFRESH ON URL CHANGE ---
// Detects when user navigates to a new listing and automatically re-scrapes data
let lastUrl = window.location.href;

// Monitor URL changes (for single-page apps and navigation)
const urlObserver = new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    console.log('🔄 URL changed, auto-refreshing data...');
    console.log('   From:', lastUrl);
    console.log('   To:', currentUrl);
    lastUrl = currentUrl;
    
    // Wait a moment for the page to load new content
    setTimeout(() => {
      scrapeData();
      // Check if we should auto-open on business sites after URL change
      checkAutoOpen();
      console.log('✅ Auto-refresh complete');
    }, 1000); // 1 second delay to let dynamic content load
  }
});

// Start observing the document for changes
urlObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// Also listen for popstate events (back/forward navigation)
window.addEventListener('popstate', () => {
  console.log('🔄 Navigation detected (back/forward), auto-refreshing data...');
  setTimeout(() => {
    scrapeData();
    checkAutoOpen();
    console.log('✅ Auto-refresh complete');
  }, 1000);
});

// Listen for pushState/replaceState (used by single-page apps)
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function() {
  originalPushState.apply(this, arguments);
  console.log('🔄 Page navigation detected (pushState), auto-refreshing data...');
  setTimeout(() => {
    scrapeData();
    checkAutoOpen();
    console.log('✅ Auto-refresh complete');
  }, 1000);
};

history.replaceState = function() {
  originalReplaceState.apply(this, arguments);
  // Don't log or refresh for replaceState as it's often used for minor updates
};

console.log('✅ Auto-refresh functionality initialized');
