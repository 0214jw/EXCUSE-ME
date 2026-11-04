import { useRef, useState } from 'react'
import { artworkCategories, characterCount, normalizeArtwork, selectArtworks, trimText, validateArtwork } from './artworkRules.js'
import { artworkRequest } from './artworkApi.js'
import { createRequestId, getVisitorId } from './visitor.js'
import useArtworkResource from './useArtworkResource.js'
import { SampleCollection } from './MuseumPages.jsx'
import ArtworkExhibition from './ArtworkExhibition.jsx'
import ArtworkCreation from './ArtworkCreation.jsx'
import { imageDonationBlockReason } from './artworkCreation.js'
import useCurator from './useCurator.js'
import { CuratorDescription, CuratorSuggestions } from './CuratorPanel.jsx'
import { curatorDonationFields } from './curatorState.js'
import usePainting from './usePainting.js'
import { paintingDonationFields } from './paintingState.js'
import ArtworkVisual from './ArtworkVisual.jsx'
import { ArtworkOwnerActions } from './ArtworkManagement.jsx'
import ArtworkRecognition from './ArtworkRecognition.jsx'

const filters = ['전체', ...artworkCategories]
const formatDate = (date) => new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Seoul',
}).format(new Date(date))

export function ResourceNotice({ resource }) {
  if (resource.status === 'loading') return <div className="collection-notice" role="status">작품을 전시실로 모셔오는 중입니다…</div>
  if (resource.status !== 'error') return null
  return (
    <div className="collection-notice error-notice" role="alert">
      <p>{resource.error.status === 404 ? '작품을 찾을 수 없습니다. 주소를 확인해 주세요.' : resource.error.message}</p>
      {resource.error.status !== 404 && <button className="text-link" type="button" onClick={resource.reload}>다시 불러오기 ↗</button>}
      <a className="text-link" href="/gallery">전시관으로 돌아가기 ↗</a>
    </div>
  )
}

export function LiveArtworkCard({ artwork, rank = null }) {
  return (
    <article className={`artwork-card${rank ? ` award-card${rank <= 3 ? ' award-card--laureate' : ''}` : ''}`} aria-labelledby={`collection-${artwork.id}`}>
      <a className="artwork-open" href={`/artworks/${artwork.id}`} aria-label={`${artwork.title} 감상하기`}>
        {rank && <span className="award-rank"><strong>{rank}위</strong><span>{rank <= 3 ? '관람객 선정 · TOP 3' : 'HALL OF FAME'}</span></span>}
        <ArtworkVisual artwork={artwork} />
        <span className="artwork-label">
          <span className="artwork-label-top"><span>작품 № {String(artwork.id).padStart(3, '0')}</span><span>{artwork.category}</span></span>
          <span id={`collection-${artwork.id}`} role="heading" aria-level="2" className="artwork-title">{artwork.title}<span aria-hidden="true">↗</span></span>
          <span className="artwork-excerpt">{artwork.content}</span>
          <span className="artwork-author">작가 · {artwork.author}</span>
          <span className="artwork-label-bottom"><time dateTime={artwork.created_at}>{formatDate(artwork.created_at)}</time><span className="artwork-like-count"><span aria-hidden="true">♡</span> <span className="recognition-sr-only">좋아요 </span>{artwork.recognition_count ?? '—'}</span><span>감상하기 ↗</span></span>
        </span>
      </a>
    </article>
  )
}

export function GalleryPage({ onUnavailable }) {
  const resource = useArtworkResource('/api/artworks')
  const [category, setCategory] = useState('전체')
  const [order, setOrder] = useState('latest')
  const allArtworks = resource.data || []
  const artworks = selectArtworks(allArtworks, category, order)
  return (
    <main id="main-content" className="page-width gallery-page">
      <section aria-labelledby="gallery-title">
        <div className="gallery-heading"><div><p className="eyebrow">THE PERMANENT COLLECTION / DONATED WORKS</p><h1 id="gallery-title">상설 전시관<span className="title-period">.</span></h1><p className="gallery-description">당신의 사소한 핑계가, 이곳의 새로운 소장품이 됩니다.</p></div><a className="museum-button primary" href="/submit">작품 기증하기 ＋</a></div>
        <div className="gallery-controls">
          <div className="category-filters" role="group" aria-label="기증 작품 카테고리">{filters.map((item) => (
            <button key={item} type="button" aria-pressed={category === item} className={`category-button ${category === item ? 'is-active' : ''}`} onClick={() => setCategory(item)}>{item}<span aria-hidden="true">{resource.status === 'success' ? selectArtworks(allArtworks, item).length : '—'}</span></button>
          ))}</div>
          <label className="sort-control">정렬<select value={order} onChange={(event) => setOrder(event.target.value)}><option value="latest">최신 기증순</option><option value="popular">인기순 · 좋아요</option></select></label>
        </div>
        <ResourceNotice resource={resource} />
        {resource.status === 'success' && <>
          <div className="gallery-result"><p role="status" aria-live="polite"><strong>{artworks.length}</strong>점의 기증 작품 <span> / {category}</span></p><p>실제 기증된 소장품</p></div>
          <div className="artwork-grid">{artworks.map((artwork) => <LiveArtworkCard key={artwork.id} artwork={artwork} />)}</div>
          {artworks.length === 0 && <div className="empty-collection">
            <p>{allArtworks.length === 0 ? '아직 기증된 작품이 없습니다. 첫 번째 소장품의 주인공이 되어 주세요.' : '이 카테고리에는 아직 기증된 작품이 없습니다.'}</p>
            <a className="museum-button primary" href="/submit">작품 기증하기 ＋</a>
            {category !== '전체' && <button className="text-link" type="button" onClick={() => setCategory('전체')}>전체 작품 보기 →</button>}
          </div>}
          <p className="gallery-end">— EVERY EXCUSE DESERVES AN EXHIBITION —</p>
        </>}
      </section>
      <SampleCollection onUnavailable={onUnavailable} />
    </main>
  )
}

export function SubmitPage() {
  const [values, setValues] = useState({ title: '', content: '', category: '', author: '' })
  const curator = useCurator(values)
  const painting = usePainting(values, curator)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [creationMode, setCreationMode] = useState('text')
  const busy = useRef(false)
  const pending = useRef(null)
  const errorRef = useRef(null)

  function update(event) {
    const { name, value } = event.target
    const next = { ...values, [name]: value }
    setValues(next)
    if (name !== 'author' && value !== values[name]) curator.dispatch({ type: 'input_changed' })
    if (errors[name]) setErrors((current) => ({ ...current, [name]: validateArtwork(next)[name] }))
  }

  async function submit(event) {
    event.preventDefault()
    if (busy.current) return
    if (curator.state.status === 'loading') return
    if (painting.state.status === 'loading') return
    // Preview creation alone is not a donation. Require explicit image review,
    // including Enter/programmatic submissions, before linking an image.
    const blocked = imageDonationBlockReason(creationMode, painting.ready)
    if (blocked) {
      setMessage(blocked)
      requestAnimationFrame(() => errorRef.current?.focus())
      return
    }
    const validation = validateArtwork(values)
    setErrors(validation)
    setMessage('')
    if (Object.keys(validation).length) {
      event.currentTarget.elements.namedItem(Object.keys(validation)[0])?.focus()
      return
    }
    busy.current = true
    setSaving(true)
    try {
      const payload = { ...normalizeArtwork(values), ...curatorDonationFields(curator.state),
        ...paintingDonationFields(creationMode, painting.state, painting.input), visitor_id: getVisitorId() }
      if (creationMode === 'generated' && !payload.image_token) throw new Error('이미지를 다시 확인해 주세요. 기증 가능 시간이 만료되었을 수 있습니다.')
      const fingerprint = JSON.stringify(payload)
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, id: createRequestId() }
      const artwork = await artworkRequest('/api/artworks', { ...payload, request_id: pending.current.id })
      window.location.assign(`/artworks/${artwork.id}`)
    } catch (error) {
      setErrors(error.fields || {})
      setMessage(error.message)
      requestAnimationFrame(() => errorRef.current?.focus())
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const description = (name) => `${name}-hint${errors[name] ? ` ${name}-error` : ''}`
  return (
    <main id="main-content" className="page-width donation-page">
      <div className="donation-heading"><p className="eyebrow">ACQUISITIONS / A GIFT TO THE MUSEUM</p><h1 className="section-title">당신의 핑계를<br />작품으로 기증해 주세요.</h1><p>그럴듯하지 않아도 괜찮습니다.<br />당신의 이야기에, 이 미술관의 작품 번호를 붙여드립니다.</p></div>
      <div className="donation-layout">
        <aside className="donation-guide"><span className="donation-mark" aria-hidden="true">✳</span><p className="eyebrow">EVERY EXCUSE DESERVES AN EXHIBITION.</p><h2>작은 사정도,<br />오래 감상할 이야기로.</h2><p>기증한 작품과 작가명은 전시관에 공개됩니다. 공개하고 싶은 이야기만 남겨 주세요.</p><p>작가명을 비우면 ‘익명의 예술가’로 전시됩니다.</p><a className="text-link" href="/gallery">전시관 먼저 둘러보기 ↗</a></aside>
        <form className="donation-form" noValidate onSubmit={submit} aria-busy={saving}>
          <p className="form-caption">작품 기증서 <span>* 필수 항목</span></p>
          <fieldset disabled={saving}>
            <div className="form-field"><label htmlFor="title">작품명 <span>*</span></label><input id="title" name="title" value={values.title} onChange={update} required aria-invalid={Boolean(errors.title)} aria-describedby={description('title')} placeholder="이 핑계에 어울리는 이름을 붙여 주세요" /><p id="title-hint" className="field-hint">2~50자 <span>{characterCount(trimText(values.title))} / 50</span></p>{errors.title && <p id="title-error" className="field-error">{errors.title}</p>}</div>
            <CuratorSuggestions curator={curator} values={values} saving={saving || painting.state.status === 'loading'} onChooseTitle={(title) => {
              setValues((current) => ({ ...current, title }))
              setErrors((current) => ({ ...current, title: undefined }))
              curator.dispatch({ type: 'input_changed' })
            }} />
            <div className="form-field"><label htmlFor="content">핑계 내용 <span>*</span></label><textarea id="content" name="content" rows="6" value={values.content} onChange={update} required aria-invalid={Boolean(errors.content)} aria-describedby={description('content')} placeholder="그날의 사정, 나름의 이유를 들려주세요." /><p id="content-hint" className="field-hint">10~300자 · 앞뒤 공백 제외 <span>{characterCount(trimText(values.content))} / 300</span></p>{errors.content && <p id="content-error" className="field-error">{errors.content}</p>}</div>
            <div className="form-field"><label htmlFor="category">카테고리 <span>*</span></label><select id="category" name="category" value={values.category} onChange={update} required aria-invalid={Boolean(errors.category)} aria-describedby={description('category')}><option value="">작품의 카테고리를 선택해 주세요</option>{artworkCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select><p id="category-hint" className="field-hint">다섯 가지 중 한 가지를 골라 주세요.</p>{errors.category && <p id="category-error" className="field-error">{errors.category}</p>}</div>
            <div className="form-field"><label htmlFor="author">작가명 <small>선택</small></label><input id="author" name="author" value={values.author} onChange={update} aria-invalid={Boolean(errors.author)} aria-describedby={description('author')} placeholder="익명의 예술가" /><p id="author-hint" className="field-hint">비워두면 익명의 예술가 <span>{characterCount(trimText(values.author))} / 20</span></p>{errors.author && <p id="author-error" className="field-error">{errors.author}</p>}</div>
            <CuratorDescription curator={curator} />
            <ArtworkCreation painting={painting} curatorBusy={curator.state.status === 'loading'} mode={creationMode} onModeChange={(mode) => { setCreationMode(mode); painting.dispatch({ type: 'invalidate' }); setMessage('') }} />
          </fieldset>
          <p className="visitor-note">회원가입 없이 참여하는 데모입니다. 브라우저에 임시 방문객 ID를 보관하며 실제 인증 수단은 아닙니다. 저장 정보를 지우면 이전 ID를 잃을 수 있습니다.</p>
          {message && <div className="error-notice form-error" role="alert" tabIndex="-1" ref={errorRef}><p>{message}</p><a className="text-link" href="/gallery">전시관에서 확인하기 ↗</a></div>}
          <div className="form-actions"><a className="text-link" href="/gallery">전시관으로 돌아가기</a><button className="museum-button primary" type="submit" disabled={saving || curator.state.status === 'loading' || painting.state.status === 'loading' || Boolean(imageDonationBlockReason(creationMode, painting.ready))}>{saving ? '작품을 기증하는 중…' : painting.state.status === 'loading' ? '회화 제작을 기다리는 중…' : curator.state.status === 'loading' ? 'AI 추천 응답을 기다리는 중…' : creationMode === 'generated' ? 'AI 회화 작품 기증하기 ＋' : creationMode === 'photo' ? '사진 기증 준비 중' : '텍스트 작품 기증하기 ＋'}</button></div>
          <p className="field-hint" role="status" aria-live="polite">{saving ? '기증 결과를 기다리고 있습니다. 잠시만 기다려 주세요.' : imageDonationBlockReason(creationMode, painting.ready) || '기증이 완료되면 작품 감상실로 안내합니다.'}</p>
        </form>
      </div>
    </main>
  )
}

export function ArtworkDetailPage({ id }) {
  const resource = useArtworkResource(`/api/artworks/${encodeURIComponent(id)}`)
  const artwork = resource.data
  return (
    <main id="main-content" className="page-width detail-page">
      <a className="text-link" href="/gallery">← 상설 전시관</a>
      <ResourceNotice resource={resource} />
      {resource.status === 'success' && <ArtworkExhibition artwork={artwork}
        recognition={<ArtworkRecognition key={resource.visitorId || 'anonymous'} artwork={artwork} visitorId={resource.visitorId} />}
        actions={<ArtworkOwnerActions artwork={artwork} visitorId={resource.visitorId} />} />}
    </main>
  )
}
