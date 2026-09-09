import { sendEmail } from './emailService.js';
import {
  getGoogleConnection,
  getValidGoogleAccessToken,
  connectionHasGmailSend
} from './googleCalendarService.js';

function oneLine(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeMimeSubject(subject) {
  const clean = oneLine(subject) || '(no subject)';
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function toBase64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRfc822({ from, to, subject, text, html }) {
  const headers = [
    `From: ${oneLine(from)}`,
    `To: ${oneLine(to)}`,
    `Subject: ${encodeMimeSubject(subject)}`,
    'MIME-Version: 1.0'
  ];

  if (html) {
    headers.push('Content-Type: text/html; charset=utf-8');
    headers.push('Content-Transfer-Encoding: 8bit');
    return `${headers.join('\r\n')}\r\n\r\n${html}`;
  }

  headers.push('Content-Type: text/plain; charset=utf-8');
  headers.push('Content-Transfer-Encoding: 8bit');
  return `${headers.join('\r\n')}\r\n\r\n${text || ''}`;
}

export async function sendGmailMessage(userId, { to, subject, text, html }) {
  const connection = await getGoogleConnection(userId);
  if (!connection?.access_token) {
    const err = new Error('Google is not connected. Connect Gmail in Settings.');
    err.status = 400;
    err.code = 'google_not_connected';
    throw err;
  }
  if (!connectionHasGmailSend(connection)) {
    const err = new Error('Reconnect Google in Settings to send from Gmail.');
    err.status = 409;
    err.code = 'reconnect_google';
    throw err;
  }

  const recipient = oneLine(to);
  if (!recipient || !recipient.includes('@')) {
    const err = new Error('A valid recipient email is required');
    err.status = 400;
    err.code = 'missing_recipient';
    throw err;
  }

  const from = connection.google_email || 'me';
  const raw = toBase64Url(buildRfc822({
    from,
    to: recipient,
    subject,
    text: text || (html ? stripHtml(html) : ''),
    html
  }));

  const token = await getValidGoogleAccessToken(userId);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error?.message || 'Gmail send failed';
    console.error('[gmail] send failed', { userId, to: recipient, message });
    const err = new Error(message);
    err.status = res.status === 401 ? 401 : 502;
    err.code = 'gmail_send_failed';
    throw err;
  }

  console.log('[gmail] sent', { userId, to: recipient, id: data.id });
  return { sent: true, id: data.id, from };
}

/** Prefer the user's connected Gmail; fall back to Vettr SMTP. */
export async function deliverUserEmail(userId, { to, subject, html, text }) {
  let gmailErr = null;
  try {
    return await sendGmailMessage(userId, { to, subject, html, text });
  } catch (err) {
    gmailErr = err;
    console.warn('[email] gmail send failed, trying SMTP', {
      userId,
      code: err.code,
      message: err.message
    });
  }
  const smtp = await sendEmail({ to, subject, html });
  if (smtp?.sent) return smtp;
  return {
    sent: false,
    reason: gmailErr?.code || smtp?.reason || 'not_delivered',
    message: gmailErr?.message || smtp?.message || 'Email was not sent'
  };
}
