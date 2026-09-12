import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { userAPI } from '../utils/api';
import Navigation from '../components/Navigation';
import TeamsSettingsPanel from '../components/TeamsSettingsPanel';
import GetTheAppPanel from '../components/GetTheAppPanel';
import GoogleIntegrationsPanel from '../components/GoogleIntegrationsPanel';
import LlmIntegrationsPanel from '../components/LlmIntegrationsPanel';
import { useAuth } from '../context/AuthContext';
import {
  notificationPermission,
  pushSupported,
  requestNotificationPermission,
  showLocalNotification,
  subscribeWebPush,
  unsubscribeWebPush
} from '../utils/webNotifications';

const SETTINGS_EXPORT_VERSION = 1;
const DEFAULT_SETTINGS = {
  buyBox: {},
  excludeKeywords: [],
  excludeLists: {},
  currentExcludeList: null,
  hiddenDealIds: [],
  preferences: {},
  customSources: [],
  autoRefreshEnabled: false,
  refreshInterval: 60,
  notifyNewDeals: true,
  notificationFrequency: 'daily',
  notificationChannel: 'email',
  visibleColumns: [],
  dealViewStyle: 'table'
};

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

function buildExportPayload(settings) {
  return {
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: SETTINGS_KEYS.reduce((acc, key) => {
      if (settings[key] !== undefined) acc[key] = settings[key];
      return acc;
    }, {})
  };
}

function parseImportPayload(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object') return null;
  const raw = data.settings || data;
  const settings = {};
  for (const key of SETTINGS_KEYS) {
    if (raw[key] !== undefined) settings[key] = raw[key];
  }
  return Object.keys(settings).length ? settings : null;
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [settings, setSettings] = useState(null);
  const [notificationFrequency, setNotificationFrequency] = useState('daily');
  const [hideSavedDealsInFeed, setHideSavedDealsInFeed] = useState(false);
  const [crmEmailDigest, setCrmEmailDigest] = useState(false);
  const [browserNotifications, setBrowserNotifications] = useState(false);
  const [pushStatus, setPushStatus] = useState(() => notificationPermission());
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [showSavedHighlightInFeed, setShowSavedHighlightInFeed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importPaste, setImportPaste] = useState('');
  const [importError, setImportError] = useState('');
  const [exportResetMessage, setExportResetMessage] = useState('');
  const fileInputRef = useRef(null);

  const viteExtensionId = import.meta.env.VITE_EXTENSION_ID || '';
  const chromeStoreUrl = (import.meta.env.VITE_CHROME_STORE_URL || '').trim();

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (location.hash === '#get-the-app') {
      const el = document.getElementById('get-the-app');
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    }
  }, [loading, location.hash]);

  const loadSettings = async () => {
    try {
      const data = await userAPI.getSettings();
      setSettings(data);
      setNotificationFrequency(data.notificationFrequency || 'daily');
      setHideSavedDealsInFeed(Boolean(data.preferences?.hideSavedDealsInFeed));
      setCrmEmailDigest(Boolean(data.preferences?.crmEmailDigest));
      setBrowserNotifications(Boolean(data.preferences?.browserNotifications));
      setPushStatus(notificationPermission());
      setShowSavedHighlightInFeed(data.preferences?.showSavedHighlightInFeed !== false);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const flashNotify = (msg) => {
    setNotifyMessage(msg);
    setTimeout(() => setNotifyMessage(''), 5000);
  };

  const handleToggleBrowserNotifications = async (checked) => {
    const prev = browserNotifications;
    setBrowserNotifications(checked);
    setNotifyBusy(true);
    try {
      if (checked) {
        const permission = await requestNotificationPermission();
        setPushStatus(permission);
        if (permission !== 'granted') {
          setBrowserNotifications(false);
          flashNotify(
            permission === 'denied'
              ? 'Notifications are blocked in the browser. Allow them for this site, then try again.'
              : 'Notification permission is required.'
          );
          return;
        }
        const sub = await subscribeWebPush(userAPI);
        if (!sub.ok && sub.reason !== 'unsupported') {
          console.warn('[settings] push subscribe', sub.reason);
        }
        await userAPI.updateSettings({ preferences: { browserNotifications: true } });
        setSettings((s) =>
          s ? { ...s, preferences: { ...s.preferences, browserNotifications: true } } : s
        );
        await showLocalNotification('Vettr alerts on', {
          body: 'You will get desktop and PWA alerts for matching deals and team CRM activity.',
          tag: 'vettr-enabled',
          url: '/settings',
          actionTitle: 'Open Settings'
        });
        flashNotify(
          sub.ok
            ? 'Desktop and PWA notifications enabled.'
            : 'Desktop alerts enabled. PWA push is unavailable in this browser (install the app on iOS, or use Chrome/Edge).'
        );
      } else {
        await unsubscribeWebPush(userAPI);
        await userAPI.updateSettings({ preferences: { browserNotifications: false } });
        setSettings((s) =>
          s ? { ...s, preferences: { ...s.preferences, browserNotifications: false } } : s
        );
        flashNotify('Browser notifications turned off.');
      }
    } catch (err) {
      setBrowserNotifications(prev);
      flashNotify(err.message || 'Failed to update notifications');
    } finally {
      setNotifyBusy(false);
    }
  };

  const handleTestDesktop = async () => {
    setNotifyBusy(true);
    try {
      const permission = await requestNotificationPermission();
      setPushStatus(permission);
      if (permission !== 'granted') {
        flashNotify('Allow notifications for this site first.');
        return;
      }
      const shown = await showLocalNotification('Vettr test', {
        body: 'Desktop notification is working. Use Open Settings if this toast is still showing.',
        tag: 'vettr-test',
        url: '/settings',
        actionTitle: 'Open Settings'
      });
      let pushNote = '';
      try {
        const r = await userAPI.testPush();
        if (r?.pushed) pushNote = ' Push sent to installed app/other devices.';
        else if (r?.reason === 'no_subscription') pushNote = ' Enable browser notifications to also test PWA push.';
      } catch (err) {
        console.warn('[settings] test push', err.message);
      }
      flashNotify(shown ? `Desktop test shown.${pushNote}` : `Could not show a desktop notification.${pushNote}`);
    } finally {
      setNotifyBusy(false);
    }
  };

  const handleSendDigestNow = async () => {
    setNotifyBusy(true);
    try {
      const r = await userAPI.sendDigestNow();
      if (r?.emailed) {
        flashNotify(
          `Email sent to ${r.email || 'your account'}. ${r.deals || 0} matching deals, ${r.team || 0} team items.`
        );
      } else if (r?.sent) {
        const why = r.emailReason || 'Gmail send is not available and server SMTP is off.';
        flashNotify(
          `Summary built (${r.deals || 0} deals, ${r.team || 0} team items) but email did not send. ${why}`
        );
      } else {
        flashNotify(r?.reason === 'empty'
          ? 'Nothing to send yet — no new matching deals or team activity in the lookback window.'
          : 'Digest ran but had nothing to send.');
      }
    } catch (err) {
      flashNotify(err.message || 'Failed to send digest');
    } finally {
      setNotifyBusy(false);
    }
  };

  const handleToggleCrmEmailDigest = async (checked) => {
    const prev = crmEmailDigest;
    setCrmEmailDigest(checked);
    try {
      await userAPI.updateSettings({ preferences: { crmEmailDigest: checked } });
      setSettings((s) =>
        s ? { ...s, preferences: { ...s.preferences, crmEmailDigest: checked } } : s
      );
    } catch {
      setCrmEmailDigest(prev);
      alert('Failed to update CRM email preference');
    }
  };

  const handleToggleHideSavedInFeed = async (checked) => {
    const prev = hideSavedDealsInFeed;
    setHideSavedDealsInFeed(checked);
    try {
      await userAPI.updateSettings({ preferences: { hideSavedDealsInFeed: checked } });
      setSettings((s) =>
        s ? { ...s, preferences: { ...s.preferences, hideSavedDealsInFeed: checked } } : s
      );
    } catch (error) {
      setHideSavedDealsInFeed(prev);
      alert('Failed to save: ' + error.message);
    }
  };

  const handleToggleShowSavedHighlight = async (checked) => {
    const prev = showSavedHighlightInFeed;
    setShowSavedHighlightInFeed(checked);
    try {
      await userAPI.updateSettings({ preferences: { showSavedHighlightInFeed: checked } });
      setSettings((s) =>
        s ? { ...s, preferences: { ...s.preferences, showSavedHighlightInFeed: checked } } : s
      );
    } catch (error) {
      setShowSavedHighlightInFeed(prev);
      alert('Failed to save: ' + error.message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await userAPI.updateSettings({ notificationFrequency });
      setExportResetMessage('Settings saved successfully!');
      setTimeout(() => setExportResetMessage(''), 4000);
    } catch (error) {
      alert('Failed to save settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!settings) return;
    const payload = buildExportPayload(settings);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vettr-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportResetMessage('Settings exported.');
    setTimeout(() => setExportResetMessage(''), 4000);
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all settings to defaults? This cannot be undone.')) return;
    setSaving(true);
    setImportError('');
    try {
      await userAPI.updateSettings(DEFAULT_SETTINGS);
      await loadSettings();
      setExportResetMessage('Settings reset to defaults.');
      setTimeout(() => setExportResetMessage(''), 4000);
    } catch (error) {
      setImportError('Reset failed: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleImportFromFile = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    setImportError('');
    try {
      const text = await file.text();
      const parsed = parseImportPayload(text);
      if (!parsed) {
        setImportError('Invalid settings file. Expected JSON with a settings object.');
        return;
      }
      setSaving(true);
      await userAPI.updateSettings(parsed);
      await loadSettings();
      setNotificationFrequency(parsed.notificationFrequency ?? settings?.notificationFrequency ?? 'daily');
      setExportResetMessage('Settings imported successfully.');
      setImportPaste('');
      setTimeout(() => setExportResetMessage(''), 4000);
    } catch (err) {
      setImportError(err.message || 'Failed to read or import file.');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  };

  const handleImportFromPaste = async () => {
    if (!importPaste.trim()) {
      setImportError('Paste JSON first.');
      return;
    }
    setImportError('');
    try {
      const parsed = parseImportPayload(importPaste.trim());
      if (!parsed) {
        setImportError('Invalid JSON. Expected an object with settings or a versioned export.');
        return;
      }
      setSaving(true);
      await userAPI.updateSettings(parsed);
      await loadSettings();
      setNotificationFrequency(parsed.notificationFrequency ?? settings?.notificationFrequency ?? 'daily');
      setExportResetMessage('Settings imported successfully.');
      setImportPaste('');
      setTimeout(() => setExportResetMessage(''), 4000);
    } catch (err) {
      setImportError(err.message || 'Invalid JSON.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-screen">Loading settings...</div>;

  return (
    <div className="app-page-shell">
      <Navigation
        user={user}
        logout={logout}
        showTabs={false}
        pageTitle="Vettr"
        pageSubtitle="Settings and notification preferences"
      />
      
      <div className="settings-page dashboard-content">
        <h1>Settings</h1>
        <div className="settings-page-actions">
          <Link to="/" className="btn-secondary">Back to Dashboard</Link>
        </div>

        <div className="settings-section" id="get-the-app">
          <h2>Get the app</h2>
          <GetTheAppPanel />
        </div>

        <div className="settings-section">
          <h2>Notifications</h2>
          <p>
            Daily email at 9:00 AM Pacific groups new market deals by buy-box order, then team CRM
            activity (for example &ldquo;jamie added 4 new deals&rdquo;) and @mentions.
          </p>

          <div className="radio-group">
            <label>
              <input
                type="radio"
                value="instant"
                checked={notificationFrequency === 'instant'}
                onChange={(e) => setNotificationFrequency(e.target.value)}
              />
              <span>
                <strong>Instant</strong> — email as soon as new listings match (Paid plan). Desktop/PWA still follow the toggle below.
              </span>
            </label>

            <label>
              <input
                type="radio"
                value="daily"
                checked={notificationFrequency === 'daily'}
                onChange={(e) => setNotificationFrequency(e.target.value)}
              />
              <span>
                <strong>Daily</strong> — one summary email per day at 9:00 AM
              </span>
            </label>

            <label>
              <input
                type="radio"
                value="weekly"
                checked={notificationFrequency === 'weekly'}
                onChange={(e) => setNotificationFrequency(e.target.value)}
              />
              <span>
                <strong>Weekly</strong> — one summary email every Monday at 9:00 AM
              </span>
            </label>
          </div>

          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save email frequency'}
          </button>

          <div className="settings-checkbox-list" style={{ marginTop: 20 }}>
            <label className="settings-checkbox-row">
              <input
                type="checkbox"
                checked={browserNotifications}
                disabled={notifyBusy || pushStatus === 'unsupported'}
                onChange={(e) => handleToggleBrowserNotifications(e.target.checked)}
              />
              <span>
                <strong>Desktop &amp; PWA alerts</strong> — OS notifications in the browser and the
                installed app, including @mentions and batched team CRM updates. On iPhone, add Vettr
                to the Home Screen first, then enable this.
                {pushStatus === 'denied' ? ' (Blocked in the browser — reset permission for this site.)' : ''}
                {pushStatus === 'unsupported' ? ' (This browser does not support notifications.)' : ''}
                {!pushSupported() ? ' Web Push is not available here; desktop alerts still work while Vettr is open.' : ''}
              </span>
            </label>
          </div>

          <div className="settings-action-row" style={{ marginTop: 14, gap: 10, display: 'flex', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={notifyBusy}
              onClick={handleTestDesktop}
            >
              {notifyBusy ? 'Working…' : 'Test desktop / PWA alert'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={notifyBusy}
              onClick={handleSendDigestNow}
            >
              Send me today&apos;s summary now
            </button>
          </div>
          {notifyMessage ? (
            <p
              className={`settings-message ${notifyMessage.toLowerCase().includes('did not send') || notifyMessage.toLowerCase().includes('failed') ? 'settings-message-error' : 'settings-message-success'}`}
              role="status"
              style={{ marginTop: 12 }}
            >
              {notifyMessage}
            </p>
          ) : null}
        </div>

        <div className="settings-section">
          <h2>Market feed</h2>
          <p>
            Control how saved listings appear in the deal table and card views on the dashboard. Use{' '}
            <strong>Hide saved deals</strong> for an inbox-style workflow: after you save a listing, it leaves the market
            feed so you can focus on what is still new.
          </p>
          <div className="settings-checkbox-list">
            <label className="settings-checkbox-row">
              <input
                type="checkbox"
                checked={showSavedHighlightInFeed}
                onChange={(e) => handleToggleShowSavedHighlight(e.target.checked)}
              />
              <span>
                <strong>Highlight saved listings</strong> — show a red &ldquo;Saved&rdquo; button (or filled heart in
                cards) when a row is already in My Deals. Turn off for a quieter, neutral &ldquo;Saved&rdquo; style.
              </span>
            </label>
            <label className="settings-checkbox-row">
              <input
                type="checkbox"
                checked={hideSavedDealsInFeed}
                onChange={(e) => handleToggleHideSavedInFeed(e.target.checked)}
              />
              <span>
                <strong>Hide saved deals from the feed</strong> — remove saved listings from the market list (table /
                cards). Open <strong>My Deals</strong> to review them.
              </span>
            </label>
          </div>
        </div>

        {user ? (
          <div className="settings-section">
            <h2>Google</h2>
            <p>
              One connect for Gmail send (Quick IOI and Off Market campaigns) and CRM Calendar.
              Inbox tracking for Off Market replies is optional — enable it below after connect.
            </p>
            <GoogleIntegrationsPanel />
          </div>
        ) : null}

        {user ? (
          <div className="settings-section">
            <h2>AI / Agent</h2>
            <p>
              Bring your own model or outreach agent for Off Market research and reply classification.
              Keys are stored encrypted on the API and never included in Settings export.
            </p>
            <LlmIntegrationsPanel />
          </div>
        ) : null}

        {user ? (
          <div className="settings-section">
            <h2>CRM</h2>
            <p>
              Task reminders and the daily digest send from your connected Gmail when possible.
              Vettr-branded mail (team invites, feedback) still uses server SMTP.
            </p>
            <label className="settings-checkbox-row">
              <input
                type="checkbox"
                checked={crmEmailDigest}
                onChange={(e) => handleToggleCrmEmailDigest(e.target.checked)}
              />
              <span>
                <strong>Daily CRM digest</strong> — fold overdue tasks, due-today items, and DD deadlines into the morning summary email.
              </span>
            </label>
          </div>
        ) : null}

        <div className="settings-section">
          <h2>Chrome extension</h2>
          <p>
            Install the Vettr Chrome extension in the same Chrome profile you use here. Sign in once
            (in the extension or on this site) so <strong>My Deals</strong> stay in sync both ways —
            save on a listing page, see it on the web; edit notes here, see them in the extension.
          </p>
          {chromeStoreUrl ? (
            <p>
              <a
                href={chromeStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ display: 'inline-block', textDecoration: 'none' }}
              >
                Install from Chrome Web Store
              </a>
            </p>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--text-secondary, #666)' }}>
              Chrome Web Store listing is coming soon. Until then, ask your Vettr admin for the
              extension package, or load the unpacked build from the repo.
            </p>
          )}
          <p style={{ fontSize: 14, color: 'var(--text-secondary, #666)' }}>
            After installing, open this Settings page once while signed in so the extension can link
            to your account automatically
            {viteExtensionId ? '.' : ' (automatic linking activates after the store listing ID is configured).'}
          </p>
        </div>

        <div className="settings-section">
          <h2>Teams</h2>
          <TeamsSettingsPanel />
        </div>

        <div className="settings-section">
          <h2>Export / Reset / Import</h2>
          <p>Back up your settings to a file, restore from a backup, or reset everything to defaults.</p>
          {exportResetMessage && (
            <p className="settings-message settings-message-success" role="status">{exportResetMessage}</p>
          )}
          {importError && (
            <p className="settings-message settings-message-error" role="alert">{importError}</p>
          )}
          <div className="settings-export-reset-import">
            <div className="settings-action-row">
              <button type="button" className="btn-secondary" onClick={handleExport} disabled={!settings}>
                Export settings
              </button>
              <button type="button" className="btn-secondary settings-btn-danger" onClick={handleReset} disabled={saving}>
                {saving ? '…' : 'Reset to defaults'}
              </button>
            </div>
            <div className="settings-import-row">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFromFile}
                className="settings-file-input"
                aria-label="Import settings from file"
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                Import from file
              </button>
              <span className="settings-import-or">or paste JSON:</span>
              <textarea
                className="settings-import-textarea"
                placeholder='{"settings": { ... }} or { "buyBox": {}, ... }'
                value={importPaste}
                onChange={(e) => setImportPaste(e.target.value)}
                rows={3}
                disabled={saving}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={handleImportFromPaste}
                disabled={saving || !importPaste.trim()}
              >
                {saving ? 'Importing...' : 'Import from paste'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
