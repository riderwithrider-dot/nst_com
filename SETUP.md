# 배포 단계별 가이드

## 1. Firebase 프로젝트 생성

1. Firebase Console 접속
2. 프로젝트 만들기
3. 프로젝트명 예시: `nst-bio-commerce-dashboard`
4. Google Analytics는 필요 시에만 활성화

## 2. Google 로그인 활성화

1. Firebase Console에서 Authentication 이동
2. 로그인 방법 탭 선택
3. Google Provider 활성화
4. 프로젝트 공개 이름 입력
5. 저장

## 3. Firestore Database 생성

1. Firestore Database 이동
2. 데이터베이스 만들기
3. 프로덕션 모드 선택
4. 위치는 한국 사용 기준 `asia-northeast3` 권장

## 4. Firestore 보안 규칙 배포

Firebase Console의 Firestore Rules 탭에서 `firestore.rules` 내용을 붙여 넣습니다.

운영 전 확인할 점:

- 팀원이 아닌 사용자가 데이터를 볼 수 없는지 확인
- 액션플랜과 KPI 수정 권한을 전체 팀원에게 열어둘지 결정
- 관리자 역할을 따로 둘 경우 `members/{uid}.role` 기준으로 규칙 강화

## 5. Firebase 웹 앱 등록

1. 프로젝트 설정 이동
2. 일반 탭에서 웹 앱 추가
3. 앱 닉네임 입력
4. Firebase SDK 설정값 복사
5. `.env.local` 또는 Vercel 환경변수에 입력

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_DEFAULT_TEAM_ID=commerce
VITE_MANAGER_EMAILS=팀장_Google_이메일
```

## 6. Gemini API Key 발급

1. Google AI Studio 접속
2. API Key 생성
3. Vercel 환경변수에 아래 값 입력

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

이 프로젝트는 Gemini API를 브라우저에서 직접 호출하지 않고 `api/gemini.js` 서버 함수에서 호출합니다.

## 6-1. 팀장 권한 설정

`.env.local`과 Vercel 환경변수에 `VITE_MANAGER_EMAILS`를 넣습니다.

예시:

```env
VITE_MANAGER_EMAILS=leader@company.com
```

여러 명이면 콤마로 구분합니다.

```env
VITE_MANAGER_EMAILS=leader@company.com,sublead@company.com
```

이 이메일로 Google 로그인한 사람만 `팀장 홈`, `보고 초안`, KPI/지시사항 편집 기능을 볼 수 있습니다.

## 6-2. 소속팀 선택

사용자는 최초 로그인 후 마케팅본부 내 소속팀을 선택합니다.

- 커머스
- 리테일
- 전략파트너

선택값은 `teams/{teamId}/members/{uid}`에 저장되고 `subteamLocked`가 `true`가 됩니다. 일반 팀원은 이후 앱에서 변경할 수 없습니다.

관리자 변경까지 Firestore Rules로 허용하려면 해당 사용자의 멤버 문서에 아래 값을 부여합니다.

```json
{
  "role": "manager"
}
```

주의: `VITE_MANAGER_EMAILS`는 화면 권한이고, Firestore Rules의 관리자 변경 권한은 `role: manager` 기준입니다.

## 7. 로컬 확인

```bash
npm install
cp .env.example .env.local
npm run dev
```

AI 기능까지 로컬에서 확인하려면 Vercel CLI 환경으로 실행합니다.

```bash
npm run dev:vercel
```

## 8. GitHub 업로드

```bash
git init
git add .
git commit -m "build commerce weekly dashboard"
git branch -M main
git remote add origin https://github.com/계정명/저장소명.git
git push -u origin main
```

## 9. Vercel 배포

1. Vercel에서 Add New Project 선택
2. GitHub 저장소 연결
3. Framework Preset이 Vite로 잡혔는지 확인
4. Environment Variables에 Firebase와 Gemini 값을 입력
5. Deploy 실행

## 10. Firebase 승인 도메인 추가

1. Firebase Console 이동
2. Authentication 설정 탭 이동
3. 승인된 도메인에 Vercel 도메인 추가
4. 예: `your-project.vercel.app`

## 11. 최초 로그인 후 확인

최초 로그인 시 아래 데이터가 자동 생성됩니다.

- `teams/commerce`
- `teams/commerce/members/{uid}`
- `teams/commerce/actionItems/*`
- `teams/commerce/kpis/*`

## 12. 배포 전 QA 체크리스트

- Google 로그인 성공
- 팀원 프로필 생성
- 개인 업무 추가/상태 변경/삭제
- 팀 공유 후 팀 보드 반영
- 대표님 지시사항 상태 변경
- KPI 값 수정
- 개인 AI 다음 주 제안 생성
- 팀 보고 초안 생성
- Firestore Rules 적용 후 권한 오류 없음
- Vercel 배포 URL이 Firebase 승인 도메인에 등록됨
