import { apiBaseUrl, ApiError } from './artworkApi.js'
import { characterCount } from './artworkRules.js'

export async function requestCurator(payload) {
  try {
    const response = await fetch(`${apiBaseUrl}/api/curator`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30000), cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok) throw new ApiError(typeof data.detail === 'string' ? data.detail : 'AI 추천 요청을 처리하지 못했습니다.', response.status)
    if (!Array.isArray(data.titles) || data.titles.length !== 3 ||
        !data.titles.every((title) => typeof title === 'string' && characterCount(title.trim()) >= 2 && characterCount(title.trim()) <= 50) ||
        new Set(data.titles.map((title) => title.trim())).size !== 3 ||
        typeof data.refined_description !== 'string' || !data.refined_description.trim() || characterCount(data.refined_description) > 1000) {
      throw new Error('Invalid curator response')
    }
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(error.name === 'TimeoutError'
      ? 'AI 응답 대기 시간이 지났습니다. 자동 재시도하지 않습니다. 작성한 내용으로 텍스트 기증은 가능합니다.'
      : 'AI 추천 결과를 받지 못했습니다. 작성 내용은 유지됩니다. 추천 없이 텍스트 작품을 기증할 수 있습니다.')
  }
}
