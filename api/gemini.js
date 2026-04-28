const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash'

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function stripCodeFence(text) {
  return String(text || '').replace(/```json|```/g, '').trim()
}

function buildPrompt(mode, payload) {
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

  throw new Error('지원하지 않는 AI 요청입니다.')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'POST 요청만 지원합니다.' })
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    return json(res, 500, { error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' })
  }

  try {
    const { mode, payload } = req.body || {}
    const prompt = buildPrompt(mode, payload)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 900,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      return json(res, response.status, {
        error: errorBody.error?.message || `Gemini API 오류 ${response.status}`,
      })
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const parsed = JSON.parse(stripCodeFence(text))
    return json(res, 200, parsed)
  } catch (error) {
    return json(res, 500, { error: error.message || 'AI 분석 중 오류가 발생했습니다.' })
  }
}
