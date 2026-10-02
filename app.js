(() => {
  'use strict';

  const app = document.getElementById('app');
  const TYPE_LABELS = { likert5: '5점 척도', nps: 'NPS (0~10)', text: '주관식', choice: '객관식' };
  const STATUS_LABELS = { open: '진행중', closed: '종료' };

  // ---------- 유틸 ----------
  // DOM 생성 헬퍼 (innerHTML을 쓰지 않아 XSS 방지)
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = Boolean(v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c === undefined || c === null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function render(...nodes) {
    app.replaceChildren(...nodes);
    window.scrollTo(0, 0);
  }

  function loading() {
    render(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), '불러오는 중...'));
  }

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  // DB의 created_at은 UTC('YYYY-MM-DD HH:MM:SS') → 로컬 시간 표시
  function fmtDate(s, withTime = false) {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));
    if (isNaN(d)) return s;
    const p = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
  }

  function surveyUrl(code) {
    return `${location.origin}/#/s/${code}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  // ---------- API ----------
  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function api(path, { method = 'GET', body } = {}) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch {
      throw new ApiError(0, '네트워크 오류가 발생했습니다. 연결을 확인해 주세요.');
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || `요청에 실패했습니다. (${res.status})`);
    return data;
  }

  // 관리자 API 호출: 401이면 로그인 화면으로
  async function adminApi(path, opts) {
    try {
      return await api(path, opts);
    } catch (err) {
      if (err.status === 401) {
        isAdmin = false;
        if (location.hash !== '#/') location.hash = '#/';
        else route();
        throw Object.assign(err, { handled: true });
      }
      throw err;
    }
  }

  function showError(err) {
    if (err && err.handled) return;
    render(
      h('div', { class: 'container narrow' },
        h('div', { class: 'card', style: { marginTop: '40px', textAlign: 'center' } },
          h('h2', null, '오류'),
          h('p', { class: 'muted' }, err.message || '알 수 없는 오류가 발생했습니다.'),
          h('a', { class: 'btn', href: '#/' }, '처음으로'))));
  }

  // ---------- 인증 ----------
  let isAdmin = null; // null = 미확인

  async function checkAdmin() {
    if (isAdmin !== null) return isAdmin;
    try {
      await api('/api/admin/me');
      isAdmin = true;
    } catch {
      isAdmin = false;
    }
    return isAdmin;
  }

  function topbar() {
    return h('header', { class: 'topbar' },
      h('div', { class: 'topbar-inner' },
        h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-dot' }), 'EduSurvey'),
        h('button', {
          class: 'btn btn-sm',
          onclick: async () => {
            try { await api('/api/admin/logout', { method: 'POST' }); } catch { /* 무시 */ }
            isAdmin = false;
            location.hash = '#/';
            route();
          },
        }, '로그아웃')));
  }

  function adminPage(...children) {
    render(topbar(), h('main', { class: 'container' }, ...children));
  }

  function viewLogin() {
    const pw = h('input', { class: 'input', type: 'password', id: 'pw', autocomplete: 'current-password', required: true, maxlength: 200 });
    const err = h('div', { class: 'error-text', hidden: true });
    const btn = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, '로그인');
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.hidden = true;
        btn.disabled = true;
        try {
          await api('/api/admin/login', { method: 'POST', body: { password: pw.value } });
          isAdmin = true;
          route();
        } catch (e2) {
          err.textContent = e2.message;
          err.hidden = false;
          btn.disabled = false;
          pw.select();
        }
      },
    },
      h('div', { class: 'field' }, h('label', { for: 'pw' }, '관리자 비밀번호'), pw),
      btn,
      err);
    render(
      h('div', { class: 'login-wrap' },
        h('div', { class: 'card login-card' },
          h('div', { class: 'brand' }, h('span', { class: 'brand-dot' }), 'EduSurvey'),
          form)));
    pw.focus();
  }

  // ---------- 대시보드 ----------
  function statusBadge(status) {
    return h('span', { class: `badge badge-${status === 'closed' ? 'closed' : 'open'}` }, STATUS_LABELS[status] || STATUS_LABELS.open);
  }

  async function viewDashboard() {
    loading();
    let data;
    try { data = await adminApi('/api/surveys'); } catch (e) { return showError(e); }
    const surveys = data.surveys || [];

    let body;
    if (surveys.length === 0) {
      body = h('div', { class: 'empty' }, h('p', null, '아직 만든 설문이 없습니다.'),
        h('a', { class: 'btn btn-primary', href: '#/surveys/new' }, '새 설문 만들기'));
    } else {
      body = [
        h('div', { class: 'table-wrap' },
          h('table', { class: 'list' },
            h('thead', null, h('tr', null,
              h('th', null, '교육명'), h('th', null, '고객사'), h('th', { style: { textAlign: 'right' } }, '응답수'),
              h('th', null, '상태'), h('th', null, '생성일'), h('th', null, ''))),
            h('tbody', null, surveys.map((s) => h('tr', null,
              h('td', { class: 'title-cell' }, h('a', { href: `#/surveys/${s.id}/results` }, s.title)),
              h('td', null, s.client || '-'),
              h('td', { class: 'num' }, s.response_count),
              h('td', null, statusBadge(s.status)),
              h('td', null, fmtDate(s.created_at)),
              h('td', null, h('div', { class: 'btn-row', style: { justifyContent: 'flex-end', flexWrap: 'nowrap' } },
                h('a', { class: 'btn btn-sm', href: `#/surveys/${s.id}/results` }, '결과'),
                h('a', { class: 'btn btn-sm', href: `#/surveys/${s.id}/edit` }, '문항 편집')))))))),
        h('div', { class: 'survey-cards' }, surveys.map((s) =>
          h('a', { class: 'survey-card', href: `#/surveys/${s.id}/results` },
            h('div', { class: 't' }, s.title),
            h('div', { class: 'meta' },
              statusBadge(s.status),
              h('span', null, s.client || '-'),
              h('span', null, `응답 ${s.response_count}`),
              h('span', null, fmtDate(s.created_at)))))),
      ];
    }

    adminPage(
      h('div', { class: 'page-head' },
        h('h1', null, '설문 목록'),
        h('a', { class: 'btn btn-primary', href: '#/surveys/new' }, '새 설문 만들기')),
      h('div', { class: 'card' }, body));
  }

  // ---------- 설문 생성 ----------
  function viewCreate() {
    const f = {
      title: h('input', { class: 'input', id: 'f-title', required: true, maxlength: 200 }),
      client: h('input', { class: 'input', id: 'f-client', maxlength: 100 }),
      edu_date: h('input', { class: 'input', id: 'f-date', type: 'date' }),
      instructor: h('input', { class: 'input', id: 'f-inst', maxlength: 100 }),
      round: h('input', { class: 'input', id: 'f-round', maxlength: 50 }),
    };
    const err = h('div', { class: 'error-text', hidden: true });
    const btn = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, '설문 생성');
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.hidden = true;
        btn.disabled = true;
        const body = {};
        for (const [k, el] of Object.entries(f)) body[k] = el.value.trim() || null;
        try {
          const r = await adminApi('/api/surveys', { method: 'POST', body });
          toast('설문이 생성되었습니다.');
          location.hash = `#/surveys/${r.id}/edit`;
        } catch (e2) {
          if (e2.handled) return;
          err.textContent = e2.message;
          err.hidden = false;
          btn.disabled = false;
        }
      },
    },
      h('div', { class: 'field' }, h('label', { for: 'f-title' }, '교육명 *'), f.title),
      h('div', { class: 'grid-2' },
        h('div', { class: 'field' }, h('label', { for: 'f-client' }, '고객사명'), f.client),
        h('div', { class: 'field' }, h('label', { for: 'f-date' }, '교육일자'), f.edu_date),
        h('div', { class: 'field' }, h('label', { for: 'f-inst' }, '강사명'), f.instructor),
        h('div', { class: 'field' }, h('label', { for: 'f-round' }, '차수'), f.round)),
      h('p', { class: 'subtle' }, '생성 시 표준 문항 템플릿이 자동으로 적용됩니다.'),
      h('div', { class: 'btn-row' }, btn, h('a', { class: 'btn btn-lg', href: '#/' }, '취소')),
      err);
    adminPage(
      h('a', { class: 'back-link', href: '#/' }, '← 설문 목록'),
      h('div', { class: 'page-head' }, h('h1', null, '새 설문 만들기')),
      h('div', { class: 'card' }, form));
    f.title.focus();
  }

  // ---------- 문항 편집 ----------
  async function viewEdit(id) {
    loading();
    let survey;
    try { survey = (await adminApi(`/api/surveys/${encodeURIComponent(id)}`)).survey; } catch (e) { return showError(e); }

    // 편집용 로컬 상태 (choice 선택지는 줄바꿈 텍스트로 편집)
    const questions = survey.questions.map((q) => ({ ...q, optionsText: (q.options || []).join('\n') }));
    let dirty = false;
    const listEl = h('div');
    const err = h('div', { class: 'error-text', hidden: true });

    function markDirty() { dirty = true; }

    function move(i, d) {
      const j = i + d;
      if (j < 0 || j >= questions.length) return;
      [questions[i], questions[j]] = [questions[j], questions[i]];
      markDirty();
      drawList();
    }

    function drawList() {
      listEl.replaceChildren(...questions.map((q, i) => {
        const qInput = h('textarea', { class: 'textarea', rows: 2, maxlength: 300, style: { minHeight: '60px' }, 'aria-label': `${i + 1}번 문항 내용` });
        qInput.value = q.question;
        qInput.addEventListener('input', () => { q.question = qInput.value; markDirty(); });

        const typeSel = h('select', { class: 'select', 'aria-label': `${i + 1}번 문항 타입` },
          Object.entries(TYPE_LABELS).map(([v, l]) => h('option', { value: v }, l)));
        typeSel.value = q.type;
        typeSel.addEventListener('change', () => { q.type = typeSel.value; markDirty(); drawList(); });

        const reqBox = h('input', { type: 'checkbox', checked: q.required });
        reqBox.addEventListener('change', () => { q.required = reqBox.checked; markDirty(); });

        let optField = null;
        if (q.type === 'choice') {
          const ta = h('textarea', { class: 'textarea', rows: 4, placeholder: '한 줄에 하나씩 입력', 'aria-label': `${i + 1}번 문항 선택지` });
          ta.value = q.optionsText;
          ta.addEventListener('input', () => { q.optionsText = ta.value; markDirty(); });
          optField = h('div', { class: 'field', style: { marginTop: '10px', marginBottom: 0 } },
            h('span', { class: 'field-label' }, '선택지 (한 줄에 하나씩)'), ta);
        }

        return h('div', { class: 'q-item' },
          h('div', { class: 'q-item-head' },
            h('span', { class: 'q-num' }, `Q${i + 1}`),
            h('div', { class: 'btn-row' },
              h('button', { class: 'btn btn-sm btn-icon', type: 'button', title: '위로', 'aria-label': '위로 이동', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
              h('button', { class: 'btn btn-sm btn-icon', type: 'button', title: '아래로', 'aria-label': '아래로 이동', disabled: i === questions.length - 1, onclick: () => move(i, 1) }, '↓'),
              h('button', {
                class: 'btn btn-sm btn-danger', type: 'button',
                onclick: () => {
                  if (!confirm(`Q${i + 1} 문항을 삭제할까요?`)) return;
                  questions.splice(i, 1);
                  markDirty();
                  drawList();
                },
              }, '삭제'))),
          qInput,
          h('div', { class: 'q-item-controls' },
            typeSel,
            h('label', { class: 'checkbox' }, reqBox, '필수')),
          optField);
      }));
      if (questions.length === 0) listEl.appendChild(h('div', { class: 'empty' }, '문항이 없습니다. 문항을 추가해 주세요.'));
    }

    const saveBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button' }, '저장');
    saveBtn.addEventListener('click', async () => {
      err.hidden = true;
      const payload = questions.map((q) => {
        const out = { id: q.id, question: q.question.trim(), type: q.type, required: Boolean(q.required) };
        if (q.type === 'choice') out.options = q.optionsText.split('\n').map((s) => s.trim()).filter(Boolean);
        return out;
      });
      saveBtn.disabled = true;
      try {
        const r = await adminApi(`/api/surveys/${encodeURIComponent(id)}`, { method: 'PUT', body: { questions: payload } });
        r.survey.questions.forEach((q, i) => { questions[i].id = q.id; });
        dirty = false;
        toast('저장되었습니다.');
      } catch (e) {
        if (e.handled) return;
        err.textContent = e.message;
        err.hidden = false;
      } finally {
        saveBtn.disabled = false;
      }
    });

    const addBtn = h('button', {
      class: 'btn', type: 'button',
      onclick: () => {
        questions.push({ id: '', question: '', type: 'likert5', required: true, optionsText: '' });
        markDirty();
        drawList();
        const items = listEl.querySelectorAll('.q-item');
        const last = items[items.length - 1];
        if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); last.querySelector('textarea').focus(); }
      },
    }, '+ 문항 추가');

    drawList();

    adminPage(
      h('a', { class: 'back-link', href: `#/surveys/${id}/results`, onclick: (e) => { if (dirty && !confirm('저장하지 않은 변경사항이 있습니다. 나가시겠습니까?')) e.preventDefault(); } }, '← 결과 대시보드'),
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, '문항 편집'), h('div', { class: 'muted' }, survey.title, survey.client ? ` · ${survey.client}` : '')),
        h('a', { class: 'btn btn-sm', href: surveyUrl(survey.code), target: '_blank', rel: 'noopener' }, '응답 화면 미리보기')),
      survey.response_count > 0
        ? h('div', { class: 'notice' }, `이미 ${survey.response_count}건의 응답이 있습니다. 문항을 삭제하거나 타입·선택지를 바꾸면 기존 응답 집계에 영향을 줄 수 있습니다.`)
        : null,
      listEl,
      h('div', { class: 'sticky-save' },
        h('div', { class: 'btn-row' }, addBtn, saveBtn),
        err));
  }

  // ---------- 결과 대시보드 ----------
  function bars(distribution, total) {
    return h('div', { class: 'bars', role: 'table' }, distribution.map((d) => {
      const pct = total ? Math.round((d.count / total) * 1000) / 10 : 0;
      return h('div', { class: 'bar-row', role: 'row', title: `${d.label}: ${d.count}명 (${pct}%)` },
        h('span', { class: 'lbl', role: 'cell' }, d.label),
        h('div', { class: 'bar-track', 'aria-hidden': 'true' }, h('div', { class: 'bar-fill', style: { width: `${pct}%` } })),
        h('span', { class: 'val', role: 'cell' }, `${d.count}명`, h('span', { class: 'pct' }, `${pct}%`)));
    }));
  }

  async function viewResults(id) {
    loading();
    let data;
    try { data = await adminApi(`/api/surveys/${encodeURIComponent(id)}/results`); } catch (e) { return showError(e); }
    const { survey, results } = data;
    const link = surveyUrl(survey.code);

    // 공유: 링크 복사 + QR
    const qrBox = h('div', { class: 'qr', 'aria-label': '설문 QR 코드' });
    const share = h('div', { class: 'card' },
      h('h3', null, '설문 링크'),
      h('div', { class: 'share' },
        h('div', null,
          h('div', { class: 'share-link' },
            h('input', { class: 'input', readonly: true, value: link, onfocus: (e) => e.target.select(), 'aria-label': '설문 링크' }),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => toast((await copyText(link)) ? '링크가 복사되었습니다.' : '복사에 실패했습니다.') }, '링크 복사')),
          h('div', { class: 'btn-row', style: { marginTop: '12px' } },
            h('a', { class: 'btn btn-sm', href: link, target: '_blank', rel: 'noopener' }, '응답 화면 열기'))),
        qrBox));

    const statusBtn = h('button', { class: 'btn', type: 'button' }, survey.status === 'closed' ? '설문 다시 진행' : '설문 종료');
    statusBtn.addEventListener('click', async () => {
      const next = survey.status === 'closed' ? 'open' : 'closed';
      if (next === 'closed' && !confirm('설문을 종료할까요? 종료하면 더 이상 응답을 받을 수 없습니다.')) return;
      statusBtn.disabled = true;
      try {
        await adminApi(`/api/surveys/${encodeURIComponent(id)}`, { method: 'PUT', body: { status: next } });
        toast(next === 'closed' ? '설문을 종료했습니다.' : '설문을 다시 진행합니다.');
        viewResults(id);
      } catch (e) {
        if (!e.handled) toast(e.message);
        statusBtn.disabled = false;
      }
    });

    const deleteBtn = h('button', {
      class: 'btn btn-danger', type: 'button',
      onclick: async () => {
        if (!confirm(`'${survey.title}' 설문과 모든 응답(${results.totalResponses}건)을 삭제할까요? 되돌릴 수 없습니다.`)) return;
        try {
          await adminApi(`/api/surveys/${encodeURIComponent(id)}`, { method: 'DELETE' });
          toast('삭제되었습니다.');
          location.hash = '#/';
        } catch (e) {
          if (!e.handled) toast(e.message);
        }
      },
    }, '삭제');

    // 요약 지표
    const scaleQs = results.questions.filter((q) => q.type === 'likert5' && q.average !== null);
    const overallLikert = scaleQs.length ? (scaleQs.reduce((a, q) => a + q.average, 0) / scaleQs.length).toFixed(2) : null;
    const nps = results.nps;
    const stats = h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('div', { class: 'label' }, '총 응답수'), h('div', { class: 'value' }, results.totalResponses)),
      h('div', { class: 'stat' },
        h('div', { class: 'label' }, 'NPS 점수'),
        h('div', { class: 'value' }, nps ? (nps.score > 0 ? `+${nps.score}` : nps.score) : '-'),
        nps ? h('div', { class: 'nps-split' },
          h('span', null, `추천 ${nps.promoterPct}%`),
          h('span', null, `중립 ${Math.round((100 - nps.promoterPct - nps.detractorPct) * 100) / 100}%`),
          h('span', null, `비추천 ${nps.detractorPct}%`)) : null),
      h('div', { class: 'stat' }, h('div', { class: 'label' }, '5점 척도 문항 평균'), h('div', { class: 'value' }, overallLikert ?? '-'), h('div', { class: 'sub' }, '5점 만점')));

    // 문항별 결과
    const qCards = results.questions.map((q, i) => {
      const head = h('div', { class: 'result-head' },
        h('div', null,
          h('div', { class: 'q-title' }, `Q${i + 1}. ${q.question}`),
          h('div', { class: 'btn-row', style: { marginTop: '6px' } },
            h('span', { class: 'badge badge-type' }, TYPE_LABELS[q.type]),
            h('span', { class: 'subtle' }, `응답 ${q.count}명`))),
        (q.type === 'likert5' || q.type === 'nps')
          ? h('div', { class: 'avg' },
              h('div', { class: 'num' }, q.average ?? '-'),
              h('div', { class: 'of' }, q.type === 'nps' ? '평균 / 10' : '평균 / 5'))
          : null);
      let content;
      if (q.type === 'text') {
        content = q.answers.length
          ? h('ul', { class: 'text-answers' }, q.answers.map((a) => h('li', null, a.text,
              h('span', { class: 'who' }, `${a.respondent_name || '익명'} · ${fmtDate(a.created_at, true)}`))))
          : h('p', { class: 'subtle' }, '아직 답변이 없습니다.');
      } else {
        const dist = q.type === 'likert5' ? [...q.distribution].reverse() : q.distribution;
        content = bars(dist, q.count);
        if (q.type === 'nps' && q.nps) {
          content = [content, h('div', { class: 'nps-split', style: { marginTop: '10px' } },
            h('span', null, `추천(9~10) ${q.nps.promoters}명`),
            h('span', null, `중립(7~8) ${q.nps.passives}명`),
            h('span', null, `비추천(0~6) ${q.nps.detractors}명`),
            h('strong', null, `NPS ${q.nps.score}`))];
        }
      }
      return h('div', { class: 'card' }, head, content);
    });

    adminPage(
      h('a', { class: 'back-link', href: '#/' }, '← 설문 목록'),
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, survey.title, ' ', statusBadge(survey.status)),
          h('div', { class: 'muted' }, [survey.client, survey.edu_date, survey.instructor && `강사 ${survey.instructor}`, survey.round].filter(Boolean).join(' · '))),
        h('div', { class: 'btn-row' },
          h('a', { class: 'btn', href: `/api/surveys/${encodeURIComponent(id)}/export.csv`, download: '' }, 'CSV 다운로드'),
          h('a', { class: 'btn', href: `#/surveys/${id}/edit` }, '문항 편집'),
          statusBtn,
          deleteBtn)),
      stats,
      share,
      qCards);

    if (window.QRCode) {
      new window.QRCode(qrBox, { text: link, width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M });
    } else {
      qrBox.textContent = 'QR 코드를 불러오지 못했습니다.';
    }
  }

  // ---------- 응답자 페이지 ----------
  async function viewRespond(code) {
    loading();
    let survey;
    try { survey = (await api(`/api/s/${encodeURIComponent(code)}`)).survey; } catch (e) { return showError(e); }

    const header = h('div', { class: 'respond-head' },
      h('div', { class: 'respond-head-inner' },
        survey.client ? h('div', { class: 'client' }, survey.client) : null,
        h('h1', null, survey.title),
        h('div', { class: 'meta' },
          survey.edu_date ? h('span', null, survey.edu_date) : null,
          survey.instructor ? h('span', null, `강사 ${survey.instructor}`) : null,
          survey.round ? h('span', null, survey.round) : null)));

    if (survey.closed) {
      render(header, h('main', { class: 'container narrow' },
        h('div', { class: 'card thanks' }, h('h2', null, '종료된 설문입니다.'), h('p', { class: 'muted' }, '더 이상 응답을 받지 않습니다.'))));
      return;
    }

    const answers = {};
    const qEls = {};

    function scaleInput(q, min, max) {
      const btns = [];
      for (let v = min; v <= max; v++) {
        const b = h('button', { type: 'button', class: 'scale-btn', 'aria-pressed': 'false', 'aria-label': `${v}점` }, v);
        b.addEventListener('click', () => {
          answers[q.id] = v;
          btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          qEls[q.id].classList.remove('invalid');
        });
        btns.push(b);
      }
      return [
        h('div', { class: `scale ${max - min + 1 === 5 ? 'scale-5' : 'scale-11'}`, role: 'group' }, btns),
        h('div', { class: 'scale-hint' }, h('span', null, `${min} 낮음`), h('span', null, `${max} 높음`)),
      ];
    }

    function choiceInput(q) {
      const btns = (q.options || []).map((o) => {
        const b = h('button', { type: 'button', class: 'choice-btn', 'aria-pressed': 'false' }, o);
        b.addEventListener('click', () => {
          answers[q.id] = o;
          btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          qEls[q.id].classList.remove('invalid');
        });
        return b;
      });
      return h('div', { class: 'choice-list', role: 'group' }, btns);
    }

    function textInput(q) {
      const ta = h('textarea', { class: 'textarea', maxlength: 2000, 'aria-label': q.question });
      ta.addEventListener('input', () => {
        answers[q.id] = ta.value;
        if (ta.value.trim()) qEls[q.id].classList.remove('invalid');
      });
      return ta;
    }

    const qCards = survey.questions.map((q, i) => {
      let input;
      if (q.type === 'likert5') input = scaleInput(q, 1, 5);
      else if (q.type === 'nps') input = scaleInput(q, 0, 10);
      else if (q.type === 'choice') input = choiceInput(q);
      else input = textInput(q);
      const el = h('section', { class: 'card r-question' },
        h('div', { class: 'q-title' }, `${i + 1}. ${q.question}`,
          q.required ? h('span', { class: 'req', 'aria-label': '필수' }, '*') : h('span', { class: 'opt' }, '(선택)')),
        input);
      qEls[q.id] = el;
      return el;
    });

    const nameInput = h('input', { class: 'input', id: 'r-name', maxlength: 50, autocomplete: 'name', placeholder: '익명으로 응답하려면 비워두세요' });
    const err = h('div', { class: 'error-text', hidden: true, style: { textAlign: 'center' } });
    const submitBtn = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button' }, '제출하기');

    submitBtn.addEventListener('click', async () => {
      err.hidden = true;
      const missing = survey.questions.filter((q) => {
        if (!q.required) return false;
        const v = answers[q.id];
        return v === undefined || v === null || (typeof v === 'string' && !v.trim());
      });
      survey.questions.forEach((q) => qEls[q.id].classList.toggle('invalid', missing.includes(q)));
      if (missing.length) {
        err.textContent = `필수 문항 ${missing.length}개에 답해 주세요.`;
        err.hidden = false;
        qEls[missing[0].id].scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const payload = {};
      for (const q of survey.questions) {
        const v = answers[q.id];
        if (v === undefined || (typeof v === 'string' && !v.trim())) continue;
        payload[q.id] = typeof v === 'string' ? v.trim() : v;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = '제출 중...';
      try {
        await api(`/api/s/${encodeURIComponent(code)}/responses`, {
          method: 'POST',
          body: { respondent_name: nameInput.value.trim() || null, answers: payload },
        });
        render(header, h('main', { class: 'container narrow' },
          h('div', { class: 'card thanks' },
            h('div', { class: 'check', 'aria-hidden': 'true' }, '✓'),
            h('h2', null, '응답해 주셔서 감사합니다.'))));
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = '제출하기';
      }
    });

    render(header, h('main', { class: 'container narrow' },
      h('div', { class: 'card' },
        h('div', { class: 'field', style: { marginBottom: 0 } },
          h('label', { for: 'r-name' }, '성명 (선택)'), nameInput)),
      qCards,
      submitBtn,
      err));
  }

  // ---------- 라우터 ----------
  async function adminRoute(fn) {
    if (!(await checkAdmin())) return viewLogin();
    return fn();
  }

  function route() {
    const path = (location.hash || '#/').replace(/^#/, '') || '/';
    let m;
    if ((m = path.match(/^\/s\/([A-Za-z0-9]+)\/?$/))) return viewRespond(m[1]);
    if (path === '/' || path === '') return adminRoute(viewDashboard);
    if (path === '/surveys/new') return adminRoute(viewCreate);
    if ((m = path.match(/^\/surveys\/([0-9a-fA-F-]+)\/edit\/?$/))) return adminRoute(() => viewEdit(m[1]));
    if ((m = path.match(/^\/surveys\/([0-9a-fA-F-]+)\/results\/?$/))) return adminRoute(() => viewResults(m[1]));
    showError(new Error('페이지를 찾을 수 없습니다.'));
  }

  // /s/:code 경로로 직접 접근한 경우 해시 라우트로 변환
  const direct = location.pathname.match(/^\/s\/([A-Za-z0-9]+)\/?$/);
  if (direct) {
    history.replaceState(null, '', `/#/s/${direct[1]}`);
  }

  window.addEventListener('hashchange', route);
  route();
})();
