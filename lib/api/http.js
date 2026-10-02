// 공통 HTTP 헬퍼

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

const MAX_BODY_BYTES = 200 * 1024;

// Vercel 런타임은 JSON 바디를 req.body로 파싱해 주지만, 없을 경우 직접 읽는다.
export async function readJson(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else {
    raw = await new Promise((resolve, reject) => {
      let data = '';
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new HttpError(413, '요청 본문이 너무 큽니다.'));
          req.destroy();
          return;
        }
        data += chunk;
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }
  if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, '요청 본문이 너무 큽니다.');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, '잘못된 JSON 형식입니다.');
  }
}

export function allowMethods(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    sendJson(res, 405, { error: '허용되지 않는 메서드입니다.' });
    return false;
  }
  return true;
}

// 핸들러 래퍼: HttpError는 해당 상태코드로, 그 외는 500으로 응답 (내부 정보 비노출)
export function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
      } else {
        console.error(err);
        sendJson(res, 500, { error: '서버 오류가 발생했습니다.' });
      }
    }
  };
}

export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

export function queryParam(req, name) {
  let v = req.query?.[name];
  if (v === undefined) {
    // 런타임에 따라 req.query가 없을 수 있으므로 URL에서 직접 파싱
    const url = new URL(req.url, 'http://localhost');
    v = url.searchParams.get(name);
  }
  if (Array.isArray(v)) v = v[0];
  return typeof v === 'string' ? v : '';
}
