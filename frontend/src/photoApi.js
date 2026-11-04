import { apiBaseUrl, ApiError } from './artworkApi.js'
import { validatePhotoFile } from './artworkCreation.js'

function uploadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function uploadPhoto(file, visitorId, attempt, { signal } = {}) {
  const mediaType = validatePhotoFile(file)
  try {
    const response = await fetch(`${apiBaseUrl}/api/photo-uploads`, {
      method: 'POST', body: file, cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      headers: { 'Content-Type': mediaType, 'X-Visitor-ID': visitorId, 'X-Upload-ID': attempt.id,
        'X-Upload-Token': attempt.token, 'X-File-Name': encodeURIComponent(file.name) },
    })
    const data = await response.json()
    if (!response.ok) throw new ApiError(typeof data.detail === 'string' ? data.detail : '사진 업로드를 처리하지 못했습니다.', response.status)
    if (data.photo_token !== attempt.token || !Number.isFinite(data.expires_at) || data.size !== file.size || data.media_type !== mediaType) throw new Error('Unexpected photo response')
    return data
  } catch (error) {
    if (signal?.aborted) throw new ApiError('사진 업로드를 취소했습니다. 입력과 사진 선택은 유지됩니다.')
    if (error instanceof ApiError) throw error
    throw new ApiError('사진 업로드 결과를 확인하지 못했습니다. 입력과 사진 선택은 유지됩니다. 다시 기증하면 같은 업로드 번호로 확인합니다.')
  }
}

// Keep the same upload ID/token after a lost response. Never upload during preview.
export function createPhotoUploadSession(request = uploadPhoto) {
  let current = null
  return {
    async tokenFor(file, visitorId, options = {}) {
      validatePhotoFile(file)
      if (!current || current.file !== file || current.visitorId !== visitorId || current.expiresAt <= Date.now()) {
        current = { file, visitorId, id: crypto.randomUUID(), token: uploadToken(), expiresAt: Date.now() + 86400000, result: null }
      }
      const attempt = current
      if (!attempt.result) {
        try {
          if (!attempt.pending) attempt.pending = request(file, visitorId, attempt, options)
          attempt.result = await attempt.pending
        } finally { attempt.pending = null }
      }
      attempt.expiresAt = attempt.result.expires_at
      return attempt.result.photo_token
    },
  }
}
