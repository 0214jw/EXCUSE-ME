export const artworkCategories = ['지각·조퇴', '휴가·병가', '약속', '운동', '기타']
export const anonymousAuthor = '익명의 예술가'

// Count Unicode code points, as Python len does. A combined emoji may count as several.
export const characterCount = (value) => Array.from(value).length
export const trimText = (value) => value.replace(/^[\s\u0085\u001c-\u001f]+|[\s\u0085\u001c-\u001f]+$/gu, '')

export function normalizeArtwork(values) {
  return {
    title: trimText(values.title),
    content: trimText(values.content),
    category: values.category,
    author: trimText(values.author) || anonymousAuthor,
  }
}

export function validateArtwork(values) {
  const artwork = normalizeArtwork(values)
  const errors = {}
  if (characterCount(artwork.title) < 2 || characterCount(artwork.title) > 50) errors.title = '작품명은 2~50자로 입력해 주세요.'
  if (characterCount(artwork.content) < 10 || characterCount(artwork.content) > 300) errors.content = '핑계 내용은 10~300자로 입력해 주세요.'
  if (!artworkCategories.includes(artwork.category)) errors.category = '카테고리 한 가지를 선택해 주세요.'
  if (characterCount(artwork.author) > 20) errors.author = '작가명은 최대 20자로 입력해 주세요.'
  return errors
}

export function selectArtworks(artworks, category = '전체') {
  return artworks.filter((artwork) => category === '전체' || artwork.category === category)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
}
