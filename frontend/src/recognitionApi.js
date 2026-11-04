import { apiBaseUrl, ApiError, artworkRequest } from './artworkApi.js'

export function recognitionValue(data, artworkId) {
  if (!data || data.artwork_id !== artworkId || !Number.isSafeInteger(data.recognition_count) ||
      data.recognition_count < 0 || typeof data.recognized_by_me !== 'boolean') {
    throw new ApiError('좋아요 상태를 확인하지 못했습니다. 최신 상태를 다시 불러와 주세요.')
  }
  return { recognition_count: data.recognition_count, recognized_by_me: data.recognized_by_me }
}

export async function loadRecognition(artworkId, visitorId) {
  const artwork = await artworkRequest(`/api/artworks/${artworkId}`, undefined, { visitorId })
  return recognitionValue({ ...artwork, artwork_id: artwork.id }, artworkId)
}

export async function requestRecognition(artworkId, visitorId, recognized) {
  try {
    const response = await fetch(`${apiBaseUrl}/api/artworks/${artworkId}/recognition`, {
      method: recognized ? 'PUT' : 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_id: visitorId }), signal: AbortSignal.timeout(8000), cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok) throw new ApiError(typeof data.detail === 'string' ? data.detail : '좋아요 요청을 처리하지 못했습니다.', response.status)
    return recognitionValue(data, artworkId)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('좋아요 요청 결과를 확인하지 못했습니다. 서버의 현재 상태를 확인합니다.')
  }
}

// Never retry a write or guess +/-1. A lost response may already have committed.
export async function changeRecognition(artworkId, visitorId, recognized) {
  try { return { value: await requestRecognition(artworkId, visitorId, recognized), error: '' } }
  catch (failure) {
    try {
      return { value: await loadRecognition(artworkId, visitorId),
        error: `${failure.message} 서버의 현재 상태를 다시 불러왔습니다.` }
    } catch (readFailure) {
      return { value: null, error: readFailure.status === 404
        ? '작품이 없거나 이미 삭제되어 좋아요 상태를 확인할 수 없습니다.'
        : '좋아요 상태를 확인할 수 없습니다. 상태를 다시 불러오기 전까지 추가 좋아요 요청을 중단합니다.' }
    }
  }
}
