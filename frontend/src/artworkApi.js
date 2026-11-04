export const apiBaseUrl = (import.meta.env?.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:8000').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status = 0, fields = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export async function artworkRequest(path, payload, options = {}) {
  const method = options.method || (payload !== undefined ? 'POST' : 'GET')
  const saving = method !== 'GET'
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.visitorId ? { 'X-Visitor-ID': options.visitorId } : {}) },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    })
    const data = response.status === 204 ? null : await response.json()
    const cleanupPending = response.headers?.get?.('X-Photo-Cleanup') === 'pending'
    if (!response.ok) {
      throw new ApiError(typeof data.detail === 'string' ? data.detail : '요청을 처리할 수 없습니다.', response.status, data.errors || {})
    }
    if (method === 'DELETE') {
      if (response.status !== 204) throw new Error('Unexpected deletion response')
      return cleanupPending ? { photo_cleanup_pending: true } : null
    }
    // Only the random endpoint uses a successful null for an empty exhibition.
    if (!saving && path.split('?')[0] === '/api/artworks/random' && data === null) return null
    const validArtwork = (item) => item && Number.isInteger(item.id) && item.id > 0 &&
      ['title', 'content', 'category', 'author', 'created_at', 'updated_at'].every((key) => typeof item[key] === 'string') &&
      ['refined_description', 'image_url', 'image_style'].every((key) => item[key] == null || typeof item[key] === 'string') &&
      (item.image_mode == null || ['generated', 'photo'].includes(item.image_mode)) &&
      (item.can_manage == null || typeof item.can_manage === 'boolean') &&
      (item.artwork_type == null || ['text', 'photo', 'generated'].includes(item.artwork_type)) &&
      (item.recognition_count == null || (Number.isSafeInteger(item.recognition_count) && item.recognition_count >= 0)) &&
      (item.recognized_by_me == null || typeof item.recognized_by_me === 'boolean')
    const expectingList = !saving && ['/api/artworks', '/api/hall-of-fame'].includes(path.split('?')[0])
    if (expectingList ? !Array.isArray(data) || !data.every(validArtwork) : !validArtwork(data)) {
      throw new Error('Unexpected response')
    }
    return cleanupPending ? { ...data, photo_cleanup_pending: true } : data
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw error
    const message = method === 'PUT'
      ? '수정 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 작품 상세에서 실제 저장 결과를 확인한 뒤 다시 시도해 주세요.'
      : method === 'DELETE'
      ? '삭제 결과를 확인하지 못했습니다. 이미 삭제되었을 수도 있으니 전시관에서 확인해 주세요. 자동 재시도하지 않습니다.'
      : saving
      ? '저장 결과를 확인하지 못했습니다. 이미 저장되었을 수도 있습니다. 입력을 유지한 채 다시 기증하면 같은 요청의 중복 저장을 방지합니다. 전시관에서도 확인할 수 있습니다.'
      : '작품을 불러오지 못했습니다. 서버 연결을 확인한 뒤 다시 시도해 주세요.'
    throw new ApiError(message, error.status || 0)
  }
}
