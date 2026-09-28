/**
 * Resolve the real client IP behind Cloudflare Worker + tunnel.
 * Prefer X-Vettr-Client-IP (set by our Worker; survives tunnel rewrite of CF headers),
 * then CF-Connecting-IP, then X-Forwarded-For / X-Real-IP.
 */

export function getClientIp(req) {
  const vettr = req?.headers?.['x-vettr-client-ip'];
  if (typeof vettr === 'string' && vettr.trim()) {
    return vettr.trim();
  }

  const cf = req?.headers?.['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) {
    return cf.trim();
  }

  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }

  const realIp = req?.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  if (req?.ip) return String(req.ip);
  if (req?.socket?.remoteAddress) return String(req.socket.remoteAddress);
  return 'unknown';
}
