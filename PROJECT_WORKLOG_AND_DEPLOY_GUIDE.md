# NST BIO 주간업무 대시보드 작업/운영 가이드

이 문서는 현재까지 구현한 주간업무 대시보드의 전체 구조, 기능, Firebase/Vercel 설정, Git 업로드 방법, 자주 막혔던 오류 해결법을 한 번에 보기 위한 핸드오프 문서입니다.

## 1. 프로젝트 목적

NST BIO 마케팅본부 내 커머스, 리테일, 전략파트너 팀의 주간업무를 한 곳에서 관리합니다.

- 개인별 이번 주 업무 관리
- 팀별 공유 업무 확인
- 팀장 홈에서 집중 업무, 병목, KPI 확인
- 진행 프로젝트 관리
- 일일업무보고 자동 생성
- AI 누적관리 원장 생성
- 수정요청사항을 캡처/프롬프트 형태로 저장

## 2. 실행 주소

로컬 화면만 확인할 때:

```powershell
cd "C:\Users\THED\Documents\Codex\2026-04-24\files-mentioned-by-the-user-20260422"
npm run dev
```

AI API, Vercel Serverless API까지 함께 확인할 때:

```powershell
cd "C:\Users\THED\Documents\Codex\2026-04-24\files-mentioned-by-the-user-20260422"
npm run dev:vercel
```

`Ready! Available at http://localhost:3000`이 뜨면 브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:3000
```

중요: 터미널을 끄거나 `Ctrl + C`를 누르면 로컬 서버가 꺼집니다.

## 3. 주요 기능

### 3.1 내 업무

- 이번 주 업무 추가
- 업무명, 기대효과/KPI, 진행 내용, 우선순위, 상태, 마감일 입력
- 상태는 `대기`, `진행`, `검토`, `막힘`, `완료`로 관리
- 상태 선택 후 `확인` 버튼을 눌러야 실제 반영
- `완료` 처리 시 완료 업무 히스토리로 이동
- 완료 히스토리는 월요일~금요일 기준으로 주차별 누적
- 업무별 코멘트/피드백 기록
- 작성자 본인은 오늘 진행내용 입력 가능
- 타인은 피드백 코멘트 작성 가능
- 댓글 작성자는 본인 댓글 삭제 가능
- 오늘 진행내용에 이미지 첨부 가능
- 오늘 입력한 진행내용은 `오늘의 주요업무`로 자동 집계

### 3.2 팀장 홈

- 공유 팀원 수
- 공유 업무 완료율
- 개입 필요 업무 수
- 진행 프로젝트 완료율
- 이번 주 집중 큐
- 마감/병목 신호
- KPI 바
- 팀별 필터: 커머스, 리테일, 전략파트너
- 집중 큐 업무 클릭 시 해당 업무 코멘트가 바로 아래 표시

### 3.3 팀 보드

- 팀별 공유 현황
- 진행 프로젝트 목록
- 프로젝트 상태 변경 후 확인 버튼으로 반영
- 프로젝트 클릭 시 코멘트/답글 가능
- 최근 코멘트 인박스
- 우선순위 업무 인박스
- 우선순위 기준:
  - 마감 임박 업무
  - 막힘 업무
  - 중요도 높음
  - 수동 우선순위 체크

### 3.4 진행 프로젝트

기존 `대표님 지시사항 액션플랜` 명칭을 `진행 프로젝트`로 정리했습니다.

- 기본 진행 프로젝트
- 팀 공유 업무 중 공유 대상 업무도 진행 프로젝트 영역에 반영
- 상태 필터
- 기간 필터
- 팀 필터
- KPI 연결 표시

### 3.5 KPI

- KPI 바에서 현재값/목표값 확인
- 관리자 권한으로 KPI 추가/삭제/수정 가능하도록 확장
- 프로젝트와 연결되는 KPI 관리 구조 준비

### 3.6 보고 초안

보고 초안 화면은 크게 세 가지 역할입니다.

- 오늘 자동 업무보고
- AI 보고 초안 생성
- 일별 업무보고 누적 히스토리

오늘 자동 업무보고:

- 매일 17:50 KST 자동 생성
- 팀장이 17:40~18:10 사이에 수동 재생성 가능
- 오늘 주요업무 기반으로 생성
- PM 피드백
- 일일 업무보고 요약
- 본부장 메일 초안
- AI 누적관리 원장

본부장 메일 초안:

- 바로 복사 가능
- 메일 열기 버튼으로 메일 앱에 제목/본문 전달
- 예시 형식:

```text
안녕하세요. 본부장님

2026년 4/30 일일업무보고 송부드립니다.

오전1 (09:00~11:30)
09:00~10:00 업무내용

오후1 (12:30~18:00)
*12:30~13:30 업무내용
*13:30~15:00 업무내용

끝.

감사합니다.
```

AI 누적관리 원장:

- 사람이 읽는 보고서가 아니라 AI가 다음날 이어서 관리하기 위한 구조화 데이터
- 업무명
- 담당자
- KPI/분류
- 현재 상태
- 오늘 진척
- 결정사항/산출물
- 리스크/막힌 점
- 다음 액션
- 마감/일정
- 데이터 품질

일별 업무보고 누적 히스토리:

- Firestore `teams/{teamId}/reports/daily-YYYY-MM-DD` 문서가 날짜별로 누적
- 최신 날짜부터 표시
- 날짜별 아코디언으로 펼쳐보기
- 날짜별 메일 보고/AI 누적관리 요약 복사 가능

### 3.7 수정요청사항

왼쪽 사이드바에 `수정요청사항` 탭을 추가했습니다.

목적:

- 사용자가 화면 캡처와 수정 요청을 게시글처럼 저장
- 저장 시 Codex에게 바로 붙여넣을 프롬프트 자동 생성
- 새 대화창에서 프롬프트만 복사해 붙여넣으면 다음 개선 작업 가능

입력 항목:

- 요청 제목
- 화면 위치
- 현재 문제/수정해야 할 내용
- 원하는 결과
- 캡처 이미지

이미지 첨부 방식:

- `캡처 이미지` 버튼으로 선택
- 입력 영역에서 `Ctrl + V`로 붙여넣기

저장 위치:

```text
teams/{teamId}/changeRequests/{requestId}
```

이미지 저장 위치:

```text
teams/{teamId}/changeRequests/{requestId}/{uid}/...
```

자동 생성 프롬프트 예시:

```text
아래 수정요청을 기준으로 현재 주간업무 대시보드를 개선해줘.

[요청자] WeBikers WeBikers
[요청 제목] 보고 초안 메일 형식 개선
[화면 위치] 보고 초안 > 오늘 자동 업무보고
[캡처 여부] 첨부 캡처: 1장

[현재 문제/수정해야 할 내용]
...

[원하는 결과]
...

[작업 기준]
- 기존 Firebase/Firestore/Vercel 구조를 유지해줘.
- 사용자 데이터가 삭제되지 않도록 기존 저장 구조를 보존해줘.
- 수정 후 로컬에서 확인해야 할 다음 실행 단계를 알려줘.
- 막혔던 방식은 재시도하지 말고 다른 방법을 제안해줘.
```

### 3.8 구성원 관리

관리자/팀장 계정에서만 접근합니다.

- 구성원 닉네임 변경
- 소속팀 변경
- 직책 변경
- 역할 변경
- 게시글 권한 변경
- 권한 예:
  - 내 업무 작성
  - 팀 공유
  - 오늘 진행내용 작성
  - 이미지 첨부
  - 코멘트 작성
  - 답글 작성
  - 팀 프로젝트 상태 변경

## 4. Firebase 구조

### 4.1 Firestore 주요 경로

```text
teams/{teamId}
teams/{teamId}/members/{uid}
teams/{teamId}/members/{uid}/weeks/{weekKey}
teams/{teamId}/members/{uid}/notes/{noteId}
teams/{teamId}/weeks/{weekKey}/shared/{uid}
teams/{teamId}/actionItems/{itemId}
teams/{teamId}/kpis/{kpiId}
teams/{teamId}/reports/daily-YYYY-MM-DD
teams/{teamId}/changeRequests/{requestId}
```

### 4.2 Storage 주요 경로

업무 진행내용 이미지:

```text
teams/{teamId}/members/{uid}/weeks/{weekKey}/tasks/{taskId}/progress/{progressId}/...
```

수정요청 캡처 이미지:

```text
teams/{teamId}/changeRequests/{requestId}/{uid}/...
```

## 5. Firebase 규칙

### 5.1 Firestore Rules

수정요청사항을 사용하려면 아래 경로가 필요합니다.

```js
match /changeRequests/{requestId} {
  allow read, write: if isTeamMember(teamId);
}
```

현재 권장 전체 규칙은 `firestore.rules` 파일을 기준으로 Firebase 콘솔에 붙여넣고 `게시`해야 합니다.

중요: 로컬 파일을 수정해도 Firebase 콘솔에 자동 반영되지 않습니다.

### 5.2 Storage Rules

이미지 업로드를 위해 `storage.rules` 기준으로 설정합니다.

현재 제한:

- 로그인 사용자만 읽기/삭제 가능
- 이미지 파일만 업로드 가능
- 5MB 이하 파일만 업로드 가능

## 6. Vercel 설정

### 6.1 연결 프로젝트

Vercel 프로젝트:

```text
nst_com
```

로컬 연결 명령:

```powershell
npm run dev:vercel
```

처음 연결 시:

```text
Set up and develop ... ? yes
Which scope should contain your project? riderwithrider-9887's projects
Link to existing project? yes
Which existing project do you want to link? nst_com
Would you like to pull environment variables now? yes
```

### 6.2 Vercel 환경변수

필수:

```text
GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_DEFAULT_TEAM_ID
```

일일 자동보고 API용:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
CRON_SECRET
```

주의:

- Vercel 환경변수 변경 후에는 Redeploy가 필요합니다.
- 로컬에서는 `.env.local`을 읽도록 보강했습니다.
- `.env.local`은 Git에 올리면 안 됩니다.

### 6.3 Vercel Cron

`vercel.json` 기준:

```json
{
  "crons": [
    {
      "path": "/api/daily-report",
      "schedule": "50 8 * * 1-5"
    }
  ]
}
```

Vercel Cron은 UTC 기준입니다.

```text
08:50 UTC = 17:50 KST
```

Hobby 플랜에서는 실행 시간이 최대 1시간 정도 유동적일 수 있습니다.

## 7. Gemini AI 구조

API 파일:

```text
api/gemini.js
```

지원 모드:

- `personal`: 완료 업무 분석 후 다음 주 제안
- `teamReport`: 팀 공유/진행 프로젝트/KPI 기반 보고 초안
- `dailyReport`: 오늘 주요업무 기반 일일 업무보고

모델 우회 순서:

```text
gemini-2.5-flash
gemini-2.5-flash-lite
gemini-2.0-flash
```

혼잡/장애 시 다음 모델로 자동 재시도합니다.

재시도 대상 상태:

```text
404, 429, 500, 503
```

JSON 응답이 앞뒤로 섞이거나 일부 불필요한 문장이 붙어도 복구하도록 처리했습니다.

보고서 출력 제한:

- 일일 업무보고: 3200 tokens
- 팀 보고 초안: 1800 tokens
- 개인 제안: 1200 tokens

## 8. Git 업로드 방법

### 8.1 현재 상태 확인

```powershell
cd "C:\Users\THED\Documents\Codex\2026-04-24\files-mentioned-by-the-user-20260422"
git status
```

### 8.2 변경 파일 확인

```powershell
git status --short
```

### 8.3 전체 변경사항 커밋

```powershell
git add .
git commit -m "Update dashboard workflow"
git push origin main
```

### 8.4 일부 파일만 커밋

예시:

```powershell
git add src/App.jsx src/lib/db.js src/styles.css
git commit -m "Add change request board"
git push origin main
```

### 8.5 현재 작업 기준 추천 커밋

현재까지 수정된 주요 파일:

```text
.gitignore
api/daily-report.js
api/gemini.js
firestore.rules
package.json
src/App.jsx
src/lib/ai.js
src/lib/db.js
src/styles.css
PROJECT_WORKLOG_AND_DEPLOY_GUIDE.md
```

추천 커밋:

```powershell
git add .gitignore api/daily-report.js api/gemini.js firestore.rules package.json src/App.jsx src/lib/ai.js src/lib/db.js src/styles.css PROJECT_WORKLOG_AND_DEPLOY_GUIDE.md
git commit -m "Document dashboard workflow and reporting features"
git push origin main
```

### 8.6 Vercel 자동배포

GitHub `main` 브랜치에 push하면 Vercel이 자동 배포합니다.

정상 흐름:

```text
로컬 수정
→ git add
→ git commit
→ git push origin main
→ Vercel 자동 배포
→ 배포 완료 후 실제 주소에서 확인
```

배포가 막히는 경우:

- Vercel 프로젝트와 GitHub 계정 권한 불일치
- 커밋 작성자 이메일이 Vercel 프로젝트 권한과 다름
- private repo + Hobby 플랜 협업 제한

해결했던 방식:

```powershell
git config user.name "riderwithrider-dot"
git config user.email "riderwithrider@gmail.com"
```

그 후 다시 커밋/푸시했습니다.

주의: 과거에 `hack-alpha` 작성자 커밋은 Vercel에서 차단되었습니다. 같은 방식은 재시도하지 않는 것이 좋습니다.

## 9. 자주 발생한 오류와 해결법

### 9.1 localhost refused to connect

원인:

- 로컬 서버가 꺼져 있음
- `Ctrl + C`로 Vercel dev를 종료함

해결:

```powershell
npm run dev:vercel
```

터미널을 끄지 않은 상태에서 `http://localhost:3000` 접속.

### 9.2 `/api/gemini` 404

원인:

- `npm run dev`로 실행해서 Vite 화면만 켜짐
- Vercel API 함수가 실행되지 않음

해결:

```powershell
npm run dev:vercel
```

### 9.3 GEMINI_API_KEY 환경변수가 설정되지 않았습니다

원인:

- Vercel 로컬 환경변수가 내려오지 않음
- `.vercel/.env.development.local`에 키가 없음

해결:

```powershell
cd "C:\Users\THED\Documents\Codex\2026-04-24\files-mentioned-by-the-user-20260422"
npx vercel env pull .vercel/.env.development.local
```

현재는 API가 `.env.local`도 읽도록 보강했습니다.

### 9.4 Gemini 1.5 Flash 모델 오류

오류:

```text
models/gemini-1.5-flash is not found
```

해결:

```text
GEMINI_MODEL=gemini-2.5-flash
```

Vercel 환경변수도 변경 후 Redeploy 필요.

### 9.5 This model is currently experiencing high demand

원인:

- Gemini 모델 혼잡

해결:

- 자동 fallback 적용
- `gemini-2.5-flash-lite`
- `gemini-2.0-flash`

### 9.6 Unterminated string in JSON

원인:

- Gemini 응답이 길어져 JSON이 중간에 잘림

해결:

- 출력 토큰 증가
- JSON 복구 로직 추가

### 9.7 Missing or insufficient permissions

원인:

- Firestore Rules에 해당 경로 권한 없음

수정요청사항 저장 시 필요:

```js
match /changeRequests/{requestId} {
  allow read, write: if isTeamMember(teamId);
}
```

Firebase 콘솔에서 Rules 수정 후 반드시 `게시` 클릭.

### 9.8 Cannot read properties of null (reading 'reset')

원인:

- 비동기 저장 후 폼 reset 시점에 폼 참조가 사라짐

해결:

- submit 시작 시 form 참조를 먼저 저장
- `form?.reset()`으로 안전 처리

## 10. 앞으로 작업 시 원칙

- 다음 실행 단계는 항상 명시
- 막혔던 방식은 반복하지 않기
- Firebase/Firestore/Vercel 구조는 유지
- 사용자 데이터 삭제 금지
- Git 작업 전 `git status` 확인
- `.env.local`은 절대 커밋하지 않기
- Firestore Rules/Storage Rules는 로컬 파일 수정만으로 끝나지 않고 Firebase 콘솔 게시 필요
- Vercel 환경변수 변경 후 Redeploy 필요

## 11. 다음 추천 작업

1. `README.md`, `PROJECT_HANDOFF.md` 안의 예전 `gemini-1.5-flash` 표기를 `gemini-2.5-flash`로 정리
2. Firestore Rules를 더 엄격하게 분리
3. 팀 공유 업무 댓글 권한을 Rules 레벨에서 정교화
4. 수정요청사항 상태값 추가
   - 요청됨
   - 검토중
   - 반영완료
   - 보류
5. AI 누적관리 원장을 주간/월간 리포트로 재활용
6. 본부장 메일 초안에 오전/오후 시간 입력 UI 추가

