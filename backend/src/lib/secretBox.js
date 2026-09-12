import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function keyBuffer() {
  const raw = process.env.LLM_CREDENTIALS_KEY?.trim() || process.env.JWT_SECRET?.trim() || '';
  if (!raw) {
    const err = new Error('LLM_CREDENTIALS_KEY or JWT_SECRET is required to store API keys');
    err.status = 503;
    throw err;
  }
  return crypto.createHash('sha256').update(raw).digest();
}

/** AES-256-GCM. Returns { cipher, nonce } as Buffers. */
export function encryptSecret(plain) {
  const text = String(plain || '');
  if (!text) return { cipher: null, nonce: null };
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBuffer(), nonce);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { cipher: Buffer.concat([enc, tag]), nonce };
}

export function decryptSecret(cipherBuf, nonceBuf) {
  if (!cipherBuf || !nonceBuf) return '';
  const buf = Buffer.isBuffer(cipherBuf) ? cipherBuf : Buffer.from(cipherBuf);
  const nonce = Buffer.isBuffer(nonceBuf) ? nonceBuf : Buffer.from(nonceBuf);
  if (buf.length < 17) return '';
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv(ALGO, keyBuffer(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function last4(value) {
  const s = String(value || '');
  if (s.length < 4) return s ? '••••' : '';
  return s.slice(-4);
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}
