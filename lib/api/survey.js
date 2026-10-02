import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { getDb } from './db.js';

export const QUESTION_TYPES = ['likert5', 'nps', 'text', 'choice'];
export const STATUSES = ['open', 'closed'];

const LIMITS = {
  maxQuestions: 50,
  questionLen: 300,
  idLen: 40,
  maxOptions: 20,
  optionLen: 100,
  textAnswerLen: 2000,
  nameLen: 50,
  metaLen: { title: 200, client: 100, instructor: 100, edu_date: 20, round: 50 },
};

export function newId() {
  return crypto.randomUUID();
}

export function newQuestionId() {
  return 'q_' + crypto.randomBytes(5).toString('hex');
}

// 표준 문항 템플릿
export function defaultQuestions() {
  const likert = [
    '전반적인 교육 만족도',
    '교육 내용이 업무에 도움이 되었다',
    '강사의 전문성과 전달력',
    '교육 운영(시간 배분·진행 방식)',
    '교육 환경 및 시설',
    '주변 사람들에게 이 교육을 추천하고 싶다',
  ];
  return [
    ...likert.map((q) => ({ id: newQuestionId(), question: q, type: 'likert5', required: true })),
    {
      id: newQuestionId(),
      question: '이 교육을 지인·동료에게 추천할 의향이 얼마나 있습니까? (0~10)',
      type: 'nps',
      required: true,
    },
    { id: newQuestionId(), question: '가장 좋았던 점', type: 'text', required: false },
    { id: newQuestionId(), question: '개선이 필요한 점', type: 'text', required: false },
  ];
}

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function randomCode(len = 8) {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

export function isValidCode(code) {
  return typeof code === 'string' && /^[A-Za-z0-9]{8}$/.test(code);
}

export function isValidId(id) {
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
}

// 8자리 코드를 생성하고 DB 중복 시 재생성
export async function generateUniqueCode() {
  const db = getDb();
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    const r = await db.execute({ sql: 'SELECT 1 FROM surveys WHERE code = ?', args: [code] });
    if (r.rows.length === 0) return code;
  }
  throw new Error('Failed to generate unique survey code');
}

function optString(value, field, maxLen) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `${field} 값이 올바르지 않습니다.`);
  const v = value.trim();
  if (v.length > maxLen) throw new HttpError(400, `${field}은(는) ${maxLen}자 이하로 입력해 주세요.`);
  return v || null;
}

// 설문 기본 정보 검증. partial=true면 들어온 필드만 검증(수정용)
export function validateMeta(body, { partial = false } = {}) {
  const out = {};
  const labels = { title: '교육명', client: '고객사명', instructor: '강사명', edu_date: '교육일자', round: '차수' };
  for (const key of Object.keys(labels)) {
    if (partial && !(key in body)) continue;
    out[key] = optString(body[key], labels[key], LIMITS.metaLen[key]);
  }
  if ((!partial || 'title' in body) && !out.title) throw new HttpError(400, '교육명을 입력해 주세요.');
  if (out.edu_date && !/^\d{4}-\d{2}-\d{2}$/.test(out.edu_date)) {
    throw new HttpError(400, '교육일자는 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (!partial || 'status' in body) {
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, '상태 값이 올바르지 않습니다.');
      out.status = body.status;
    }
  }
  return out;
}

export function validateQuestions(questions) {
  if (!Array.isArray(questions)) throw new HttpError(400, '문항 형식이 올바르지 않습니다.');
  if (questions.length === 0) throw new HttpError(400, '문항이 최소 1개 이상 필요합니다.');
  if (questions.length > LIMITS.maxQuestions) throw new HttpError(400, `문항은 최대 ${LIMITS.maxQuestions}개까지 가능합니다.`);
  const seen = new Set();
  return questions.map((q, i) => {
    const n = i + 1;
    if (!q || typeof q !== 'object') throw new HttpError(400, `${n}번 문항 형식이 올바르지 않습니다.`);
    let id = q.id;
    if (id === undefined || id === null || id === '') id = newQuestionId();
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new HttpError(400, `${n}번 문항 ID가 올바르지 않습니다.`);
    if (seen.has(id)) throw new HttpError(400, `${n}번 문항 ID가 중복됩니다.`);
    seen.add(id);
    if (typeof q.question !== 'string' || !q.question.trim()) throw new HttpError(400, `${n}번 문항 내용을 입력해 주세요.`);
    const question = q.question.trim();
    if (question.length > LIMITS.questionLen) throw new HttpError(400, `${n}번 문항은 ${LIMITS.questionLen}자 이하로 입력해 주세요.`);
    if (!QUESTION_TYPES.includes(q.type)) throw new HttpError(400, `${n}번 문항 타입이 올바르지 않습니다.`);
    if (q.required !== undefined && typeof q.required !== 'boolean') throw new HttpError(400, `${n}번 문항 필수 여부가 올바르지 않습니다.`);
    const out = { id, question, type: q.type, required: Boolean(q.required) };
    if (q.type === 'choice') {
      if (!Array.isArray(q.options)) throw new HttpError(400, `${n}번 객관식 문항의 선택지가 필요합니다.`);
      const options = q.options.map((o) => (typeof o === 'string' ? o.trim() : null));
      if (options.some((o) => !o)) throw new HttpError(400, `${n}번 문항에 빈 선택지가 있습니다.`);
      if (options.length < 2) throw new HttpError(400, `${n}번 객관식 문항은 선택지가 2개 이상이어야 합니다.`);
      if (options.length > LIMITS.maxOptions) throw new HttpError(400, `${n}번 문항 선택지는 최대 ${LIMITS.maxOptions}개입니다.`);
      if (options.some((o) => o.length > LIMITS.optionLen)) throw new HttpError(400, `${n}번 문항 선택지는 ${LIMITS.optionLen}자 이하여야 합니다.`);
      if (new Set(options).size !== options.length) throw new HttpError(400, `${n}번 문항에 중복된 선택지가 있습니다.`);
      out.options = options;
    }
    return out;
  });
}

// 응답 검증: 문항 정의에 맞는 값인지 확인하고 정규화된 answers 객체 반환
export function validateAnswers(questions, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new HttpError(400, '응답 형식이 올바르지 않습니다.');
  }
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const key of Object.keys(answers)) {
    if (!byId.has(key)) throw new HttpError(400, '알 수 없는 문항에 대한 응답이 포함되어 있습니다.');
  }
  const out = {};
  questions.forEach((q, i) => {
    const n = i + 1;
    let v = answers[q.id];
    const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (empty) {
      if (q.required) throw new HttpError(400, `${n}번 문항은 필수입니다.`);
      return;
    }
    switch (q.type) {
      case 'likert5':
        if (!Number.isInteger(v) || v < 1 || v > 5) throw new HttpError(400, `${n}번 문항 응답이 올바르지 않습니다.`);
        break;
      case 'nps':
        if (!Number.isInteger(v) || v < 0 || v > 10) throw new HttpError(400, `${n}번 문항 응답이 올바르지 않습니다.`);
        break;
      case 'text':
        if (typeof v !== 'string') throw new HttpError(400, `${n}번 문항 응답이 올바르지 않습니다.`);
        v = v.trim();
        if (v.length > LIMITS.textAnswerLen) throw new HttpError(400, `${n}번 문항은 ${LIMITS.textAnswerLen}자 이하로 입력해 주세요.`);
        break;
      case 'choice':
        if (typeof v !== 'string' || !(q.options || []).includes(v)) throw new HttpError(400, `${n}번 문항 응답이 올바르지 않습니다.`);
        break;
      default:
        throw new HttpError(400, `${n}번 문항 타입이 올바르지 않습니다.`);
    }
    out[q.id] = v;
  });
  return out;
}

export function validateRespondentName(name) {
  if (name === undefined || name === null) return null;
  if (typeof name !== 'string') throw new HttpError(400, '성명 형식이 올바르지 않습니다.');
  const v = name.trim();
  if (v.length > LIMITS.nameLen) throw new HttpError(400, `성명은 ${LIMITS.nameLen}자 이하로 입력해 주세요.`);
  return v || null;
}

export function rowToSurvey(row) {
  let questions = [];
  try {
    questions = JSON.parse(row.questions);
  } catch {
    questions = [];
  }
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    client: row.client,
    instructor: row.instructor,
    edu_date: row.edu_date,
    round: row.round,
    questions,
    status: row.status || 'open',
    created_at: row.created_at,
  };
}

export async function getSurveyById(id) {
  if (!isValidId(id)) throw new HttpError(404, '설문을 찾을 수 없습니다.');
  const r = await getDb().execute({ sql: 'SELECT * FROM surveys WHERE id = ?', args: [id] });
  if (r.rows.length === 0) throw new HttpError(404, '설문을 찾을 수 없습니다.');
  return rowToSurvey(r.rows[0]);
}

export async function getResponses(surveyId) {
  const r = await getDb().execute({
    sql: 'SELECT id, respondent_name, answers, created_at FROM responses WHERE survey_id = ? ORDER BY created_at ASC',
    args: [surveyId],
  });
  return r.rows.map((row) => {
    let answers = {};
    try {
      answers = JSON.parse(row.answers);
    } catch {
      answers = {};
    }
    return { id: row.id, respondent_name: row.respondent_name, answers, created_at: row.created_at };
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// 집계: 문항별 평균·분포, NPS 점수, 주관식 목록
export function aggregate(survey, responses) {
  const questions = survey.questions.map((q) => {
    const values = responses.map((r) => r.answers[q.id]).filter((v) => v !== undefined && v !== null && v !== '');
    const base = { id: q.id, question: q.question, type: q.type, required: q.required, count: values.length };
    if (q.type === 'likert5' || q.type === 'nps') {
      const min = q.type === 'nps' ? 0 : 1;
      const max = q.type === 'nps' ? 10 : 5;
      const nums = values.filter((v) => Number.isInteger(v) && v >= min && v <= max);
      const distribution = [];
      for (let s = min; s <= max; s++) distribution.push({ label: String(s), count: nums.filter((v) => v === s).length });
      const avg = nums.length ? round2(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
      const out = { ...base, count: nums.length, average: avg, distribution };
      if (q.type === 'nps') {
        const promoters = nums.filter((v) => v >= 9).length;
        const detractors = nums.filter((v) => v <= 6).length;
        const passives = nums.length - promoters - detractors;
        out.nps = nums.length
          ? {
              score: Math.round(((promoters - detractors) / nums.length) * 100),
              promoters,
              passives,
              detractors,
              promoterPct: round2((promoters / nums.length) * 100),
              detractorPct: round2((detractors / nums.length) * 100),
            }
          : null;
      }
      return out;
    }
    if (q.type === 'choice') {
      const opts = q.options || [];
      const valid = values.filter((v) => opts.includes(v));
      return { ...base, count: valid.length, distribution: opts.map((o) => ({ label: o, count: valid.filter((v) => v === o).length })) };
    }
    // text
    const texts = [];
    for (const r of responses) {
      const v = r.answers[q.id];
      if (typeof v === 'string' && v.trim()) texts.push({ text: v, respondent_name: r.respondent_name, created_at: r.created_at });
    }
    return { ...base, count: texts.length, answers: texts };
  });
  const npsQ = questions.find((q) => q.type === 'nps' && q.nps);
  return { totalResponses: responses.length, nps: npsQ ? npsQ.nps : null, questions };
}
