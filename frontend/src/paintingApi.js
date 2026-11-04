import { apiBaseUrl, ApiError } from './artworkApi.js'
import { serverMessage } from './apiMessages.js'

export async function requestPainting(payload) {
  try {
    const response = await fetch(`${apiBaseUrl}/api/image-generations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(150000), cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok) throw new ApiError(serverMessage(response.status, 'painting'), response.status)
    if (!/^[A-Za-z0-9_-]{43}$/.test(data.image_token) ||
        typeof data.preview_data_url !== 'string' || data.preview_data_url.length > 17 * 1024 * 1024 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.preview_data_url) ||
        !Number.isFinite(data.expires_at)) throw new Error('Invalid image response')
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(error.name === 'TimeoutError'
      ? '이미지 응답 대기 시간이 지났습니다. 비용이 발생했을 수 있으므로 사용량을 확인하세요. 자동 재시도하지 않습니다.'
      : '이미지 결과를 받지 못했습니다. 입력은 유지됩니다. 자동 재시도하지 않으며 텍스트 기증은 가능합니다.')
  }
}
