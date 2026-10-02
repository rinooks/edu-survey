import crypto from 'node:crypto';
import { HttpError } from './http.js';

const COOKIE_NAME = 'es_admin';
const SESSION_TTL_SEC = 60 * 60 * 12; // 12시간

function getSecret() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('ADMIN_SECRET is not set or too short (min 16 chars)');
  }
  return secret;
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

function safeEqual(a, b) {
  // 길이 노출을 막기 위해 해시 후 비교
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function verifyPassword(input) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error('ADMIN_PASSWORD is not set');
  if (typeof input !== 'string' || input.length === 0 || input.length > 200) return false;
  return safeEqual(input, expected);
}

function isSecureRequest(req) {
  const proto = req.headers['x-forwarded-proto'];
  if (proto) return String(proto).split(',')[0].trim() === 'https';
  return Boolean(req.socket?.encrypted);
}

function buildCookie(req, value, maxAge) {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

export function createSessionCookie(req) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { role: 'admin', iat: now, exp: now + SESSION_TTL_SEC };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return buildCookie(req, `${payloadB64}.${sign(payloadB64)}`, SESSION_TTL_SEC);
}

export function clearSessionCookie(req) {
  return buildCookie(req, '', 0);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export function getSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.role !== 'admin') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// 로그인이 필요한 핸들러에서 호출. 세션이 없으면 401 HttpError를 던진다.
export function requireAdmin(req) {
  const session = getSession(req);
  if (!session) throw new HttpError(401, '로그인이 필요합니다.');
  return session;
}
