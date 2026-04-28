# Firestore DB 구조

이번 버전은 팀 단위 확장을 고려해 모든 운영 데이터를 `teams/{teamId}` 아래에 둡니다.

## 전체 구조

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

## teams/{teamId}

팀 기본 정보입니다.

```json
{
  "teamId": "commerce",
  "name": "NST BIO 커머스팀",
  "updatedAt": "serverTimestamp"
}
```

## teams/{teamId}/members/{uid}

로그인한 팀원 프로필입니다. 최초 로그인 시 자동 생성됩니다.

```json
{
  "uid": "firebase-auth-uid",
  "displayName": "홍길동",
  "email": "user@example.com",
  "photoURL": "https://...",
  "subteam": "commerce",
  "subteamLabel": "커머스",
  "subteamLocked": true,
  "role": "member",
  "updatedAt": "serverTimestamp"
}
```

`subteam`은 최초 로그인 후 사용자가 한 번 선택합니다. 일반 팀원은 선택 후 변경할 수 없고, 운영자가 변경하려면 해당 사용자의 `role`을 `manager`로 부여하거나 Firebase Console에서 직접 조정합니다.

## teams/{teamId}/members/{uid}/weeks/{weekKey}

개인 주간업무 원본입니다. 본인만 읽고 쓸 수 있도록 설계했습니다.

```json
{
  "items": [
    {
      "id": "task_xxx",
      "title": "레몬즙 Forecast 보고 장표 작성",
      "detail": "월별 판매 계획과 채널별 물량 기준 정리",
      "status": "doing",
      "priority": "high",
      "dueDate": "2026-04-30",
      "impact": "레몬즙 판매계획",
      "visibility": "team",
      "ownerUid": "firebase-auth-uid",
      "ownerName": "홍길동",
      "createdAt": "2026-04-28T00:00:00.000Z",
      "updatedAt": "2026-04-28T00:00:00.000Z"
    }
  ],
  "updatedAt": "serverTimestamp"
}
```

### status

- `todo`: 대기
- `doing`: 진행
- `review`: 검토
- `blocked`: 막힘
- `done`: 완료

### priority

- `high`: 높음
- `normal`: 보통
- `low`: 낮음

### visibility

- `team`: 팀 공유 대상
- `private`: 개인 보관

## teams/{teamId}/weeks/{weekKey}/shared/{uid}

팀 보드에 공유된 주간업무 스냅샷입니다. 개인 업무 중 `visibility !== private`인 항목만 올라갑니다.

```json
{
  "uid": "firebase-auth-uid",
  "displayName": "홍길동",
  "email": "user@example.com",
  "photoURL": "https://...",
  "subteam": "commerce",
  "subteamLabel": "커머스",
  "items": [],
  "completionRate": 65,
  "sharedAt": "serverTimestamp"
}
```

## teams/{teamId}/actionItems/{itemId}

대표님 지시사항 액션플랜입니다. 최초 로그인 후 비어 있으면 12개가 자동 시딩됩니다.

```json
{
  "id": "action_lemon_forecast",
  "sortOrder": 20,
  "title": "레몬즙 Forecast 대표님 보고",
  "detail": "월별 판매 계획 장표를 확정하고 연간 151,000세트 기준을 보고합니다.",
  "category": "urgent",
  "assignee": "커머스팀",
  "dueDate": "2026-04-30",
  "status": "todo",
  "done": false,
  "priority": "high",
  "kpi": "레몬즙 판매계획",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

## teams/{teamId}/kpis/{kpiId}

팀 KPI입니다. 현재값은 대시보드에서 수정할 수 있습니다.

```json
{
  "id": "kpi_lemon_sets",
  "sortOrder": 20,
  "label": "레몬즙 연간 판매계획",
  "current": 16000,
  "target": 151000,
  "unit": "세트",
  "owner": "커머스팀",
  "color": "green",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

## teams/{teamId}/members/{uid}/notes/{noteId}

개인 AI 노트와 수동 메모입니다.

```json
{
  "id": "note_xxx",
  "type": "ai",
  "weekKey": "2026-W18",
  "weekLabel": "2026년 4/27 ~ 5/3",
  "content": {
    "summary": "이번 주 완료 업무 요약",
    "suggestions": ["다음 주 추천 액션 1", "다음 주 추천 액션 2", "다음 주 추천 액션 3"],
    "insight": "팀장 관점 인사이트"
  },
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

## 보안 원칙

- 로그인한 사용자만 접근 가능합니다.
- 팀원 문서가 있는 사용자만 팀 데이터를 읽을 수 있습니다.
- 개인 주간업무와 개인 노트는 본인만 읽고 씁니다.
- 팀 공유 스냅샷은 본인 문서만 쓸 수 있고 팀원은 읽을 수 있습니다.
- 액션플랜과 KPI는 팀원이 읽고 쓸 수 있는 초안 규칙입니다. 운영에서는 관리자 역할 기반으로 강화하는 것을 권장합니다.
