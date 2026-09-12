import { useState } from 'react';
import { Link } from 'react-router-dom';
import pkg from '../../package.json';
import { useTeam } from '../context/TeamContext';
import { useFeedbackUi } from './feedback/FeedbackShell';
import { isStandaloneDisplay } from '../utils/pwaInstall';

export default function Navigation({
  user,
  logout,
  isGuest = false,
  activeTab,
  setActiveTab,
  pageTitle = 'Find It. Vett It. Save It.',
  pageSubtitle,
  showTabs = true,
  aggregatorCount = 0,
  crmCount = 0,
  crmBadgeCount = 0,
  offMarketCount = 0,
  onOpenQuickCalculator = null,
  onStartTour = null,
  compact = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { teams, activeTeamId, setActiveTeamId, activeTeam, isTeamMode } = useTeam();
  const feedbackUi = useFeedbackUi();
  const showGetTheApp = !isStandaloneDisplay();

  const roleLabel = (role) => {
    const r = String(role || '').toLowerCase();
    if (r === 'admin') return 'Admin';
    if (r === 'viewer') return 'Viewer';
    if (r === 'member') return 'Member';
    return role ? String(role) : null;
  };
  const activeRole = activeTeam ? roleLabel(activeTeam.role) : null;

  const teamSwitcher = !isGuest && user ? (
    <div className="nav-team-switcher">
      <label className="nav-team-switcher__control">
        <span className="nav-team-switcher__label">Workspace</span>
        <select
          value={activeTeamId != null ? String(activeTeamId) : ''}
          onChange={(e) => setActiveTeamId(e.target.value || null)}
          aria-label="Active team workspace"
        >
          <option value="">Personal</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{t.role ? ` (${roleLabel(t.role)})` : ''}
            </option>
          ))}
        </select>
      </label>
      {activeRole ? (
        <span
          className={`nav-team-role nav-team-role--${String(activeTeam.role || '').toLowerCase()}`}
          title={`Your privilege on ${activeTeam.name}: ${activeRole}`}
        >
          {activeRole}
        </span>
      ) : null}
    </div>
  ) : null;

  const feedbackLinks = (
    <>
      <button
        type="button"
        className="header-link feedback-nav-btn"
        onClick={() => { feedbackUi.openReportScreen(); setMenuOpen(false); }}
        title="Report this screen (Shift+F)"
      >
        Report screen
      </button>
      <button
        type="button"
        className="header-link feedback-nav-btn"
        onClick={() => { feedbackUi.openWidget(); setMenuOpen(false); }}
        title="Send feedback (Shift+G)"
      >
        Feedback
        {feedbackUi.unreadCount > 0 ? (
          <span className="feedback-nav-badge">{feedbackUi.unreadCount}</span>
        ) : null}
      </button>
      {!isGuest && user ? (
        <button
          type="button"
          className="header-link"
          onClick={() => { feedbackUi.openMine(); setMenuOpen(false); }}
        >
          My feedback
        </button>
      ) : null}
      {feedbackUi.isAdmin ? (
        <Link to="/admin/feedback" className="header-link" onClick={() => setMenuOpen(false)}>
          Admin inbox
        </Link>
      ) : null}
    </>
  );

  const actionLinks = (
    <>
      {teamSwitcher}
      {feedbackLinks}
      {isGuest ? (
        <>
          <Link to="/login" className="header-link" onClick={() => setMenuOpen(false)}>Sign in</Link>
          <Link to="/register" className="header-link header-link--primary" onClick={() => setMenuOpen(false)}>Sign up</Link>
        </>
      ) : (
        <>
          <span className="nav-user-pill">{user?.email}</span>
          {showGetTheApp ? (
            <Link to="/settings#get-the-app" className="header-link" onClick={() => setMenuOpen(false)}>Get the app</Link>
          ) : null}
          <Link to="/settings" className="header-link" onClick={() => setMenuOpen(false)}>Settings</Link>
          <Link to="/app/underwriting" className="header-link" onClick={() => setMenuOpen(false)}>Underwriting</Link>
          <Link to="/billing" className="header-link" onClick={() => setMenuOpen(false)}>Billing</Link>
          <button type="button" onClick={() => { logout(); setMenuOpen(false); }} className="header-link">Logout</button>
        </>
      )}
      {typeof onStartTour === 'function' && (
        <button type="button" className="header-link" onClick={() => { onStartTour(); setMenuOpen(false); }}>
          Take a tour
        </button>
      )}
      {typeof onOpenQuickCalculator === 'function' && (
        <button
          type="button"
          className="header-link header-link--calculator"
          onClick={() => { onOpenQuickCalculator(); setMenuOpen(false); }}
        >
          Quick Deal Calculator
        </button>
      )}
    </>
  );

  return (
    <>
      <nav className={`app-header${compact ? ' app-header--compact' : ''}`}>
        <div className="app-header-brand">
          <img
            className="app-header-logo"
            src="/vettr-logo.png"
            alt="Vettr"
            width={420}
            height={120}
            decoding="async"
          />
          {!compact && (
            <div className="app-header-copy">
              <h1>{pageTitle}</h1>
              {pageSubtitle != null && pageSubtitle !== '' ? <p>{pageSubtitle}</p> : null}
            </div>
          )}
        </div>

        <div className="app-header-actions app-header-actions--desktop">
          {actionLinks}
        </div>

        <button
          type="button"
          className="app-header-menu-btn"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {menuOpen && (
        <div className="app-header-mobile-menu" role="menu">
          {actionLinks}
        </div>
      )}

      {showTabs && (
        <div className={`tab-navigation${compact ? ' tab-navigation--compact' : ''}`}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'aggregator' ? 'active' : ''}`}
            onClick={() => setActiveTab('aggregator')}
          >
            <span>Deal Aggregator</span>
            <span className="tab-badge">{aggregatorCount}</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'crm' ? 'active' : ''}`}
            data-tour="crm-tab"
            onClick={() => setActiveTab('crm')}
            title={isTeamMode && activeTeam ? `${activeTeam.name} CRM` : 'Vettr CRM'}
          >
            <span>{isTeamMode && activeTeam ? `${activeTeam.name} CRM` : 'Vettr CRM'}</span>
            {!isGuest ? (
              <span className={`tab-badge${crmBadgeCount > 0 ? ' tab-badge--alert' : ''}`}>
                {crmBadgeCount > 0 ? crmBadgeCount : crmCount}
              </span>
            ) : (
              <span className="tab-badge">{crmCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'off-market' ? 'active' : ''}`}
            onClick={() => setActiveTab('off-market')}
            title="Off Market outreach"
          >
            <span>Off Market</span>
            <span className="tab-badge">{offMarketCount}</span>
          </button>
          {!compact && (
            <span className="app-header-version tab-navigation-version" title="App version">v{pkg.version}</span>
          )}
        </div>
      )}
    </>
  );
}
