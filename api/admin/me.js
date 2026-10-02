import { allowMethods, handle, sendJson } from '../../lib/api/http.js';
import { getSession } from '../../lib/api/auth.js';

export default handle(async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { authenticated: false });
  sendJson(res, 200, { authenticated: true, exp: session.exp });
});
