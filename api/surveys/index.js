import { allowMethods, handle, readJson, sendJson } from '../../lib/api/http.js';
import { requireAdmin } from '../../lib/api/auth.js';
import { getDb } from '../../lib/api/db.js';
import { defaultQuestions, generateUniqueCode, newId, validateMeta } from '../../lib/api/survey.js';

export default handle(async (req, res) => {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  requireAdmin(req);
  const db = getDb();

  if (req.method === 'GET') {
    const r = await db.execute(`
      SELECT s.id, s.code, s.title, s.client, s.instructor, s.edu_date, s.round, s.status, s.created_at,
             (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) AS response_count
      FROM surveys s
      ORDER BY s.created_at DESC
    `);
    const surveys = r.rows.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      client: row.client,
      instructor: row.instructor,
      edu_date: row.edu_date,
      round: row.round,
      status: row.status || 'open',
      created_at: row.created_at,
      response_count: Number(row.response_count) || 0,
    }));
    return sendJson(res, 200, { surveys });
  }

  // POST: 설문 생성 (표준 문항 템플릿 자동 적용)
  const body = await readJson(req);
  const meta = validateMeta(body || {});
  const id = newId();
  const code = await generateUniqueCode();
  const questions = defaultQuestions();
  await db.execute({
    sql: `INSERT INTO surveys (id, code, title, client, instructor, edu_date, round, questions, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
    args: [id, code, meta.title, meta.client, meta.instructor, meta.edu_date, meta.round, JSON.stringify(questions)],
  });
  sendJson(res, 201, { id, code });
});
