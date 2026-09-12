import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const OAUTH_STATE_PURPOSE = 'google_calendar_oauth';
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function buildScopeString({ gmailReadonly = false } = {}) {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    GMAIL_SEND_SCOPE,
    'openid',
    'email'
  ];
  if (gmailReadonly) scopes.push(GMAIL_READONLY_SCOPE);
  return scopes.join(' ');
}

const VETTR_EXTENDED_PROP = 'vettrEventId';
const TASK_EXTENDED_PROP = 'vettrTaskId';

export function isGoogleCalendarOAuthConfigured() {
  return Boolean(getGoogleCalendarClientId() && process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim());
}

function getGoogleCalendarClientId() {
  const raw = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  if (!raw) return '';
  // Accept either the bare ID or the full *.apps.googleusercontent.com value.
  if (raw.includes('.apps.googleusercontent.com')) return raw;
  return `${raw}.apps.googleusercontent.com`;
}

export function getGoogleCalendarRedirectUri() {
  const base = (process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
  return `${base}/api/crm/calendar/oauth/callback`;
}

function createOAuthState(userId, returnTo = 'calendar') {
  const dest = returnTo === 'settings' ? 'settings' : 'calendar';
  return jwt.sign(
    { userId, purpose: OAUTH_STATE_PURPOSE, returnTo: dest },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export function verifyOAuthState(state) {
  const decoded = jwt.verify(state, process.env.JWT_SECRET);
  if (decoded.purpose !== OAUTH_STATE_PURPOSE || !decoded.userId) {
    const err = new Error('Invalid OAuth state');
    err.status = 400;
    throw err;
  }
  return {
    userId: decoded.userId,
    returnTo: decoded.returnTo === 'settings' ? 'settings' : 'calendar'
  };
}

export function getGoogleCalendarAuthUrl(userId, returnTo = 'calendar', opts = {}) {
  if (!isGoogleCalendarOAuthConfigured()) {
    const err = new Error(
      'Google OAuth is not configured. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET on the API server.'
    );
    err.status = 503;
    throw err;
  }

  const params = new URLSearchParams({
    client_id: getGoogleCalendarClientId(),
    redirect_uri: getGoogleCalendarRedirectUri(),
    response_type: 'code',
    scope: buildScopeString({ gmailReadonly: Boolean(opts.gmailReadonly) }),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: createOAuthState(userId, returnTo)
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function getConnection(userId) {
  const result = await pool.query(
    'SELECT * FROM calendar_connections WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function getGoogleConnection(userId) {
  return getConnection(userId);
}

export async function isGoogleCalendarConnected(userId) {
  return Boolean(await getConnection(userId));
}

export function connectionHasGmailSend(connection) {
  const scopes = String(connection?.granted_scopes || '');
  return scopes.includes('gmail.send');
}

export function connectionHasGmailReadonly(connection) {
  const scopes = String(connection?.granted_scopes || '');
  return scopes.includes('gmail.readonly');
}

async function fetchGoogleEmail(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json().catch(() => ({}));
    return data.email || null;
  } catch (err) {
    console.warn('[google] userinfo failed', err.message);
    return null;
  }
}

async function refreshAccessToken(connection) {
  if (!connection.refresh_token) {
    const err = new Error('Google Calendar connection expired — reconnect Google Calendar');
    err.status = 401;
    throw err;
  }

  const body = new URLSearchParams({
    client_id: getGoogleCalendarClientId(),
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET.trim(),
    refresh_token: connection.refresh_token,
    grant_type: 'refresh_token'
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await tokenRes.json();
  if (!tokenRes.ok) {
    const err = new Error(data.error_description || data.error || 'Google token refresh failed');
    err.status = 401;
    throw err;
  }

  const tokenExpiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : null;

  await pool.query(
    `UPDATE calendar_connections
     SET access_token = $1, token_expires_at = $2
     WHERE user_id = $3`,
    [data.access_token, tokenExpiresAt, connection.user_id]
  );

  return data.access_token;
}

export async function getValidGoogleAccessToken(userId) {
  const connection = await getConnection(userId);
  if (!connection?.access_token) {
    const err = new Error('Google Calendar not connected');
    err.status = 400;
    throw err;
  }

  const expires = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expires && expires - Date.now() < 5 * 60 * 1000) {
    return refreshAccessToken(connection);
  }
  return connection.access_token;
}

function toGoogleEventBody({ title, description, startsAt, endsAt, allDay, vettrEventId, taskId }) {
  const privateProps = {};
  if (vettrEventId) privateProps[VETTR_EXTENDED_PROP] = String(vettrEventId);
  if (taskId) privateProps[TASK_EXTENDED_PROP] = String(taskId);

  const body = {
    summary: title,
    description: description || '',
    extendedProperties: { private: privateProps }
  };

  if (allDay) {
    body.start = { date: startsAt.slice(0, 10) };
    body.end = { date: endsAt.slice(0, 10) };
  } else {
    body.start = { dateTime: startsAt };
    body.end = { dateTime: endsAt };
  }
  return body;
}

async function googleCalendarFetch(userId, path, options = {}) {
  const token = await getValidGoogleAccessToken(userId);
  const connection = await getConnection(userId);
  const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
  const url = `${GOOGLE_CALENDAR_API}/calendars/${calendarId}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || 'Google Calendar API error');
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function listGoogleCalendarEvents(userId, timeMin, timeMax) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: new Date(timeMin).toISOString(),
    timeMax: new Date(timeMax).toISOString(),
    showDeleted: 'true',
    maxResults: '250'
  });

  const data = await googleCalendarFetch(userId, `/events?${params.toString()}`);
  return data.items || [];
}

export async function createGoogleCalendarEvent(userId, payload) {
  const body = toGoogleEventBody(payload);
  return googleCalendarFetch(userId, '/events', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function updateGoogleCalendarEvent(userId, googleEventId, payload) {
  const body = toGoogleEventBody(payload);
  return googleCalendarFetch(userId, `/events/${encodeURIComponent(googleEventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
}

export async function deleteGoogleCalendarEvent(userId, googleEventId) {
  return googleCalendarFetch(userId, `/events/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE'
  });
}

export async function exchangeCodeAndStoreTokens(userId, code) {
  if (!isGoogleCalendarOAuthConfigured()) {
    const err = new Error('Google Calendar OAuth is not configured');
    err.status = 503;
    throw err;
  }

  const body = new URLSearchParams({
    client_id: getGoogleCalendarClientId(),
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET.trim(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: getGoogleCalendarRedirectUri()
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await tokenRes.json();
  if (!tokenRes.ok) {
    const err = new Error(data.error_description || data.error || 'Google token exchange failed');
    err.status = 400;
    throw err;
  }

  const tokenExpiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : null;

  const googleEmail = await fetchGoogleEmail(data.access_token);
  const grantedScopes = data.scope || buildScopeString();

  await pool.query(
    `INSERT INTO calendar_connections (
       user_id, provider, access_token, refresh_token, token_expires_at, calendar_id, connected_at,
       google_email, granted_scopes
     )
     VALUES ($1, 'google', $2, $3, $4, 'primary', NOW(), $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       provider = 'google',
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, calendar_connections.refresh_token),
       token_expires_at = EXCLUDED.token_expires_at,
       calendar_id = 'primary',
       connected_at = NOW(),
       google_email = COALESCE(EXCLUDED.google_email, calendar_connections.google_email),
       granted_scopes = EXCLUDED.granted_scopes`,
    [
      userId,
      data.access_token,
      data.refresh_token || null,
      tokenExpiresAt,
      googleEmail,
      grantedScopes
    ]
  );

  console.log(`[google] OAuth connected user=${userId} email=${googleEmail || 'unknown'} gmail=${String(grantedScopes).includes('gmail.send')}`);
  return { connected: true, provider: 'google', googleEmail, gmail: String(grantedScopes).includes('gmail.send') };
}

export async function disconnectGoogleCalendar(userId) {
  const result = await pool.query(
    'DELETE FROM calendar_connections WHERE user_id = $1 RETURNING id',
    [userId]
  );
  return { disconnected: result.rows.length > 0 };
}
