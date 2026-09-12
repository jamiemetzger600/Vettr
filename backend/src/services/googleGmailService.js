import { sendEmail } from './emailService.js';
import {
  getGoogleConnection,
  getValidGoogleAccessToken,
  connectionHasGmailSend
} from './googleCalendarService.js';

/** Match feedback image limit; keep total under express JSON body budget. */
export const IOI_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
export const IOI_ATTACHMENT_MAX_COUNT = 4;
const ALLOWED_IOI_MIME = new Set(['image/png', 'image/jpeg']);

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

function decodeBase64Payload(dataBase64) {
  if (!dataBase64 || typeof dataBase64 !== 'string') return null;
  const cleaned = dataBase64.replace(/^data:[^;]+;base64,/, '');
  try {
    return Buffer.from(cleaned, 'base64');
  } catch {
    return null;
  }
}

function sanitizeFilename(name, mimeType) {
  const raw = String(name || 'attachment').replace(/[^\w.\-()+ ]+/g, '_').trim();
  const base = raw.slice(0, 120) || 'attachment';
  if (/\.(png|jpe?g)$/i.test(base)) return base;
  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  return `${base}${ext}`;
}

/**
 * Normalize client attachment payloads for Gmail MIME.
 * @returns {{ filename: string, mimeType: string, data: Buffer }[]}
 */
export function normalizeGmailAttachments(rawList) {
  if (rawList == null) return [];
  if (!Array.isArray(rawList)) {
    const err = new Error('attachments must be an array');
    err.status = 400;
    err.code = 'invalid_attachments';
    throw err;
  }
  if (rawList.length > IOI_ATTACHMENT_MAX_COUNT) {
    const err = new Error(`At most ${IOI_ATTACHMENT_MAX_COUNT} images allowed`);
    err.status = 400;
    err.code = 'too_many_attachments';
    throw err;
  }

  const out = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue;
    const mimeType = String(raw.mimeType || raw.mime_type || '').toLowerCase().trim();
    if (!ALLOWED_IOI_MIME.has(mimeType)) {
      const err = new Error('Only PNG and JPG/JPEG images are allowed');
      err.status = 400;
      err.code = 'invalid_attachment_type';
      throw err;
    }
    const data = decodeBase64Payload(raw.dataBase64 || raw.data_base64 || raw.content);
    if (!data || data.length < 16) {
      const err = new Error('Invalid image attachment payload');
      err.status = 400;
      err.code = 'invalid_attachment_payload';
      throw err;
    }
    if (data.length > IOI_ATTACHMENT_MAX_BYTES) {
      const err = new Error(`Each image must be ${Math.round(IOI_ATTACHMENT_MAX_BYTES / 1024 / 1024)}MB or smaller`);
      err.status = 400;
      err.code = 'attachment_too_large';
      throw err;
    }
    out.push({
      filename: sanitizeFilename(raw.filename || raw.name, mimeType),
      mimeType,
      data
    });
  }
  return out;
}

function buildRfc822({ from, to, subject, text, html, attachments = [] }) {
  const headers = [
    `From: ${oneLine(from)}`,
    `To: ${oneLine(to)}`,
    `Subject: ${encodeMimeSubject(subject)}`,
    'MIME-Version: 1.0'
  ];

  if (!attachments.length) {
    if (html) {
      headers.push('Content-Type: text/html; charset=utf-8');
      headers.push('Content-Transfer-Encoding: 8bit');
      return `${headers.join('\r\n')}\r\n\r\n${html}`;
    }
    headers.push('Content-Type: text/plain; charset=utf-8');
    headers.push('Content-Transfer-Encoding: 8bit');
    return `${headers.join('\r\n')}\r\n\r\n${text || ''}`;
  }

  const boundary = `vettr_ioi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const bodyText = text || (html ? stripHtml(html) : '');
  const parts = [];

  if (html) {
    parts.push(
      `--${boundary}\r\n` +
        'Content-Type: text/html; charset=utf-8\r\n' +
        'Content-Transfer-Encoding: 8bit\r\n\r\n' +
        `${html}\r\n`
    );
  } else {
    parts.push(
      `--${boundary}\r\n` +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        'Content-Transfer-Encoding: 8bit\r\n\r\n' +
        `${bodyText}\r\n`
    );
  }

  for (const att of attachments) {
    const b64 = att.data.toString('base64').replace(/(.{76})/g, '$1\r\n');
    const safeName = oneLine(att.filename).replace(/"/g, '');
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${att.mimeType}; name="${safeName}"\r\n` +
        'Content-Transfer-Encoding: base64\r\n' +
        `Content-Disposition: attachment; filename="${safeName}"\r\n\r\n` +
        `${b64}\r\n`
    );
  }

  parts.push(`--${boundary}--\r\n`);
  return `${headers.join('\r\n')}\r\n\r\n${parts.join('')}`;
}

export async function sendGmailMessage(userId, { to, subject, text, html, attachments }) {
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

  const normalizedAttachments = normalizeGmailAttachments(attachments);

  const from = connection.google_email || 'me';
  const raw = toBase64Url(buildRfc822({
    from,
    to: recipient,
    subject,
    text: text || (html ? stripHtml(html) : ''),
    html,
    attachments: normalizedAttachments
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

  console.log('[gmail] sent', {
    userId,
    to: recipient,
    id: data.id,
    attachments: normalizedAttachments.length
  });
  return { sent: true, id: data.id, from, attachmentCount: normalizedAttachments.length };
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
