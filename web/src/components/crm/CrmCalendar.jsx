import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { crmAPI } from '../../utils/api';
import CrmCalendarView from './CrmCalendarView';

export default function CrmCalendar({ onOpenDeal }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    let oauthConfigured = false;
    let redirectUri = null;
    let warning = null;

    try {
      const config = await crmAPI.getCalendarOAuthConfig();
      oauthConfigured = Boolean(config.oauthConfigured);
      redirectUri = config.redirectUri || null;
      warning = config.warning || null;
    } catch (err) {
      console.error('[CrmCalendar] oauth config load failed', err);
    }

    try {
      const connection = await crmAPI.getCalendarStatus();
      setStatus({
        ...connection,
        oauthConfigured: oauthConfigured || Boolean(connection.oauthConfigured),
        redirectUri: redirectUri || connection.redirectUri || null,
        warning
      });
    } catch (err) {
      console.error('[CrmCalendar] calendar status load failed', err);
      setStatus({
        connected: false,
        oauthConfigured,
        redirectUri,
        warning,
        statusError: err.message || 'Could not load calendar connection status'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const calendarResult = searchParams.get('calendar');
    const message = searchParams.get('message');
    if (!calendarResult) return;

    if (calendarResult === 'connected') {
      setFlash({ type: 'success', text: 'Google connected. Calendar and Gmail send are ready.' });
      load();
    } else if (calendarResult === 'error') {
      setFlash({
        type: 'error',
        text: message ? decodeURIComponent(message) : 'Google Calendar connection failed.'
      });
    }

    const next = new URLSearchParams(searchParams);
    next.delete('calendar');
    next.delete('message');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, load]);

  const handleConnect = async () => {
    setConnecting(true);
    setFlash(null);
    try {
      const { url } = await crmAPI.startCalendarOAuth();
      window.location.href = url;
    } catch (err) {
      setFlash({ type: 'error', text: err.message || 'Could not start Google OAuth' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Google Calendar from Vettr?')) return;
    setDisconnecting(true);
    setFlash(null);
    try {
      await crmAPI.disconnectCalendar();
      await load();
      setFlash({ type: 'success', text: 'Google Calendar disconnected.' });
    } catch (err) {
      setFlash({ type: 'error', text: err.message || 'Failed to disconnect' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return <div className="crm-panel">Loading calendar…</div>;

  const oauthReady = Boolean(status?.oauthConfigured);

  if (status?.connected) {
    return (
      <div className="crm-calendar">
        {flash ? (
          <p className={flash.type === 'error' ? 'crm-panel--error' : 'crm-calendar__flash'}>
            {flash.text}
          </p>
        ) : null}
        <CrmCalendarView
          onDisconnect={handleDisconnect}
          disconnecting={disconnecting}
          onOpenDeal={onOpenDeal}
        />
      </div>
    );
  }

  return (
    <div className="crm-calendar crm-empty">
      <h2>Calendar</h2>

      {flash ? (
        <p className={flash.type === 'error' ? 'crm-panel--error' : 'crm-calendar__flash'}>
          {flash.text}
        </p>
      ) : null}

      {status?.statusError ? (
        <p className="crm-panel--error">{status.statusError}</p>
      ) : null}

      <p>
        Connect Google once for Calendar sync and sending Quick IOIs from Gmail.
        You can also connect from Settings → Google.
        {!oauthReady
          ? ' Add GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET to the API server to enable OAuth.'
          : ''}
      </p>
      {status?.warning ? (
        <p className="crm-panel--error">{status.warning}</p>
      ) : null}
      {status?.redirectUri ? (
        <p className="crm-muted crm-calendar__redirect">
          OAuth redirect URI (register in Google Cloud):{' '}
          <code>{status.redirectUri}</code>
        </p>
      ) : null}
      <button
        type="button"
        className="btn-primary"
        disabled={connecting || !oauthReady}
        onClick={handleConnect}
      >
        {connecting ? 'Redirecting…' : 'Connect Google (Gmail + Calendar)'}
      </button>
    </div>
  );
}
