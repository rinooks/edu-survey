import { allowMethods, handle, sendJson, queryParam, HttpError } from '../../../lib/api/http.js';
import { getDb } from '../../../lib/api/db.js';
import { isValidCode, rowToSurvey } from '../../../lib/api/survey.js';

// 공개: 응답자용 설문 정보 + 문항 조회
export default handle(async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;
  const code = queryParam(req, 'code');
  if (!isValidCode(code)) throw new HttpError(404, '설문을 찾을 수 없습니다.');
  const r = await getDb().execute({ sql: 'SELECT * FROM surveys WHERE code = ?', args: [code] });
  if (r.rows.length === 0) throw new HttpError(404, '설문을 찾을 수 없습니다.');
  const s = rowToSurvey(r.rows[0]);
  sendJson(res, 200, {
    survey: {
      code: s.code,
      title: s.title,
      client: s.client,
      instructor: s.instructor,
      edu_date: s.edu_date,
      round: s.round,
      questions: s.questions,
      status: s.status,
      closed: s.status === 'closed',
    },
  });
});
