import { allowMethods, handle, readJson, sendJson, getClientIp } from '../../lib/api/http.js';
import { verifyPassword, createSessionCookie } from '../../lib/api/auth.js';
import { rateLimit } from '../../lib/api/ratelimit.js';

export default handle(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  // 무차별 대입 방지: IP당 분당 10회
  const rl = rateLimit(`login:${getClientIp(req)}`, 10);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return sendJson(res, 429, { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  }
  const body = await readJson(req);
  if (!verifyPassword(body?.password)) {
    return sendJson(res, 401, { error: '비밀번호가 올바르지 않습니다.' });
  }
  res.setHeader('Set-Cookie', createSessionCookie(req));
  sendJson(res, 200, { ok: true });
});
