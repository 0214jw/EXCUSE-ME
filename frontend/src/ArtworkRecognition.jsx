import { useEffect, useRef, useState } from 'react'
import { readVisitorId } from './visitor.js'
import { changeRecognition, loadRecognition, recognitionValue } from './recognitionApi.js'
import './Recognition.css'

export default function ArtworkRecognition({ artwork, visitorId }) {
  const [state, setState] = useState(() => {
    try { return { value: recognitionValue({ ...artwork, artwork_id: artwork.id }, artwork.id), pending: false, error: '' } }
    catch (error) { return { value: null, pending: false, error: error.message } }
  })
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const identityMatches = Boolean(visitorId) && readVisitorId() === visitorId

  async function update(refreshOnly = false) {
    if (busy.current) return
    if (!visitorId || readVisitorId() !== visitorId) {
      setState((current) => ({ ...current, value: null, error: '방문객 정보가 변경되었거나 저장소를 사용할 수 없습니다. 페이지를 다시 열어 주세요.' }))
      return
    }
    if (!refreshOnly && !state.value) return
    busy.current = true
    setState((current) => ({ ...current, pending: true, error: '' }))
    try {
      const outcome = refreshOnly
        ? { value: await loadRecognition(artwork.id, visitorId), error: '' }
        : await changeRecognition(artwork.id, visitorId, !state.value.recognized_by_me)
      if (mounted.current) {
        setState(readVisitorId() === visitorId ? { ...outcome, pending: false }
          : { value: null, pending: false, error: '방문객 정보가 변경되었습니다. 페이지를 다시 열어 주세요.' })
      }
    } catch (error) {
      if (mounted.current) setState({ value: null, pending: false, error: error.message })
    } finally { busy.current = false }
  }

  const recognized = identityMatches && state.value?.recognized_by_me
  return (
    <section className="recognition-panel" aria-label="좋아요">
      <div className="recognition-control">
        <button className="like-button" type="button" aria-label={recognized ? '좋아요 취소' : '좋아요'}
          aria-describedby={`like-count-${artwork.id}`} aria-busy={state.pending}
          aria-pressed={identityMatches && state.value ? state.value.recognized_by_me : undefined}
          disabled={state.pending || !identityMatches || !state.value} onClick={() => update()}>
          <svg className="like-icon" viewBox="0 0 32 32" width="32" height="32"
            fill={recognized ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M16 27.5C13.2 25.3 3.5 18.8 3.5 11.8C3.5 7.7 6.3 5 10 5C12.7 5 14.8 6.5 16 8.5C17.2 6.5 19.3 5 22 5C25.7 5 28.5 7.7 28.5 11.8C28.5 18.8 18.8 25.3 16 27.5Z" />
          </svg>
        </button>
        <p id={`like-count-${artwork.id}`} className="recognition-count" role="status" aria-live="polite">
          <span className="recognition-sr-only">좋아요 수 </span><strong>{state.value?.recognition_count ?? '—'}</strong>
        </p>
      </div>
      <p className="recognition-sr-only" role="status">{state.pending ? '좋아요 처리 중…' : ''}</p>
      <p className="visitor-note">브라우저별 데모 참여입니다. 같은 방문객 ID로 작품당 한 번 좋아요를 남길 수 있습니다.</p>
      {!identityMatches && <p className="field-error">방문객 저장소를 사용할 수 없거나 ID가 변경되었습니다. 저장소를 허용한 뒤 페이지를 다시 열어 주세요.</p>}
      {state.error && <div className="recognition-error" role="alert"><p>{state.error}</p>
        <button className="text-link" type="button" disabled={state.pending || !identityMatches} onClick={() => update(true)}>상태 다시 불러오기 ↗</button>
        <a className="text-link" href="/gallery">전시관으로 돌아가기 ↗</a>
      </div>}
    </section>
  )
}
