import { apiBaseUrl } from './artworkApi.js'

// Presentation only: stable across filters, sorting, and page reloads.
export function artworkPosterTone(artwork) {
  const tones = ['wine', 'paper', 'ink']
  if (Number.isSafeInteger(artwork.id) && artwork.id > 0) return tones[(artwork.id - 1) % tones.length]
  const categoryHash = Array.from(artwork.category || '').reduce((hash, character) => (hash * 31 + character.codePointAt(0)) >>> 0, 0)
  return tones[categoryHash % tones.length]
}

export function artworkPosterExcerpt(content) {
  const original = typeof content === 'string' ? content.trim() : ''
  const sentence = original.match(/^[\s\S]*?[.!?。！？](?=\s|$)/u)?.[0] || original.split(/\r?\n/u).find(line => line.trim()) || ''
  const characters = Array.from(sentence.replace(/\s+/gu, ' ').trim())
  return characters.length > 120 ? `${characters.slice(0, 119).join('')}…` : characters.join('')
}

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
  if (/^\/api\/artworks\/[1-9]\d*\/image$/.test(value)) return `${apiBaseUrl}${value}`
  if (!rootRelative && !/^https?:\/\//i.test(value)) return null
  try {
    const url = new URL(value, 'https://excuse-me.invalid')
    return ['https:', 'http:'].includes(url.protocol) ? value : null
  } catch {
    return null
  }
}
