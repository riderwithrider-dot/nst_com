// 한국어 검색 helper — 부분 일치 + 초성 일치 모두 지원
// 예: "전략파트너" → 부분 일치(전략, 파트너) + 초성(ㅈㄹㅍㅌㄴ, ㅈㄹ, ㅍㅌㄴ) 모두 매칭

const HANGUL_START = 0xAC00
const HANGUL_END = 0xD7A3
const CHOSUNGS = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ',
  'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ',
  'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]

// 한 글자가 한글 음절(완성형)이면 초성 추출, 아니면 그대로 반환
function toChosungChar(ch) {
  const code = ch.charCodeAt(0)
  if (code < HANGUL_START || code > HANGUL_END) return ch
  const idx = Math.floor((code - HANGUL_START) / 588)
  return CHOSUNGS[idx] || ch
}

// 문자열 → 초성 변환 (한글이 아닌 글자는 그대로)
export function toChosung(str) {
  if (!str) return ''
  return String(str).split('').map(toChosungChar).join('')
}

// query 가 모두 초성 자모(ㄱ, ㄴ, ㄷ ...)로만 이루어졌는지 — 초성 모드 판별용
export function isAllChosung(query) {
  if (!query) return false
  const set = new Set(CHOSUNGS)
  return query.split('').every(ch => set.has(ch))
}

// haystack 안에 query 가 있는지 — 부분 일치 OR 초성 일치
// haystack과 query는 보통 toLowerCase 처리된 문자열을 받음
export function searchMatch(haystack, query) {
  if (!query) return true
  if (!haystack) return false
  const q = query.trim()
  if (!q) return true
  // 1. 일반 부분 일치 (가장 일반적)
  if (haystack.includes(q)) return true
  // 2. 초성 검색 — query 가 모두 초성이면 haystack의 초성 변환과 비교
  if (isAllChosung(q)) {
    const haystackChosung = toChosung(haystack)
    if (haystackChosung.includes(q)) return true
  }
  return false
}
