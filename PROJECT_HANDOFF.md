# 커머스팀 주간업무 대시보드 인수인계

## 현재 버전

기존 개인/팀 보드 구조를 배포 가능한 `Vite + React + Firebase + Vercel Serverless` 구조로 재정리했습니다.

핵심 변경점:

- `tasks/{uid}` 중심 구조를 `teams/{teamId}` 중심 구조로 변경
- Gemini API Key를 브라우저에 저장하지 않고 Vercel 서버 함수에서만 사용
- `VITE_MANAGER_EMAILS` 기준으로 팀장/팀원 화면 분리
- 업무 상태값을 `대기`, `진행`, `검토`, `막힘`, `완료`로 확장
- 팀장 홈, 개인 업무, 팀 보드, 보고 초안 화면으로 운영 흐름 분리
- Firestore 보안 규칙 초안과 실제 DB 구조 문서 추가

## 주요 화면

### 팀장 홈

- 공유 팀원 수
- 공유 업무 완료율
- 막힘/지연 업무
- 대표님 지시사항 완료율
- 이번 주 집중 큐
- 병목 신호
- KPI 바

### 내 업무

- 이번 주 업무 추가
- 상태, 우선순위, 마감일, 연결 KPI, 팀 공유 여부 관리
- 팀 공유 버튼으로 해당 주차 팀 보드에 반영
- 완료 업무 히스토리 확인
- Gemini 1.5 Flash 기반 다음 주 제안 생성
- 수동 메모 저장

### 팀 보드

- 대표님 지시사항 12개 액션플랜
- 카테고리 필터: 전체, 즉시, 이번 주, 이번 달, 2분기
- 상태 필터: 전체, 대기, 진행, 검토, 막힘, 완료
- 팀원별 공유 업무 카드
- 채널 전략 요약
- KPI 수정

### 보고 초안

- 팀 공유 업무, 지시사항, KPI를 Gemini 1.5 Flash로 분석
- 완료/진전, 리스크, 다음 액션, 대표님 보고문 초안 생성
- 결과 복사 가능

## DB 구조

상세 구조는 `DB_SCHEMA.md`를 기준으로 보면 됩니다.

```text
teams/{teamId}
teams/{teamId}/members/{uid}
teams/{teamId}/members/{uid}/weeks/{weekKey}
teams/{teamId}/members/{uid}/notes/{noteId}
teams/{teamId}/weeks/{weekKey}/shared/{uid}
teams/{teamId}/actionItems/{itemId}
teams/{teamId}/kpis/{kpiId}
teams/{teamId}/reports/{reportId}
```

## 배포 구조

- `src/App.jsx`: 화면과 업무 흐름
- `src/lib/db.js`: Firestore 접근 계층
- `src/lib/constants.js`: 초기 액션플랜과 KPI
- `api/gemini.js`: Vercel Serverless Gemini 호출
- `firestore.rules`: Firestore 보안 규칙
- `SETUP.md`: 단계별 배포 가이드

## 환경변수

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_DEFAULT_TEAM_ID=commerce
VITE_MANAGER_EMAILS=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

`VITE_MANAGER_EMAILS`가 비어 있으면 초기 테스트 편의를 위해 모든 사용자가 팀장으로 보입니다. 실제 운영 전에는 팀장 Google 이메일을 반드시 입력해야 합니다.

## 검증 상태

- 서버 함수 `api/gemini.js` 문법 확인 완료
- JSX/JS 파일 Babel 파서 구문 검사 완료
- npm 의존성 설치 완료
- 현재 로컬 샌드박스에서는 `esbuild` 하위 프로세스 실행 권한 문제로 `vite build`는 중단됨

Vercel 또는 일반 로컬 Node 환경에서는 `npm install && npm run build`로 최종 빌드 확인이 필요합니다.
