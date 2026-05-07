import { existsSync, readFileSync } from 'node:fs'

function loadLocalEnv() {
  if (process.env.GEMINI_API_KEY) return

  try {
    if (!existsSync('.env.local')) return

    const lines = readFileSync('.env.local', 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue

      const [key, ...valueParts] = trimmed.split('=')
      if (!process.env[key]) {
        process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    // Vercel production uses real environment variables; local env loading is best effort only.
  }
}

loadLocalEnv()

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
const RETRYABLE_GEMINI_STATUSES = new Set([404, 429, 500, 503])

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function stripCodeFence(text) {
  return String(text || '').replace(/```json|```/g, '').trim()
}

function getMaxOutputTokens(mode) {
  if (mode === 'dailyReport') return 3200
  if (mode === 'teamReport') return 1800
  if (mode === 'weeklyRetro') return 800
  return 1200
}

function parseGeminiJson(text) {
  const cleaned = stripCodeFence(text)
  try {
    return JSON.parse(cleaned)
  } catch (error) {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1))
    }
    throw error
  }
}

export function buildPrompt(mode, payload) {
  const safePayload = payload || {}

  if (mode === 'personal') {
    const tasks = safePayload.completedTasks || []
    return `당신은 NST BIO 커머스팀의 주간업무 PM 어시스턴트입니다.
아래 개인 완료 업무를 분석해 다음 주 실행 제안 3가지를 생성하세요.

사용자: ${safePayload.userName || '팀원'}
주차: ${safePayload.weekLabel || ''}
완료 업무:
${tasks.map((task, index) => `${index + 1}. ${task.title} / 상태:${task.status || 'done'} / 우선순위:${task.priority || 'normal'} / 성과연결:${task.impact || '미입력'}`).join('\n')}

반드시 아래 JSON만 응답하세요.
{
  "summary": "2문장 이내 요약",
  "suggestions": ["다음 주 추천 액션 1", "다음 주 추천 액션 2", "다음 주 추천 액션 3"],
  "insight": "팀장 관점에서 볼 한 줄 인사이트"
}`
  }

  if (mode === 'teamReport') {
    const members = safePayload.teamFeed || []
    const actions = safePayload.actionItems || []
    const kpis = safePayload.kpis || []

    return `당신은 커머스팀 팀장에게 보고 초안을 만들어주는 PM입니다.
팀 공유 업무, 대표님 지시사항, KPI를 종합해서 이번 주 보고 초안을 작성하세요.

주차: ${safePayload.weekLabel || ''}

팀 공유 업무:
${members.map(member => {
  const items = (member.items || []).map(item => `- ${item.title} / ${item.status} / ${item.priority || 'normal'} / ${item.blocker || ''}`).join('\n')
  return `[${member.displayName || member.uid}]\n${items}`
}).join('\n\n')}

대표님 지시사항:
${actions.map(item => `- ${item.title} / ${item.status || (item.done ? 'done' : 'todo')} / ${item.assignee || ''} / ${item.dueDate || item.deadline || ''}`).join('\n')}

KPI:
${kpis.map(kpi => `- ${kpi.label}: ${kpi.current}${kpi.unit || ''} / 목표 ${kpi.target}${kpi.unit || ''}`).join('\n')}

반드시 아래 JSON만 응답하세요.
{
  "headline": "이번 주 상황을 한 문장으로 요약",
  "completed": ["완료 또는 진전된 내용 1", "완료 또는 진전된 내용 2", "완료 또는 진전된 내용 3"],
  "risks": ["지연/리스크/의사결정 필요사항 1", "지연/리스크/의사결정 필요사항 2"],
  "nextActions": ["다음 주 핵심 액션 1", "다음 주 핵심 액션 2", "다음 주 핵심 액션 3"],
  "executiveBrief": "대표님/본부장님께 바로 공유 가능한 5문장 이내 보고문"
}`
  }

  if (mode === 'dailyReport') {
    const progressLogs = safePayload.progressLogs || []
    const actions = safePayload.actionItems || []
    const kpis = safePayload.kpis || []

    return `당신은 NST BIO 마케팅본부 커머스 PM입니다.
오늘 팀원들이 각 업무에 기록한 "오늘 진행내용"을 바탕으로 2종의 일일 보고서를 작성하세요.

날짜: ${safePayload.dateLabel || safePayload.dateKey || ''}
주차: ${safePayload.weekLabel || ''}

오늘 진행내용:
${progressLogs.map((log, index) => `${index + 1}. [${log.memberName || '담당자'} / ${log.subteamLabel || '팀 미지정'}] ${log.taskTitle || '업무명 없음'}: ${log.text || '텍스트 없음'} / 입력시간:${log.createdAt || '미입력'} / KPI:${log.impact || '미연결'} / 상태:${log.status || '미입력'} / 우선순위:${log.priority || 'normal'}`).join('\n')}

진행 프로젝트:
${actions.map(item => `- ${item.title} / ${item.status || (item.done ? 'done' : 'todo')} / 담당:${item.assignee || item.subteamLabel || ''} / 마감:${item.dueDate || '미정'} / KPI:${item.kpi || item.impact || '미연결'}`).join('\n')}

KPI:
${kpis.map(kpi => `- ${kpi.label}: ${kpi.current}${kpi.unit || ''} / 목표 ${kpi.target}${kpi.unit || ''}`).join('\n')}

작성 기준:
- "PM 피드백 리포트"는 팀장이 다음 액션을 판단하도록 날카롭게 피드백합니다.
- "일일 업무보고 요약"은 본부장/대표님께 바로 공유 가능한 업무보고 문장으로 씁니다.
- "본부장 이메일 초안"은 사용자가 준 예시처럼 인사말, 날짜, 오전/오후 시간대별 업무, 끝맺음까지 포함합니다.
- "AI 누적관리 원장"은 다음날 AI가 이어서 관리할 수 있도록 업무별 사실 데이터를 구조화합니다.
- AI 원장은 예쁜 문장이 아니라 검색/누적/비교 가능한 데이터여야 합니다. 업무명, 담당, 상태 변화, 오늘 진척, 결정사항, 막힌 점, 다음 액션, 필요한 입력값을 분리하세요.
- 입력시간이 있으면 오전(09:00~11:30), 오후1(12:30~18:00) 안에 자연스럽게 배치하고, 시간이 부족하면 업무 흐름상 적절한 시간대를 추정하세요.
- 오늘 진행내용이 부족하면 부족하다고 쓰고, 내일 무엇을 입력해야 하는지 제안합니다.
- 과장하지 말고 기록된 내용 기반으로 작성하세요.

반드시 아래 JSON만 응답하세요.
{
  "feedbackReport": {
    "headline": "오늘 업무 흐름을 한 문장으로 진단",
    "coreProgress": ["핵심 진행 1", "핵심 진행 2", "핵심 진행 3"],
    "risks": ["리스크 또는 비어있는 부분 1", "리스크 또는 비어있는 부분 2"],
    "developmentAdvice": ["내일/다음 단계 제안 1", "내일/다음 단계 제안 2", "팀장이 확인할 포인트"],
    "pmComment": "팀장 관점의 종합 피드백 3문장 이내"
  },
  "dailySummary": {
    "title": "일일 업무보고 제목",
    "summaryBullets": ["보고용 요약 1", "보고용 요약 2", "보고용 요약 3"],
    "completedOrProgress": "오늘 진척된 내용을 2~4문장으로 정리",
    "issuesAndNeeds": "이슈/지원필요/의사결정 필요사항. 없으면 '특이사항 없음'",
    "tomorrowPlan": "내일 이어갈 업무를 2~3문장으로 정리",
    "executiveText": "본부장/대표님께 그대로 공유 가능한 5문장 이내 보고문"
  },
  "aiManagement": {
    "dailyDigest": "오늘 누적관리 관점의 한 문장 요약",
    "taskLedger": [
      {
        "taskTitle": "업무명",
        "owner": "담당자",
        "category": "KPI 또는 업무분류",
        "status": "대기/진행/검토/막힘/완료/미입력",
        "progressToday": "오늘 실제로 진행된 사실",
        "decisionOrOutput": "결정사항 또는 산출물. 없으면 '미입력'",
        "riskOrBlocker": "리스크/막힌 점. 없으면 '없음'",
        "nextAction": "다음에 해야 할 구체 액션",
        "dueOrTiming": "마감/일정 정보",
        "dataQuality": "충분/보완필요/부족"
      }
    ],
    "missingInputs": ["AI가 누적관리하려면 추가 입력이 필요한 항목 1", "추가 입력 항목 2"],
    "tomorrowChecklist": ["내일 확인할 체크포인트 1", "내일 확인할 체크포인트 2", "내일 확인할 체크포인트 3"]
  },
  "emailDraft": {
    "subject": "[NST BIO] 일일업무보고 - YYYY년 M월 D일",
    "body": "안녕하세요. 본부장님\\n\\nM월 D일자 일일업무보고 송부드립니다.\\n\\n오전1 (09:00~11:30)\\n09:00~10:00 업무내용\\n\\n오후1 (12:30~18:00)\\n*12:30~13:30 업무내용\\n*13:30~15:00 업무내용\\n\\n끝.\\n\\n감사합니다."
  }
}`
  }

  if (mode === 'weeklyRetro') {
    const stats = safePayload.stats || {}
    const bySubteam = safePayload.bySubteam || []
    const byKpi = safePayload.byKpi || []
    const carryOver = safePayload.carryOverTitles || []
    const previousStats = safePayload.previousStats || null
    return `당신은 NST BIO 마케팅본부 커머스 PM입니다.
이번 주 회고 데이터를 보고 본부장에게 공유 가능한 짧은 인사이트 한 단락(2~3문장)을 만드세요.

주차: ${safePayload.weekLabel || ''}
이번 주: 완료 ${stats.completed ?? 0}건 · 지연 ${stats.delayed ?? 0}건 · 신규 ${stats.created ?? 0}건 · 진척률 ${stats.progress ?? 0}%
${previousStats ? `이전 주: 완료 ${previousStats.completed ?? 0}건 · 지연 ${previousStats.delayed ?? 0}건 · 진척률 ${previousStats.progress ?? 0}%` : ''}

부서별 진척률:
${bySubteam.map(s => `- ${s.label}: ${s.completed}/${s.total} (${s.pct}%)`).join('\n')}

KPI별 진척률 (Top):
${byKpi.map(k => `- ${k.label}: ${k.completed}/${k.total} (${k.pct}%)`).join('\n')}

다음 주 carry-over 후보:
${carryOver.map(t => `- ${t}`).join('\n')}

기준:
- 데이터 기반으로만 작성. 과장 금지.
- 평소 대비 변화(증가/감소)가 있다면 명시.
- 어느 부서/KPI를 가장 주의해서 봐야 할지 한 가지 짚어주세요.

반드시 아래 JSON만 응답하세요.
{
  "headline": "이번 주를 한 문장으로 요약",
  "insight": "본부장 관점 인사이트 2~3문장",
  "recommendation": "다음 주에 가장 먼저 확인해야 할 액션 한 줄"
}`
  }

  throw new Error('지원하지 않는 AI 요청입니다.')
}

export async function generateGeminiJson(mode, payload, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')
  }

  const prompt = buildPrompt(mode, payload)
  const models = [MODEL, ...FALLBACK_MODELS].filter((model, index, arr) => model && arr.indexOf(model) === index)
  let lastError = null

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.35,
            maxOutputTokens: options.maxOutputTokens ?? 1200,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      lastError = new Error(errorBody.error?.message || `Gemini API 오류 ${response.status}`)
      if (RETRYABLE_GEMINI_STATUSES.has(response.status)) continue
      throw lastError
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    try {
      return parseGeminiJson(text)
    } catch (error) {
      lastError = new Error('AI 응답이 중간에 잘렸습니다. 다시 생성해주세요.')
      continue
    }
  }

  throw lastError || new Error('사용 가능한 Gemini Flash 모델을 찾지 못했습니다.')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'POST 요청만 지원합니다.' })
  }

  try {
    const { mode, payload } = req.body || {}
    const parsed = await generateGeminiJson(mode, payload, { maxOutputTokens: getMaxOutputTokens(mode) })
    return json(res, 200, parsed)
  } catch (error) {
    return json(res, 500, { error: error.message || 'AI 분석 중 오류가 발생했습니다.' })
  }
}
