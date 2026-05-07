export function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export function weekKeyToLabel(weekKey) {
  if (!weekKey) return ''
  const [year, week] = weekKey.split('-W')
  const weekNum = Number(week)
  const jan4 = new Date(Number(year), 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const monday = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000 + (weekNum - 1) * 7 * 86400000)
  const friday = new Date(monday.getTime() + 4 * 86400000)
  const fmt = date => `${date.getMonth() + 1}/${date.getDate()}`
  return `${year}년 ${fmt(monday)} ~ ${fmt(friday)}`
}

export function formatDate(value) {
  if (!value) return '미정'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function daysUntil(value) {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(value)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target - today) / 86400000)
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// 주어진 weekKey의 직전 주차 key 반환 (예: '2026-W19' → '2026-W18')
// 연도 경계는 단순 처리 (W01 → 전년 W52). 53주 케이스 무시.
export function getPrevWeekKey(weekKey) {
  if (!weekKey) return null
  const [yearStr, weekStr] = weekKey.split('-W')
  const year = Number(yearStr)
  const week = Number(weekStr)
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null
  if (week > 1) return `${year}-W${String(week - 1).padStart(2, '0')}`
  return `${year - 1}-W52`
}

// 정기 반복 주기에 따라 "이번 주차의 직전 발생 주차"를 계산
// weekly: 1주 전, monthly: 4주 전(근사), quarterly: 13주 전(근사)
export function getRecurrencePrevKey(weekKey, type) {
  if (!weekKey || !type) return null
  let key = weekKey
  const offsets = { weekly: 1, monthly: 4, quarterly: 13 }
  const offset = offsets[type] || 0
  for (let i = 0; i < offset; i += 1) {
    key = getPrevWeekKey(key)
    if (!key) return null
  }
  return key
}
