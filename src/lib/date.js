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
