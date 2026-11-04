import { artworkRequest } from './artworkApi.js'

// One loader per mounted random page. No history replacement, write, or vote.
export function createRandomArtworkLoader(onChange, request = artworkRequest) {
  let state = { status: 'loading', data: null, error: null, pending: false }
  let busy = false
  let active = true
  const publish = (next) => { state = next; if (active) onChange(state) }

  return {
    async load() {
      if (busy || !active) return false
      busy = true
      const previousId = state.data?.id
      publish({ ...state, status: state.data ? 'success' : 'loading', pending: true, error: null })
      try {
        const path = '/api/artworks/random' + (previousId ? `?exclude_id=${previousId}` : '')
        const data = await request(path)
        if (active) publish({ status: 'success', data, error: null, pending: false })
      } catch (error) {
        if (active) publish({ ...state, status: 'error', error, pending: false })
      } finally { busy = false }
      return true
    },
    dispose() { active = false },
  }
}
