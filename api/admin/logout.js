import { allowMethods, handle, sendJson } from '../../lib/api/http.js';
import { clearSessionCookie } from '../../lib/api/auth.js';

export default handle(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  res.setHeader('Set-Cookie', clearSessionCookie(req));
  sendJson(res, 200, { ok: true });
});
