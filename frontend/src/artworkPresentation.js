// Presentation fallback only: never overwrite the donated original or save this
// template as an AI result. Later server-generated copy belongs in refined_description.
export function artworkDescription(artwork) {
  const refined = artwork.refined_description?.trim()
  return {
    text: refined || `일상에서 건져 올린 작은 사정이 하나의 작품이 되었습니다.\n\n${artwork.content}`,
    temporary: !refined,
  }
}

export function artworkImageUrl(artwork) {
  const value = artwork.image_url?.trim()
  if (!value) return null
  // Accept future served media paths or HTTP(S) URLs; never embed executable URLs.
  if (/[\\\u0000-\u0020]/u.test(value)) return null
  const rootRelative = value.startsWith('/') && !value.startsWith('//')
  if (!rootRelative && !/^https?:\/\//i.test(value)) return null
  try {
    const url = new URL(value, 'https://excuse-me.invalid')
    return ['https:', 'http:'].includes(url.protocol) ? value : null
  } catch {
    return null
  }
}
