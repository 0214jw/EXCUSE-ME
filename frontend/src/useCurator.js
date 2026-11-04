import { useEffect, useReducer, useRef } from 'react'
import { createRequestId, getVisitorId } from './visitor.js'
import { requestCurator } from './curatorApi.js'
import { userMessage } from './artworkApi.js'
import { curatorInput, curatorInputError, curatorReducer, initialCuratorState } from './curatorState.js'

export default function useCurator(values) {
  const [state, dispatch] = useReducer(curatorReducer, initialCuratorState)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function generate() {
    if (busy.current) return
    const error = curatorInputError(values)
    if (error) { dispatch({ type: 'error', message: error }); return }
    const snapshot = curatorInput(values)
    busy.current = true
    dispatch({ type: 'start' })
    try {
      const result = await requestCurator({ ...snapshot, visitor_id: getVisitorId(), request_id: createRequestId() })
      if (mounted.current) dispatch({ type: 'success', result, snapshot })
    } catch (error) {
      if (mounted.current) dispatch({ type: 'error', message: userMessage(error, 'AI 추천을 준비하지 못했습니다. 입력은 유지됩니다. 추천 없이도 기증할 수 있습니다.') })
    } finally {
      busy.current = false
    }
  }

  return { state, generate, dispatch }
}
