import { useEffect, useState } from 'react'
import { createPhotoPreview, validatePhotoFile } from './artworkCreation.js'
import './PhotoUpload.css'

export function usePhotoSelection() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [loadedUrl, setLoadedUrl] = useState(null)
  const [selection, setSelection] = useState(0)
  useEffect(() => {
    if (!file) return
    try {
      const local = createPhotoPreview(file)
      setPreview(local)
      return () => local.dispose()
    } catch (failure) { setPreview(null); setError(failure.message) }
  }, [file, selection])
  const current = preview?.file === file ? preview : null
  return {
    file, url: current?.url, error, ready: Boolean(current && loadedUrl === current.url && !error),
    select(selected) {
      try { validatePhotoFile(selected); setFile(selected); setSelection((value) => value + 1); setError(''); setLoadedUrl(null) }
      catch (failure) { setFile(null); setError(failure.message); setLoadedUrl(null) }
    },
    clear() { setFile(null); setError(''); setLoadedUrl(null) },
    loaded() { if (current) setLoadedUrl(current.url) },
    failed() { setError('사진 미리보기를 읽을 수 없습니다. 다른 사진을 선택해 주세요.') },
  }
}

export default function PhotoSelection({ photo, id = 'donation-photo', existingUrl = null }) {
  const [savedFailed, setSavedFailed] = useState(false)
  return <section className="creation-options photo-receipt" aria-label="사진 작품 접수">
    <p className="creation-option-heading">원본 사진 전시 <span className="creation-badge">PHOTOGRAPH</span></p>
    <label className="photo-file-label" htmlFor={id}>{existingUrl ? '새 사진 선택 (선택 사항)' : '기증할 사진 선택'}</label>
    <input id={id} className="photo-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
      onChange={(event) => { const selected = event.target.files?.[0]; if (selected) photo.select(selected); event.target.value = '' }}
      aria-describedby={`${id}-help ${id}-error`} />
    <p id={`${id}-help`} className="creation-help">JPG / JPEG, PNG, WEBP · 최대 5MB · 원본 사진만 저장합니다. 사진은 AI에 전송하지 않습니다.</p>
    {photo.file && <div className="selected-photo"><span>{photo.file.name}</span><button type="button" className="text-link" onClick={photo.clear}>사진 선택 취소</button></div>}
    <p id={`${id}-error`} className="field-error" role={photo.error ? 'alert' : undefined}>{photo.error}</p>
    {(photo.url || (existingUrl && !savedFailed)) && <figure className="creation-preview">
      <div className="creation-preview-frame"><img src={photo.url || existingUrl}
        alt={photo.url ? '기증할 원본 사진 미리보기' : '현재 저장된 작품 사진'}
        onLoad={() => { if (photo.url) photo.loaded() }}
        onError={() => { if (photo.url) photo.failed(); else setSavedFailed(true) }} /></div>
      <figcaption>{photo.url ? '선택한 원본 사진 · 저장 버튼을 눌러야 업로드됩니다.' : '기존 사진 · 새 사진을 선택하지 않으면 유지됩니다.'}</figcaption>
    </figure>}
    {!photo.url && savedFailed && <p className="creation-help">기존 사진을 불러오지 못했습니다. 사진을 새로 선택하지 않아도 기존 이미지 연결은 유지됩니다.</p>}
    <p className="creation-help">기증한 사진은 작품과 함께 공개됩니다. AI 큐레이터는 입력한 글만 사용합니다.</p>
  </section>
}
