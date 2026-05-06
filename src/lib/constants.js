export const DEFAULT_TEAM_ID = import.meta.env.VITE_DEFAULT_TEAM_ID || 'commerce'

export const MANAGER_EMAILS = (import.meta.env.VITE_MANAGER_EMAILS || '')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean)

export function isManagerUser(user) {
  if (MANAGER_EMAILS.length === 0) return true
  return MANAGER_EMAILS.includes(String(user?.email || '').toLowerCase())
}

export const SUBTEAMS = [
  { id: 'commerce', label: '커머스' },
  { id: 'retail', label: '리테일' },
  { id: 'strategy_partner', label: '전략파트너' },
]

export const MEMBER_ROLES = [
  { id: 'member', label: '팀원' },
  { id: 'lead', label: '파트리더' },
  { id: 'manager', label: '관리자' },
]

export const JOB_TITLES = [
  '팀원',
  '파트리더',
  '팀장',
  '본부장',
  '관리자',
]

export const DEFAULT_POST_PERMISSIONS = {
  canCreateTask: true,
  canShareTask: true,
  canWriteProgress: true,
  canUploadImage: true,
  canComment: true,
  canReply: true,
  canUpdateTeamProject: false,
}

export const POST_PERMISSION_META = [
  { key: 'canCreateTask', label: '내 업무 작성' },
  { key: 'canShareTask', label: '팀 공유' },
  { key: 'canWriteProgress', label: '오늘 진행내용' },
  { key: 'canUploadImage', label: '이미지 첨부' },
  { key: 'canComment', label: '코멘트 작성' },
  { key: 'canReply', label: '답글 작성' },
  { key: 'canUpdateTeamProject', label: '팀 프로젝트 상태 변경' },
]

export function getSubteamLabel(subteamId) {
  return SUBTEAMS.find(team => team.id === subteamId)?.label || '팀 미선택'
}

export const STATUS_META = {
  todo: { label: '대기', tone: 'gray' },
  doing: { label: '진행', tone: 'blue' },
  review: { label: '검토', tone: 'amber' },
  blocked: { label: '보류', tone: 'red' },
  done: { label: '완료', tone: 'green' },
}

export const PRIORITY_META = {
  high: { label: '높음', tone: 'red' },
  normal: { label: '보통', tone: 'blue' },
  low: { label: '낮음', tone: 'gray' },
}

export const CATEGORY_META = {
  urgent: { label: '즉시', tone: 'red' },
  week: { label: '이번 주', tone: 'amber' },
  month: { label: '이번 달', tone: 'blue' },
  quarter: { label: '2분기', tone: 'green' },
  team: { label: '팀 업무', tone: 'teal' },
}

export const INITIAL_ACTION_ITEMS = [
  {
    id: 'action_profit_tool',
    sortOrder: 10,
    title: '채널별 손익 Tool 1차 완성',
    detail: '생엽 단위 원가에서 채널 마진을 자동 산출하고 AI 손익 리포트 기반을 준비합니다.',
    category: 'urgent',
    assignee: '전략파트너',
    subteam: 'strategy_partner',
    dueDate: '2026-04-30',
    status: 'todo',
    priority: 'high',
    kpi: '채널 손익 가시화',
    kpiLinks: [],
  },
  {
    id: 'action_lemon_forecast',
    sortOrder: 20,
    title: '레몬즙 Forecast 대표님 보고',
    detail: '월별 판매 계획 장표를 확정하고 연간 151,000세트 기준을 보고합니다.',
    category: 'urgent',
    assignee: '커머스',
    subteam: 'commerce',
    dueDate: '2026-04-30',
    status: 'todo',
    priority: 'high',
    kpi: '레몬즙 판매계획',
    kpiLinks: [],
  },
  {
    id: 'action_traders_research',
    sortOrder: 30,
    title: '트레이더스 시장조사 완성',
    detail: '제안가, 규격, 100g당 단가 비교표를 정리해 사전 보고합니다.',
    category: 'urgent',
    assignee: '리테일',
    subteam: 'retail',
    dueDate: '2026-04-30',
    status: 'todo',
    priority: 'high',
    kpi: '대형마트 입점 준비',
    kpiLinks: [],
  },
  {
    id: 'action_emart_strategy',
    sortOrder: 40,
    title: '이마트 영업전략 1차안 제출',
    detail: '리테일 입점 전략과 담당자 아젠다를 기반으로 1차안을 제출합니다.',
    category: 'week',
    assignee: '리테일',
    subteam: 'retail',
    dueDate: '2026-05-03',
    status: 'todo',
    priority: 'normal',
    kpi: '대형마트 입점 준비',
    kpiLinks: [],
  },
  {
    id: 'action_rr_guide',
    sortOrder: 50,
    title: 'R&R 예시 문서 제출',
    detail: '레몬즙 사례를 포함한 부서별 R&R과 전결 기준 예시를 정리합니다.',
    category: 'week',
    assignee: '전략파트너',
    subteam: 'strategy_partner',
    dueDate: '2026-05-03',
    status: 'todo',
    priority: 'normal',
    kpi: '조직 실행력',
    kpiLinks: [],
  },
  {
    id: 'action_owned_mall_meeting',
    sortOrder: 60,
    title: '자사몰 기획 내부 회의',
    detail: '공동구매 앱과 자사몰 파일럿 기획을 내부 회의에서 구체화합니다.',
    category: 'week',
    assignee: '커머스',
    subteam: 'commerce',
    dueDate: '2026-05-03',
    status: 'todo',
    priority: 'normal',
    kpi: '자사몰 성장',
    kpiLinks: [],
  },
  {
    id: 'action_approval_briefing',
    sortOrder: 70,
    title: '전사 전결 규정 설명회 완료',
    detail: '마케팅 파트 설명회 참석과 적용 범위를 정리합니다.',
    category: 'month',
    assignee: '전략파트너',
    subteam: 'strategy_partner',
    dueDate: '2026-05-31',
    status: 'todo',
    priority: 'normal',
    kpi: '조직 실행력',
    kpiLinks: [],
  },
  {
    id: 'action_all_sku_forecast',
    sortOrder: 80,
    title: '전 품목 채널별 Forecast',
    detail: '에사비와 레몬즙을 포함해 전 품목 3개월 단위 Forecast를 정례화합니다.',
    category: 'month',
    assignee: '커머스',
    subteam: 'commerce',
    dueDate: '2026-05-15',
    status: 'todo',
    priority: 'high',
    kpi: 'Forecast 정확도',
    kpiLinks: [],
  },
  {
    id: 'action_report_format',
    sortOrder: 90,
    title: '보고 포맷 심플화 전환',
    detail: '팩트 기반 장표로 전환하고 핵심 수치와 의사결정 포인트 중심으로 정리합니다.',
    category: 'month',
    assignee: '전략파트너',
    subteam: 'strategy_partner',
    dueDate: '2026-05-31',
    status: 'todo',
    priority: 'normal',
    kpi: '보고 리드타임',
    kpiLinks: [],
  },
  {
    id: 'action_emart_traders_listing',
    sortOrder: 100,
    title: '이마트·트레이더스 1개 입점',
    detail: '대형마트 채널 다변화를 위해 2분기 내 최소 1개 입점을 추진합니다.',
    category: 'quarter',
    assignee: '리테일',
    subteam: 'retail',
    dueDate: '2026-06-30',
    status: 'todo',
    priority: 'high',
    kpi: '신규 채널 수',
    kpiLinks: [],
  },
  {
    id: 'action_owned_mall_pilot',
    sortOrder: 110,
    title: '자사몰 파일럿 테스트 런',
    detail: '소규모 공동구매 실험과 결과 분석으로 직판 시스템 가능성을 검증합니다.',
    category: 'quarter',
    assignee: '커머스',
    subteam: 'commerce',
    dueDate: '2026-06-30',
    status: 'todo',
    priority: 'normal',
    kpi: '자사몰 성장',
    kpiLinks: [],
  },
  {
    id: 'action_independent_reporting',
    sortOrder: 120,
    title: '팀장 독립 보고 문화 정착',
    detail: '백데이터 자체 판단 구조를 만들고 팀장 단위 독립 보고 체계를 정착시킵니다.',
    category: 'quarter',
    assignee: '전략파트너',
    subteam: 'strategy_partner',
    dueDate: '2026-06-30',
    status: 'todo',
    priority: 'normal',
    kpi: '보고 리드타임',
    kpiLinks: [],
  },
]

export const INITIAL_KPIS = [
  {
    id: 'kpi_action_completion',
    sortOrder: 10,
    label: '진행 프로젝트 완료율',
    current: 0,
    target: 100,
    unit: '%',
    owner: '커머스팀',
    color: 'teal',
    autoComputed: false,
  },
  {
    id: 'kpi_lemon_sets',
    sortOrder: 20,
    label: '레몬즙 연간 판매계획',
    current: 16000,
    target: 151000,
    unit: '세트',
    owner: '커머스팀',
    color: 'green',
    autoComputed: false,
  },
  {
    id: 'kpi_owned_mall',
    sortOrder: 30,
    label: '자사몰 파일럿 준비율',
    current: 25,
    target: 100,
    unit: '%',
    owner: '커머스팀',
    color: 'blue',
    autoComputed: false,
  },
  {
    id: 'kpi_channel_profit',
    sortOrder: 40,
    label: '채널 손익 Tool 완성도',
    current: 35,
    target: 100,
    unit: '%',
    owner: '전략파트너',
    color: 'amber',
    autoComputed: false,
  },
]

export const CHANNEL_STRATEGIES = [
  {
    channel: '쿠팡',
    role: '전략채널',
    focus: '재고소진·한정 활용',
    rule: '상시 확대는 손익 기준 확인 후 판단',
    actions: ['한정 딜은 재고 소진 목적일 때만 승인', '상시 판매 전 채널 마진표 확인', '광고비 투입 시 ROAS 기준 동시 기록'],
    metrics: ['마진율', '재고소진율', 'ROAS'],
  },
  {
    channel: '자사몰·스마트스토어',
    role: '핵심육성',
    focus: '장기성장·고객 데이터 확보',
    rule: '공동구매 파일럿과 CRM 연결',
    actions: ['공동구매 테스트 상품 선정', '구매자 재구매 시나리오 기록', 'CRM 수집 항목과 혜택 구조 점검'],
    metrics: ['전환율', '재구매율', '객단가'],
  },
  {
    channel: '홈쇼핑',
    role: '손익중심',
    focus: '현금흐름과 마진 리포트',
    rule: '매출 증감보다 회차별 수익성 우선',
    actions: ['방송 회차별 공헌이익 산출', '반품률과 수수료 반영', '물량 확정 전 현금흐름 체크'],
    metrics: ['공헌이익', '반품률', '현금회수'],
  },
  {
    channel: '생협·타채널',
    role: '흐름관리',
    focus: '품목별 매출 흐름',
    rule: '마진율과 재고 회전 기준 판단',
    actions: ['품목별 월간 흐름표 업데이트', '채널별 SKU 유지/중단 판단', '저회전 품목 대체 채널 검토'],
    metrics: ['재고회전', 'SKU별 매출', '마진율'],
  },
]
