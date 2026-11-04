import { artworkRequest } from './artworkApi.js'
import { normalizeArtwork, validateArtwork, trimText, characterCount } from './artworkRules.js'
import { readVisitorId } from './visitor.js'

export function canManageArtwork(artwork, checkedVisitorId, currentVisitorId = readVisitorId()) {
  return artwork.can_manage === true && Boolean(checkedVisitorId) && checkedVisitorId === currentVisitorId
}

export function artworkEditValues(artwork) {
  return { title: artwork.title, content: artwork.content, category: artwork.category, author: artwork.author,
    refined_description: artwork.refined_description ?? '' }
}

export function validateArtworkEdit(values) {
  const errors = validateArtwork(values)
  if (characterCount(trimText(values.refined_description)) > 1000) errors.refined_description = '작품 설명은 1000자 이내로 입력해 주세요.'
  return errors
}

export function artworkEditPayload(values, visitorId, hasDescription) {
  return { ...normalizeArtwork(values), visitor_id: visitorId,
    ...(hasDescription ? { refined_description: trimText(values.refined_description) || null } : {}) }
}

export async function deleteArtworkAfterConfirmation(artwork, visitorId, {
  confirm = (message) => window.confirm(message),
  navigate = (path) => window.location.assign(path),
  notify = (message) => window.alert(message),
} = {}) {
  if (!canManageArtwork(artwork, visitorId)) throw new Error('방문객 정보가 변경되었습니다. 작품을 다시 열어 소유자 여부를 확인해 주세요.')
  if (!confirm(`‘${artwork.title}’ 작품을 삭제할까요? 삭제 후에는 복구할 수 없습니다.`)) return false
  if (!canManageArtwork(artwork, visitorId)) throw new Error('방문객 정보가 변경되어 삭제하지 않았습니다. 작품을 다시 열어 주세요.')
  const result = await artworkRequest(`/api/artworks/${artwork.id}`, { visitor_id: visitorId }, { method: 'DELETE' })
  if (result?.photo_cleanup_pending) notify('작품은 삭제되었습니다. 사진 파일 정리는 재시도 예정입니다.')
  navigate('/gallery')
  return true
}
