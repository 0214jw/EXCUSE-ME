const visitorKey = 'excuse-me.visitor-id'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Read without creating or replacing an ID while deciding which controls to show.
export function readVisitorId() {
  try {
    const id = localStorage.getItem(visitorKey)
    return id && uuidPattern.test(id) ? id.toLowerCase() : null
  } catch { return null }
}

export function createRequestId() {
  return crypto.randomUUID()
}

// Demo ID only: localStorage is client-controlled and is NOT authentication.
// Never use possession of this ID as authorization for security-sensitive operations.
export function getVisitorId() {
  try {
    const existing = localStorage.getItem(visitorKey)
    if (existing && uuidPattern.test(existing)) return existing
    const id = createRequestId()
    localStorage.setItem(visitorKey, id)
    if (localStorage.getItem(visitorKey) !== id) throw new Error('Storage unavailable')
    return id
  } catch {
    throw new Error('방문객 정보를 저장할 수 없습니다. 브라우저의 사이트 저장소를 허용한 뒤 다시 시도해 주세요. 입력 내용은 그대로 유지됩니다.')
  }
}
