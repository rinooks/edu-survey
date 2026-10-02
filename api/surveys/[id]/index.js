import { allowMethods, handle, readJson, sendJson, queryParam, HttpError } from '../../../lib/api/http.js';
import { requireAdmin } from '../../../lib/api/auth.js';
import { getDb } from '../../../lib/api/db.js';
import { getSurveyById, validateMeta, validateQuestions } from '../../../lib/api/survey.js';

export default handle(async (req, res) => {
  if (!allowMethods(req, res, ['GET', 'PUT', 'DELETE'])) return;
  requireAdmin(req);
  const id = queryParam(req, 'id');
  const survey = await getSurveyById(id);
  const db = getDb();

  if (req.method === 'GET') {
    const c = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM responses WHERE survey_id = ?', args: [id] });
    return sendJson(res, 200, { survey: { ...survey, response_count: Number(c.rows[0].n) || 0 } });
  }

  if (req.method === 'DELETE') {
    await db.batch(
      [
        { sql: 'DELETE FROM responses WHERE survey_id = ?', args: [id] },
        { sql: 'DELETE FROM surveys WHERE id = ?', args: [id] },
      ],
      'write'
    );
    return sendJson(res, 200, { ok: true });
  }

  // PUT: 기본 정보 / 상태 / 문항 부분 수정
  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, '요청 형식이 올바르지 않습니다.');
  const meta = validateMeta(body, { partial: true });
  const updated = { ...survey, ...meta };
  if ('questions' in body) updated.questions = validateQuestions(body.questions);

  await db.execute({
    sql: `UPDATE surveys SET title = ?, client = ?, instructor = ?, edu_date = ?, round = ?, questions = ?, status = ?
          WHERE id = ?`,
    args: [
      updated.title,
      updated.client,
      updated.instructor,
      updated.edu_date,
      updated.round,
      JSON.stringify(updated.questions),
      updated.status,
      id,
    ],
  });
  sendJson(res, 200, { survey: updated });
});
