import { useRef, useState } from 'react'
import { ApiError, artworkRequest, userMessage } from './artworkApi.js'
import { artworkCategories, characterCount, trimText } from './artworkRules.js'
import { artworkEditPayload, artworkEditValues, canManageArtwork, deleteArtworkAfterConfirmation, validateArtworkEdit } from './artworkManagement.js'
import PhotoSelection, { usePhotoSelection } from './PhotoSelection.jsx'
import { createPhotoUploadSession } from './photoApi.js'
import { artworkImageUrl } from './artworkPresentation.js'

export function ArtworkOwnerActions({ artwork, visitorId }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  if (!canManageArtwork(artwork, visitorId)) return null

  async function remove() {
    if (busy.current) return
    busy.current = true
    setDeleting(true)
    setError('')
    try { await deleteArtworkAfterConfirmation(artwork, visitorId) }
    catch (failure) { setError(userMessage(failure, '삭제 결과를 확인하지 못했습니다. 전시관에서 실제 상태를 확인해 주세요.')) }
    finally { busy.current = false; setDeleting(false) }
  }

  return (
    <section aria-label="내 작품 관리">
      <div className="form-actions">
        {!deleting && <a className="museum-button secondary" href={`/artworks/${artwork.id}/edit`}>작품 수정하기</a>}
        <button className="museum-button danger" type="button" disabled={deleting} aria-busy={deleting} onClick={remove}>{deleting ? '삭제 결과를 기다리는 중…' : '작품 삭제하기'}</button>
      </div>
      <p className="visitor-note">현재 브라우저의 방문객 ID로 구분한 내 작품입니다. 이 ID는 실제 인증이 아닌 로컬 데모용입니다.</p>
      {error && <div className="error-notice" role="alert"><p>{error}</p><a className="text-link" href="/gallery">전시관에서 확인하기 ↗</a></div>}
    </section>
  )
}

export function ArtworkEditForm({ artwork, visitorId }) {
  const [values, setValues] = useState(() => artworkEditValues(artwork))
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const errorRef = useRef(null)
  const isPhoto = artwork.image_mode === 'photo'
  const hasDescription = artwork.refined_description != null || isPhoto
  const photo = usePhotoSelection()
  const photoUpload = useRef(createPhotoUploadSession())
  const photoAbort = useRef(null)
  const [photoUploading, setPhotoUploading] = useState(false)

  function update(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  async function save(event) {
    event.preventDefault()
    if (busy.current) return
    if (isPhoto && (photo.error || (photo.file && !photo.ready))) {
      setMessage(photo.error || '새 사진의 미리보기가 표시되는지 확인해 주세요.')
      return
    }
    const validation = validateArtworkEdit(values)
    setErrors(validation)
    setMessage('')
    if (Object.keys(validation).length) {
      event.currentTarget.elements.namedItem(Object.keys(validation)[0])?.focus()
      return
    }
    busy.current = true
    setSaving(true)
    try {
      if (!canManageArtwork(artwork, visitorId)) throw new ApiError('방문객 정보가 변경되었습니다. 입력을 복사해 보관하고 작품을 다시 열어 주세요.')
      const payload = artworkEditPayload(values, visitorId, hasDescription)
      if (isPhoto && photo.file) {
        const controller = new AbortController()
        photoAbort.current = controller
        setPhotoUploading(true)
        payload.photo_token = await photoUpload.current.tokenFor(photo.file, visitorId, { signal: controller.signal })
        if (controller.signal.aborted) throw new ApiError('사진 업로드를 취소했습니다. 기존 이미지와 입력은 유지됩니다.')
        setPhotoUploading(false)
        photoAbort.current = null
      }
      if (!canManageArtwork(artwork, visitorId)) throw new ApiError('방문객 정보가 변경되어 저장하지 않았습니다. 입력 내용을 보관하고 작품을 다시 열어 주세요.')
      const result = await artworkRequest(`/api/artworks/${artwork.id}`, payload, { method: 'PUT' })
      if (result.photo_cleanup_pending) window.alert('수정은 저장되었습니다. 이전 사진 파일 정리는 재시도 예정입니다.')
      window.location.assign(`/artworks/${artwork.id}`)
    } catch (failure) {
      setErrors(failure.fields || {})
      setMessage(userMessage(failure, '수정 결과를 확인하지 못했습니다. 입력은 유지됩니다. 작품 상세에서 저장 결과를 확인해 주세요.'))
      requestAnimationFrame(() => errorRef.current?.focus())
    } finally { photoAbort.current = null; setPhotoUploading(false); busy.current = false; setSaving(false) }
  }

  const fields = [
    { name: 'title', label: '작품명', min: 2, max: 50 },
    { name: 'content', label: isPhoto ? '작품 설명 / 핑계 내용' : '핑계 내용', min: 10, max: 300, multiline: true },
    { name: 'author', label: '작가명', max: 20 },
    ...(hasDescription ? [{ name: 'refined_description', label: '저장된 작품 설명', max: 1000, multiline: true }] : []),
  ]
  return (
    <form className="donation-form" noValidate onSubmit={save} aria-busy={saving}>
      <p className="form-caption">작품 수정서</p>
      <fieldset disabled={saving}>
        {isPhoto && <PhotoSelection id="edit-photo" photo={photo} existingUrl={artworkImageUrl(artwork)} />}
        {fields.map(({ name, label, min, max, multiline }) => {
          const props = { id: `edit-${name}`, name, value: values[name], onChange: update, required: Boolean(min),
            'aria-invalid': Boolean(errors[name]), 'aria-describedby': `edit-${name}-hint${errors[name] ? ` edit-${name}-error` : ''}` }
          return <div className="form-field" key={name}>
            <label htmlFor={props.id}>{label}{min ? <span> *</span> : <small> 선택</small>}</label>
            {multiline ? <textarea {...props} rows={name === 'content' ? 6 : 5} /> : <input {...props} />}
            <p className="field-hint" id={`edit-${name}-hint`}>{min ? `${min}~${max}자` : name === 'author' ? '비워두면 익명의 예술가' : '비워두면 저장된 설명을 지웁니다.'}<span>{characterCount(trimText(values[name]))} / {max}</span></p>
            {errors[name] && <p className="field-error" id={`edit-${name}-error`}>{errors[name]}</p>}
          </div>
        })}
        <div className="form-field">
          <label htmlFor="edit-category">카테고리 <span>*</span></label>
          <select id="edit-category" name="category" value={values.category} onChange={update} required aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? 'edit-category-error' : undefined}>
            {artworkCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          {errors.category && <p className="field-error" id="edit-category-error">{errors.category}</p>}
        </div>
      </fieldset>
      {photoUploading && <button className="text-link" type="button" onClick={() => photoAbort.current?.abort()}>사진 업로드 취소</button>}
      <p className="visitor-note">{isPhoto ? '새 사진을 선택하지 않으면 기존 사진이 유지됩니다. 사진 교체는 저장 후 적용됩니다.' : '기존 작품 이미지·화풍·기증 날짜는 유지됩니다.'} 이미지나 AI 설명을 자동으로 다시 생성하지 않습니다.</p>
      {message && <div className="error-notice form-error" role="alert" tabIndex="-1" ref={errorRef}><p>{message}</p><a className="text-link" href={`/artworks/${artwork.id}`}>실제 저장 결과 확인하기 ↗</a></div>}
      <div className="form-actions"><a className="text-link" href={`/artworks/${artwork.id}`}>수정 취소</a><button className="museum-button primary" type="submit" disabled={saving} aria-busy={saving}>{photoUploading ? '사진을 업로드하는 중…' : saving ? '수정 내용을 저장하는 중…' : '수정 내용 저장하기'}</button></div>
      <p className="field-hint" role="status">{photoUploading ? '사진을 업로드하고 있습니다. 업로드 중에는 취소할 수 있습니다.' : saving ? '수정 결과를 기다리고 있습니다. 잠시만 기다려 주세요.' : ''}</p>
    </form>
  )
}
