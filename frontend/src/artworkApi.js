const apiBaseUrl = (import.meta.env?.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:8000').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status = 0, fields = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export async function artworkRequest(path, payload) {
  const saving = payload !== undefined
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: saving ? 'POST' : 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      ...(saving ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new ApiError(typeof data.detail === 'string' ? data.detail : '요청을 처리할 수 없습니다.', response.status, data.errors || {})
    }
    const validArtwork = (item) => item && Number.isInteger(item.id) && item.id > 0 &&
      ['title', 'content', 'category', 'author', 'created_at', 'updated_at'].every((key) => typeof item[key] === 'string') &&
      ['refined_description', 'image_url', 'image_style'].every((key) => item[key] == null || typeof item[key] === 'string') &&
      (item.image_mode == null || ['generated', 'photo'].includes(item.image_mode))
    const expectingList = !saving && path === '/api/artworks'
    if (expectingList ? !Array.isArray(data) || !data.every(validArtwork) : !validArtwork(data)) {
      throw new Error('Unexpected response')
    }
    return data
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw error
    const message = saving
      ? '저장 결과를 확인하지 못했습니다. 이미 저장되었을 수도 있습니다. 입력을 유지한 채 다시 기증하면 같은 요청의 중복 저장을 방지합니다. 전시관에서도 확인할 수 있습니다.'
      : '작품을 불러오지 못했습니다. 서버 연결을 확인한 뒤 다시 시도해 주세요.'
    throw new ApiError(message, error.status || 0)
  }
}
