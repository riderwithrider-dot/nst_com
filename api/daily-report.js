import crypto from 'node:crypto'
import { generateGeminiJson, json } from './gemini.js'

const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  }
  return {
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    project_id: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  }
}

async function getAccessToken() {
  const account = getServiceAccount()
  if (!account.client_email || !account.private_key) {
    throw new Error('Firebase 서비스 계정 환경변수가 필요합니다.')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: FIRESTORE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claim}`
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key)
  const assertion = `${unsigned}.${base64url(signature)}`

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(body.error_description || body.error || 'Google 인증 토큰 발급 실패')
  }
  return body.access_token
}

function decodeValue(value) {
  if (!value) return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {})
  return null
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]))
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } }
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } }
  return { stringValue: String(value) }
}

function encodeFields(data) {
  return Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, encodeValue(value)]))
}

function getKstDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

function getWeekKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function weekKeyToLabel(weekKey) {
  const [year, week] = weekKey.split('-W')
  const weekNum = Number(week)
  const jan4 = new Date(Number(year), 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const monday = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000 + (weekNum - 1) * 7 * 86400000)
  const friday = new Date(monday.getTime() + 4 * 86400000)
  return `${year}년 ${monday.getMonth() + 1}/${monday.getDate()} ~ ${friday.getMonth() + 1}/${friday.getDate()}`
}

function formatKoreanDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return `${year}년 ${month}/${day}`
}

async function firestoreRequest(path, options = {}) {
  const account = getServiceAccount()
  const projectId = account.project_id || process.env.VITE_FIREBASE_PROJECT_ID
  const token = await getAccessToken()
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error?.message || `Firestore API 오류 ${response.status}`)
  }
  return body
}

async function listDocs(path) {
  const body = await firestoreRequest(path)
  return (body.documents || []).map(doc => ({
    id: doc.name.split('/').pop(),
    ...decodeFields(doc.fields || {}),
  }))
}

async function saveDoc(path, data) {
  return firestoreRequest(path, {
    method: 'PATCH',
    body: JSON.stringify({ fields: encodeFields(data) }),
  })
}

function collectDailyProgressLogs(teamFeed, dateKey) {
  return teamFeed
    .flatMap(member => (member.items || []).flatMap(task => (task.progressLogs || [])
      .filter(log => log.dateKey === dateKey)
      .map(log => ({
        ...log,
        memberUid: member.uid,
        memberName: member.displayName,
        subteam: member.subteam,
        subteamLabel: member.subteamLabel,
        taskId: task.id,
        taskTitle: task.title,
        status: task.status,
        priority: task.priority,
        impact: task.impact,
        dueDate: task.dueDate,
      }))))
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'GET 또는 POST 요청만 지원합니다.' })
  }

  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization || ''
  const isCron = String(req.headers['user-agent'] || '').includes('vercel-cron')
  if (secret && !isCron && authHeader !== `Bearer ${secret}`) {
    return json(res, 401, { error: '인증되지 않은 요청입니다.' })
  }

  try {
    const teamId = process.env.VITE_DEFAULT_TEAM_ID || 'commerce'
    const dateKey = req.query?.date || getKstDate()
    const weekKey = getWeekKey(dateKey)
    const weekLabel = weekKeyToLabel(weekKey)
    const [teamFeed, actionItems, kpis] = await Promise.all([
      listDocs(`teams/${teamId}/weeks/${weekKey}/shared`),
      listDocs(`teams/${teamId}/actionItems`),
      listDocs(`teams/${teamId}/kpis`),
    ])
    const progressLogs = collectDailyProgressLogs(teamFeed, dateKey)
    const result = await generateGeminiJson('dailyReport', {
      dateKey,
      dateLabel: formatKoreanDate(dateKey),
      weekLabel,
      progressLogs,
      actionItems,
      kpis,
    }, { maxOutputTokens: 1400 })

    const report = {
      ...result,
      dateKey,
      dateLabel: formatKoreanDate(dateKey),
      weekKey,
      weekLabel,
      progressCount: progressLogs.length,
      source: 'cron',
      generatedAt: new Date().toISOString(),
    }
    await saveDoc(`teams/${teamId}/reports/daily-${dateKey}`, report)
    return json(res, 200, { ok: true, reportId: `daily-${dateKey}`, progressCount: progressLogs.length })
  } catch (error) {
    return json(res, 500, { error: error.message || '일일 보고서 생성에 실패했습니다.' })
  }
}
