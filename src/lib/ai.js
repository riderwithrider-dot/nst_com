export async function requestGemini(mode, payload) {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, payload }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('AI API가 연결되지 않았습니다. 로컬 테스트는 npm run dev 대신 npm run dev:vercel로 실행해주세요.')
    }
    throw new Error(body.error || 'AI 요청에 실패했습니다.')
  }
  return body
}
