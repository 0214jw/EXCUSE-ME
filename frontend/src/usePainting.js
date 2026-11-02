import { useEffect, useReducer, useRef, useState } from 'react'
import { createRequestId, getVisitorId } from './visitor.js'
import { requestPainting } from './paintingApi.js'
import { initialPaintingState, paintingInput, paintingInputError, paintingReady, paintingReducer } from './paintingState.js'

export default function usePainting(values, curator) {
  const [style, setStyle] = useState('watercolor')
  const [state, dispatch] = useReducer(paintingReducer, initialPaintingState)
  const [clock, setClock] = useState(Date.now())
  const busy = useRef(false)
  const mounted = useRef(true)
  const description = curator.state.confirmed ? curator.state.description.trim() : null
  const input = paintingInput(values, description, style)
  const fingerprint = JSON.stringify(input)
  useEffect(() => { dispatch({ type: 'invalidate' }) }, [fingerprint])
  useEffect(() => {
    mounted.current = true
    const timer = setInterval(() => setClock(Date.now()), 15000)
    return () => { mounted.current = false; clearInterval(timer) }
  }, [])

  async function generate() {
    if (busy.current || curator.state.status === 'loading') return
    const error = paintingInputError(values, curator.state.description, curator.state.confirmed)
    if (error) { dispatch({ type: 'error', message: error }); return }
    busy.current = true
    dispatch({ type: 'start' })
    try {
      const result = await requestPainting({ ...input, visitor_id: getVisitorId(), request_id: createRequestId() })
      if (mounted.current) dispatch({ type: 'success', result, snapshot: fingerprint })
    } catch (error) {
      if (mounted.current) dispatch({ type: 'error', message: error.message })
    } finally { busy.current = false }
  }
  return { state, input, style, setStyle, generate, dispatch,
    ready: paintingReady(state, input, clock),
    stale: Boolean(state.result && state.snapshot !== fingerprint),
    expired: Boolean(state.result && state.result.expires_at * 1000 <= clock) }
}
