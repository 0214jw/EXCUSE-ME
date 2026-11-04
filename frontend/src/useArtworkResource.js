import { useEffect, useRef, useState } from 'react'
import { artworkRequest } from './artworkApi.js'
import { getVisitorId } from './visitor.js'

export default function useArtworkResource(path) {
  const [attempt, setAttempt] = useState(0)
  const [resource, setResource] = useState({ path, status: 'loading', data: null, error: null })
  const busy = useRef(true)
  useEffect(() => {
    let active = true
    busy.current = true
    setResource({ path, status: 'loading', data: null, error: null })
    let visitorId = null
    if (/^\/api\/artworks\/\d+$/.test(path)) {
      try { visitorId = getVisitorId().toLowerCase() } catch { /* Public viewing remains available without storage. */ }
    }
    artworkRequest(path, undefined, { visitorId }).then(
      (data) => { if (active) { busy.current = false; setResource({ path, status: 'success', data, error: null, visitorId }) } },
      (error) => { if (active) { busy.current = false; setResource({ path, status: 'error', data: null, error }) } },
    )
    return () => { active = false }
  }, [path, attempt])
  useEffect(() => {
    const refreshIdentity = (event) => {
      if (event.key === null || event.key === 'excuse-me.visitor-id') setAttempt((value) => value + 1)
    }
    window.addEventListener('storage', refreshIdentity)
    return () => window.removeEventListener('storage', refreshIdentity)
  }, [])
  const current = resource.path === path ? resource : { status: 'loading', data: null, error: null }
  return { ...current, reload: () => {
    if (busy.current) return
    busy.current = true
    setResource({ path, status: 'loading', data: null, error: null })
    setAttempt((value) => value + 1)
  } }
}
