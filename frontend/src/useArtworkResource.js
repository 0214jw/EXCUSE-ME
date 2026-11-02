import { useEffect, useState } from 'react'
import { artworkRequest } from './artworkApi.js'

export default function useArtworkResource(path) {
  const [attempt, setAttempt] = useState(0)
  const [resource, setResource] = useState({ path, status: 'loading', data: null, error: null })
  useEffect(() => {
    let active = true
    setResource({ path, status: 'loading', data: null, error: null })
    artworkRequest(path).then(
      (data) => { if (active) setResource({ path, status: 'success', data, error: null }) },
      (error) => { if (active) setResource({ path, status: 'error', data: null, error }) },
    )
    return () => { active = false }
  }, [path, attempt])
  const current = resource.path === path ? resource : { status: 'loading', data: null, error: null }
  return { ...current, reload: () => setAttempt((value) => value + 1) }
}
