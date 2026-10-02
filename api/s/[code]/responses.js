import { allowMethods, handle, readJson, sendJson, queryParam, getClientIp, HttpError } from '../../../lib/api/http.js';
import { getDb } from '../../../lib/api/db.js';
import { rateLimit } from '../../../lib/api/ratelimit.js';
import { isValidCode, newId, rowToSurvey, validateAnswers, validateRespondentName } from '../../../lib/api/survey.js';

// 공개: 응답 제출
export default handle(async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;

  const rl = rateLimit(`resp:${getClientIp(req)}`, 30);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return sendJson(res, 429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  }

  const code = queryParam(req, 'code');
  if (!isValidCode(code)) throw new HttpError(404, '설문을 찾을 수 없습니다.');
  const db = getDb();
  const r = await db.execute({ sql: 'SELECT * FROM surveys WHERE code = ?', args: [code] });
  if (r.rows.length === 0) throw new HttpError(404, '설문을 찾을 수 없습니다.');
  const survey = rowToSurvey(r.rows[0]);
  if (survey.status === 'closed') throw new HttpError(403, '종료된 설문입니다.');

  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, '요청 형식이 올바르지 않습니다.');
  const name = validateRespondentName(body.respondent_name);
  const answers = validateAnswers(survey.questions, body.answers);

  await db.execute({
    sql: 'INSERT INTO responses (id, survey_id, respondent_name, answers) VALUES (?, ?, ?, ?)',
    args: [newId(), survey.id, name, JSON.stringify(answers)],
  });
  sendJson(res, 201, { ok: true });
});
