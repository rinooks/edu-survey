import { allowMethods, handle, queryParam } from '../../../lib/api/http.js';
import { requireAdmin } from '../../../lib/api/auth.js';
import { getResponses, getSurveyById } from '../../../lib/api/survey.js';

function csvCell(value) {
  if (value === undefined || value === null) return '';
  let s = String(value);
  // CSV 수식 인젝션 방지 (엑셀에서 =, +, -, @ 로 시작하는 셀 실행 차단)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// DB의 UTC 시각('YYYY-MM-DD HH:MM:SS')을 한국시간으로 변환
function toKst(utc) {
  if (!utc) return '';
  const d = new Date(String(utc).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return utc;
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

export default handle(async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;
  requireAdmin(req);
  const survey = await getSurveyById(queryParam(req, 'id'));
  const responses = await getResponses(survey.id);

  const header = ['응답번호', '제출일시(KST)', '성명', ...survey.questions.map((q) => q.question)];
  const lines = [header.map(csvCell).join(',')];
  responses.forEach((r, i) => {
    const row = [i + 1, toKst(r.created_at), r.respondent_name || '익명', ...survey.questions.map((q) => r.answers[q.id])];
    lines.push(row.map(csvCell).join(','));
  });

  // UTF-8 BOM: 엑셀 한글 깨짐 방지
  const csv = '﻿' + lines.join('\r\n');
  const filename = `${survey.title}_${survey.code}_응답.csv`.replace(/[\\/:*?"<>|]/g, '_');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="survey_${survey.code}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.end(csv);
});
