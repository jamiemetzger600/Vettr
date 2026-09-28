import { getClientIp } from './clientIp.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function fakeReq(headers = {}, extras = {}) {
  return { headers, ...extras };
}

// Arrange / Act / Assert — X-Vettr-Client-IP wins (survives tunnel CF rewrite)
{
  const req = fakeReq({
    'x-vettr-client-ip': '203.0.113.9',
    'cf-connecting-ip': '203.0.113.10',
    'x-forwarded-for': '198.51.100.1, 10.0.0.1'
  }, { ip: '127.0.0.1' });
  assert(getClientIp(req) === '203.0.113.9', 'prefer X-Vettr-Client-IP');
}

// CF-Connecting-IP wins over X-Forwarded-For
{
  const req = fakeReq({
    'cf-connecting-ip': '203.0.113.10',
    'x-forwarded-for': '198.51.100.1, 10.0.0.1'
  }, { ip: '127.0.0.1' });
  assert(getClientIp(req) === '203.0.113.10', 'prefer CF-Connecting-IP');
}

// X-Forwarded-For first hop when no CF header
{
  const req = fakeReq({ 'x-forwarded-for': '198.51.100.22, 10.0.0.1' }, { ip: '127.0.0.1' });
  assert(getClientIp(req) === '198.51.100.22', 'use first XFF hop');
}

// X-Real-IP fallback
{
  const req = fakeReq({ 'x-real-ip': '198.51.100.33' }, { ip: '127.0.0.1' });
  assert(getClientIp(req) === '198.51.100.33', 'use X-Real-IP');
}

// req.ip / socket fallback
{
  const req = fakeReq({}, { ip: '127.0.0.1' });
  assert(getClientIp(req) === '127.0.0.1', 'use req.ip');
}

{
  const req = fakeReq({}, { socket: { remoteAddress: '::1' } });
  assert(getClientIp(req) === '::1', 'use socket remoteAddress');
}

{
  const req = fakeReq({});
  assert(getClientIp(req) === 'unknown', 'unknown when empty');
}

console.log('clientIp tests passed');
