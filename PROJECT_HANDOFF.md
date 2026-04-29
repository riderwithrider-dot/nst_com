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

## 재시도 금지 기록

아래 항목은 실제 작업 중 막혔던 방식입니다. 같은 문제가 다시 나오면 같은 명령을 반복하지 말고, 바로 우회 경로로 전환합니다.

### Git push/commit

재시도 금지:

- 현재 작업 폴더에서 `git add`, `git commit`, `git hash-object`를 반복 실행하지 않습니다.
- 실패 메시지가 아래와 같으면 로컬 `.git` 권한 문제이므로 같은 명령을 반복해도 해결되지 않습니다.

```text
Unable to create .git/index.lock: Permission denied
insufficient permission for adding an object to repository database .git/objects
```

원인:

- `.git/index.lock` 파일이 실제로 남아 있지 않아도 `.git/index` 또는 `.git/objects` 쓰기 권한이 막혀 있을 수 있습니다.
- OneDrive, 백신, 샌드박스 권한, 이전 Git 프로세스 잠금이 원인일 수 있습니다.

대응:

- GitHub 저장소 접근 권한이 열려 있으면 GitHub API/커넥터로 직접 커밋합니다.
- 로컬에서 처리해야 하면 권한이 정상인 새 폴더에 저장소를 다시 clone한 뒤 수정 파일만 복사해 커밋합니다.
- 기존 작업 폴더의 `.git` 파일을 임의 삭제하거나 강제 초기화하지 않습니다.

### GitHub 저장소 권한

재시도 금지:

- Codex GitHub 앱에서 `riderwithrider-dot/nst_com` 저장소가 보이지 않는 상태로 push를 반복하지 않습니다.
- 현재 확인된 앱 접근 가능 저장소가 `riderwithrider-dot/nonion-marketing`뿐이라면, `nst_com`에는 앱 권한이 없는 상태입니다.

대응:

- GitHub에서 Codex/GitHub App 설치 권한에 `riderwithrider-dot/nst_com` 저장소를 추가합니다.
- 권한 추가 전에는 다른 저장소에 임의 push하지 않습니다.

### Vite 로컬 서버

재시도 금지:

- `Start-Process`로 Vite를 숨김 실행하는 방식을 반복하지 않습니다.
- 이 환경에서는 숨김 실행 또는 build 중 아래 오류가 반복될 수 있습니다.

```text
failed to load config from vite.config.js
Error: spawn EPERM
```

대응:

- 일반 터미널에서 `npm run dev`를 직접 실행해 서버를 띄웁니다.
- 로컬 build 검증이 필요하면 권한이 정상인 일반 Node 환경 또는 Vercel 배포 환경에서 확인합니다.
- 샌드박스에서 `npm run build`가 `spawn EPERM`으로 실패해도, 먼저 Babel parser 문법 검사를 통해 코드 문법을 확인합니다.

### 임시 로그 파일

재시도 금지:

- `vite-*.log` 임시 로그 파일을 Git에 포함하지 않습니다.

대응:

- 커밋 전 `git status --short`에서 `vite-*.log`가 보이면 커밋 대상에서 제외하거나 삭제합니다.
