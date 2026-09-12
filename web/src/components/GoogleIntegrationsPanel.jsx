import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { crmAPI } from '../utils/api';

export default function GoogleIntegrationsPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const connection = await crmAPI.getCalendarStatus();
      setStatus(connection);
    } catch (err) {
      console.error('[GoogleIntegrations] status failed', err);
      setStatus({
        connected: false,
        oauthConfigured: false,
        statusError: err.message || 'Could not load Google connection'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const google = searchParams.get('google');
    const message = searchParams.get('message');
    if (!google) return;

    if (google === 'connected') {
      setFlash({ type: 'success', text: 'Google connected. Gmail send and Calendar are ready.' });
      load();
    } else if (google === 'error') {
      setFlash({
        type: 'error',
        text: message ? decodeURIComponent(message) : 'Google connection failed.'
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete('google');
    next.delete('message');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, load]);

  const handleConnect = async () => {
    setConnecting(true);
    setFlash(null);
    try {
      const { url } = await crmAPI.startCalendarOAuth('settings');
      window.location.href = url;
    } catch (err) {
      setFlash({ type: 'error', text: err.message || 'Could not start Google sign-in' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Google from Vettr? Quick IOI will stop sending from Gmail until you reconnect.')) {
      return;
    }
    setDisconnecting(true);
    setFlash(null);
    try {
      await crmAPI.disconnectCalendar();
      await load();
      setFlash({ type: 'success', text: 'Google disconnected.' });
    } catch (err) {
      setFlash({ type: 'error', text: err.message || 'Failed to disconnect' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return <p className="settings-google-status">Checking Google connection…</p>;
  }

  const oauthReady = Boolean(status?.oauthConfigured);
  const connected = Boolean(status?.connected);

  return (
    <div className="settings-google">
      {flash ? (
        <p className={flash.type === 'error' ? 'settings-message settings-message-error' : 'settings-message settings-message-success'} role="status">
          {flash.text}
        </p>
      ) : null}

      {status?.statusError ? (
        <p className="settings-message settings-message-error">{status.statusError}</p>
      ) : null}

      <ul className="settings-google-list">
        <li>
          <strong>Gmail</strong>
          {status?.gmail
            ? ` — send IOIs and Off Market campaigns from ${status.googleEmail || 'your Google account'}`
            : connected
              ? ' — reconnect to allow sending from Gmail'
              : ' — not connected'}
        </li>
        <li>
          <strong>Gmail inbox tracking</strong>
          {status?.gmailReadonly
            ? ' — Off Market can read campaign threads for bounce/reply'
            : ' — not enabled (optional)'}
        </li>
        <li>
          <strong>Calendar</strong>
          {status?.calendar
            ? ` — connected${status.googleEmail ? ` as ${status.googleEmail}` : ''}`
            : ' — not connected'}
        </li>
        <li>
          <strong>Server SMTP</strong>
          {status?.smtpConfigured
            ? ' — on (Vettr-branded mail: invites, feedback)'
            : ' — off (CRM reminders still send if Gmail is connected)'}
        </li>
      </ul>

      {status?.redirectUri ? (
        <p className="settings-google-redirect">
          OAuth redirect URI (must be listed on the Google Cloud OAuth client):{' '}
          <code>{status.redirectUri}</code>
        </p>
      ) : null}

      {!oauthReady ? (
        <p>
          Add <code>GOOGLE_CALENDAR_CLIENT_ID</code> and <code>GOOGLE_CALENDAR_CLIENT_SECRET</code> to the
          API server, enable Gmail API and Google Calendar API, then restart the API.
        </p>
      ) : null}

      <div className="settings-action-row">
        {connected ? (
          <>
            <button
              type="button"
              className="btn-primary"
              disabled={connecting || !oauthReady}
              onClick={handleConnect}
            >
              {connecting ? 'Redirecting…' : 'Reconnect Google'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={connecting || !oauthReady || Boolean(status?.gmailReadonly)}
              onClick={async () => {
                setConnecting(true);
                setFlash(null);
                try {
                  const { url } = await crmAPI.startCalendarOAuth({ returnTo: 'settings', gmailReadonly: true });
                  window.location.href = url;
                } catch (err) {
                  setFlash({ type: 'error', text: err.message || 'Could not start Google sign-in' });
                  setConnecting(false);
                }
              }}
            >
              {status?.gmailReadonly ? 'Inbox tracking on' : 'Enable inbox tracking'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={disconnecting}
              onClick={handleDisconnect}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={connecting || !oauthReady}
            onClick={handleConnect}
          >
            {connecting ? 'Redirecting…' : 'Connect Google (Gmail + Calendar)'}
          </button>
        )}
      </div>
    </div>
  );
}
