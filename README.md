# NST BIO 커머스팀 주간업무 대시보드

개인 주간업무, 팀 공유 현황, 대표님 지시사항, KPI, AI 보고 초안을 한 화면 운영 체계로 연결한 Vite + React + Firebase 프로젝트입니다.

## 핵심 기능

- Google 로그인 기반 팀원 인증
- 개인 주간업무 추가, 상태 변경, 삭제
- 팀장 이메일 기준으로 팀장 홈과 보고 초안 화면 분리
- 최초 로그인 시 마케팅본부 내 소속팀 선택: `커머스`, `리테일`, `전략파트너`
- 소속팀 확정 후 일반 팀원은 변경 불가
- 업무 상태값: `대기`, `진행`, `검토`, `막힘`, `완료`
- 업무별 우선순위, 마감일, 연결 KPI, 팀 공유 여부 관리
- 팀장 홈에서 공유율, 완료율, 병목, 지시사항 완료율 확인
- 대표님 지시사항 12개 액션플랜 시딩 및 상태 관리
- KPI 현재값 수정 및 진행률 확인
- Gemini 1.5 Flash 기반 개인 다음 주 제안 생성
- Gemini 1.5 Flash 기반 팀 주간 보고 초안 생성
- Gemini API Key는 Vercel 서버 함수에서만 사용

## 기술 구조

- Frontend: React, Vite
- Auth: Firebase Authentication Google Provider
- Database: Cloud Firestore
- AI: Gemini 1.5 Flash REST API
- Deployment: Vercel

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

AI 보고 생성까지 로컬에서 확인하려면 Vercel 함수가 함께 떠야 하므로 아래 명령을 권장합니다.

```bash
npm run dev:vercel
```

## 환경변수

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_DEFAULT_TEAM_ID=commerce
VITE_MANAGER_EMAILS=teamlead@example.com
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

`GEMINI_API_KEY`는 브라우저에 노출하지 않습니다. Vercel 환경변수에만 입력합니다.

`VITE_MANAGER_EMAILS`에는 팀장 권한을 줄 Google 이메일을 콤마로 구분해 넣습니다.

```env
VITE_MANAGER_EMAILS=leader@company.com,manager@company.com
```

이 값이 비어 있으면 초기 세팅 편의를 위해 모든 로그인 사용자가 팀장 화면을 볼 수 있습니다. 실제 운영 전에는 반드시 팀장 이메일을 입력하세요.

## 주요 파일

- `src/App.jsx`: 전체 화면과 업무 흐름
- `src/lib/db.js`: Firestore 읽기/쓰기 함수
- `src/lib/constants.js`: 초기 액션플랜, KPI, 상태값
- `src/lib/firebase.js`: Firebase 초기화
- `api/gemini.js`: Gemini 1.5 Flash 서버 호출
- `firestore.rules`: 운영용 Firestore 보안 규칙 초안
- `SETUP.md`: Firebase와 Vercel 배포 절차
- `DB_SCHEMA.md`: 실제 Firestore 구조

## 운영 기준

팀원이 개인 업무를 작성하고 `팀에 공유`를 누르면 해당 주차의 팀 보드에 반영됩니다. 팀장은 팀장 홈에서 지연, 막힘, 미완료 지시사항을 보고 개입 우선순위를 판단하고, 보고 초안 화면에서 AI 보고문을 생성합니다.

팀장 홈과 팀 보드는 소속팀 필터를 제공합니다. `전체`, `커머스`, `리테일`, `전략파트너` 기준으로 공유 업무와 코멘트를 나누어 볼 수 있습니다.
