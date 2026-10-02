# EduSurvey — 교육만족도 설문앱

레퍼런스HRD 기업교육용 교육만족도 설문 앱입니다.
정적 SPA(`index.html` + `styles.css` + `app.js`, 해시 라우팅) + Vercel Serverless Functions(`api/`) + Turso(libSQL).
빌드 과정은 없습니다.

## 화면

| 경로 | 설명 |
|---|---|
| `#/` | 관리자 로그인 → 설문 목록 대시보드 |
| `#/surveys/new` | 새 설문 만들기 (표준 문항 템플릿 자동 적용) |
| `#/surveys/:id/edit` | 문항 편집 (추가/수정/삭제/순서 변경) |
| `#/surveys/:id/results` | 결과 대시보드 (평균·분포, NPS, 주관식, CSV, 링크/QR, 상태 토글) |
| `#/s/:code` (또는 `/s/:code`) | 응답자용 설문 페이지 (로그인 불필요) |

## 1. 사전 준비

- Node.js 18 이상
- Vercel CLI: `npm i -g vercel`
- Turso CLI: https://docs.turso.tech/cli/installation

```bash
npm install
```

## 2. Turso DB 생성 및 스키마 초기화

```bash
turso auth login
turso db create edu-survey
turso db shell edu-survey < schema.sql

# 접속 정보 확인
turso db show edu-survey --url        # → TURSO_DATABASE_URL
turso db tokens create edu-survey     # → TURSO_AUTH_TOKEN
```

스키마는 `CREATE TABLE IF NOT EXISTS`이므로 여러 번 실행해도 안전합니다.

## 3. 환경변수

`.env.example`을 복사해 `.env`를 만들고 값을 채웁니다. (`.env`는 git에 올라가지 않습니다.)

```bash
cp .env.example .env
```

| 변수 | 설명 |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://...` (로컬 테스트용으로 `file:local.db`도 가능) |
| `TURSO_AUTH_TOKEN` | Turso DB 토큰 |
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 |
| `ADMIN_SECRET` | 세션 쿠키 서명 키 (16자 이상 랜덤 문자열) |

### 관리자 초기 비밀번호 설정

비밀번호는 코드에 없고 `ADMIN_PASSWORD` 환경변수로만 지정합니다. 추측하기 어려운 값으로 정하세요.
서명 키는 아래처럼 랜덤 생성합니다.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # → ADMIN_SECRET
```

비밀번호를 바꾸려면 환경변수 값을 바꾸고 재배포하면 됩니다. `ADMIN_SECRET`을 바꾸면 기존 로그인 세션이 모두 무효화됩니다.

## 4. 로컬 실행

```bash
npx vercel dev
```

처음 실행 시 Vercel 프로젝트 연결을 묻습니다. 실행 후 http://localhost:3000 접속 → 관리자 비밀번호로 로그인.
`vercel dev`는 프로젝트 루트의 `.env`를 읽습니다.

## 5. Vercel 환경변수 등록 (배포 시)

```bash
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
vercel env add ADMIN_PASSWORD production
vercel env add ADMIN_SECRET production
```

또는 Vercel 대시보드 → Project → Settings → Environment Variables에서 등록합니다.
시크릿 값은 `vercel env pull`로 옮기면 `[SENSITIVE]`로 가려져 저장될 수 있으니, 새로 발급한 값을 직접 등록하세요.
환경변수를 바꾼 뒤에는 재배포해야 반영됩니다.

## API

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| POST | `/api/admin/login` | 공개 | `{password}` 검증 후 httpOnly 서명 쿠키 발급 (IP당 분당 10회 제한) |
| POST | `/api/admin/logout` | 공개 | 세션 쿠키 삭제 |
| GET | `/api/admin/me` | 공개 | 로그인 여부 확인 |
| GET | `/api/surveys` | 관리자 | 설문 목록 (응답수 포함) |
| POST | `/api/surveys` | 관리자 | 설문 생성 (표준 문항 템플릿 적용) |
| GET/PUT/DELETE | `/api/surveys/:id` | 관리자 | 설문 조회/수정(기본정보·상태·문항)/삭제 |
| GET | `/api/surveys/:id/results` | 관리자 | 집계 결과 |
| GET | `/api/surveys/:id/export.csv` | 관리자 | CSV 다운로드 (UTF-8 BOM) |
| GET | `/api/s/:code` | 공개 | 설문 정보 + 문항 (`closed` 플래그 포함) |
| POST | `/api/s/:code/responses` | 공개 | 응답 제출 (종료 시 403, IP당 분당 30회) |

## 파일 구조

```
index.html, styles.css, app.js   # SPA
api/                             # Vercel Serverless Functions
lib/api/db.js                    # Turso 클라이언트 싱글톤
lib/api/auth.js                  # 세션 쿠키 서명/검증, requireAdmin(req)
lib/api/survey.js                # 표준 템플릿, 입력 검증, 집계
lib/api/http.js, ratelimit.js    # 공통 헬퍼
schema.sql                       # DB 스키마
```
