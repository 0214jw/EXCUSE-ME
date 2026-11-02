import { useEffect, useRef, useState } from 'react'
import { createPhotoPreview, imageDonationBlockReason, imageStyles } from './artworkCreation.js'

export function StyleChoices({ name, value, onChange }) {
  return (
    <fieldset className="style-choices">
      <legend>화풍 선택</legend>
      <div className="style-choice-grid">{imageStyles.map((style) => (
        <label className={`style-choice style-${style.value}`} key={style.value}>
          <input type="radio" name={name} value={style.value} checked={value === style.value} onChange={() => onChange(style.value)} />
          <span className="style-choice-mark" aria-hidden="true">{style.mark}</span>
          <span className="style-choice-name">{style.label}</span>
          <small>{style.english}</small>
        </label>
      ))}</div>
      <p className="creation-help">화풍 선택을 미리 살펴보는 화면입니다. 실제 이미지 생성·변환은 실행되지 않습니다.</p>
    </fieldset>
  )
}

export function CreationPreview({ src, fileName, error, onImageError, generated = false }) {
  return (
    <figure className="creation-preview">
      <div className="creation-preview-frame">
        {src && !error ? <img src={src} alt={`선택한 원본 사진 미리보기: ${fileName}`} onError={onImageError} /> : <div className="creation-preview-empty">
          <span aria-hidden="true">✳</span>
          <p>{generated ? 'AI 작품 제작 준비 중' : error ? '사진 미리보기를 표시할 수 없습니다.' : '선택한 사진이 이곳에 놓입니다.'}</p>
          <small>{generated ? '이미지가 아직 생성되지 않았습니다.' : '사진은 서버에 전송되지 않습니다.'}</small>
        </div>}
      </div>
      <figcaption>{generated ? '생성 예정 이미지 영역 · 현재 생성 기능 없음' : '원본 사진 미리보기 · 업로드·기증되지 않음'}</figcaption>
    </figure>
  )
}

function PhotoCreation() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [fileError, setFileError] = useState('')
  const [failedUrl, setFailedUrl] = useState(null)
  const [variant, setVariant] = useState('original')
  const [style, setStyle] = useState('watercolor')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!file) return
    try {
      const local = createPhotoPreview(file)
      setPreview(local)
      return () => local.dispose()
    } catch (error) {
      setPreview(null)
      setFileError(error.message)
    }
  }, [file])

  const activePreview = preview?.file === file ? preview : null
  const decodeFailed = Boolean(activePreview && failedUrl === activePreview.url)

  function chooseFile(event) {
    const selected = event.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setFileError('')
    setFailedUrl(null)
    // Allow choosing the same file again after a decode error.
    event.target.value = ''
  }

  function removeFile() {
    setFile(null)
    setPreview(null)
    setFileError('')
    setFailedUrl(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="creation-options" id="photo-creation-options">
      <p className="creation-option-heading">사진에서 시작하는 작품 <span className="creation-badge">미리보기만 가능</span></p>
      <label className="photo-file-label" htmlFor="local-photo">사진 파일 선택</label>
      <input className="photo-file-input" id="local-photo" ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseFile} aria-describedby="photo-file-help photo-error" />
      <p id="photo-file-help" className="creation-help">JPG, PNG, WebP, GIF · 사진은 브라우저 안에서만 표시됩니다. 제작 방식을 바꾸거나 화면을 떠나면 선택이 해제됩니다.</p>
      {file && <div className="selected-photo"><span>{file.name}</span><button type="button" className="text-link" onClick={removeFile}>사진 선택 해제</button></div>}
      <p id="photo-error" className="field-error" role={fileError || decodeFailed ? 'alert' : undefined}>{fileError || (decodeFailed ? '사진을 읽을 수 없습니다. 다른 사진을 선택해 주세요.' : '')}</p>
      <fieldset className="photo-treatment">
        <legend>사진 전시 방식</legend>
        <label><input type="radio" name="photo_treatment" value="original" checked={variant === 'original'} onChange={() => setVariant('original')} /><span>원본 사진 전시<small>선택한 원본 미리보기 · 기증 준비 중</small></span></label>
        <label><input type="radio" name="photo_treatment" value="styled" checked={variant === 'styled'} onChange={() => setVariant('styled')} /><span>AI 화풍 변환<small>화풍 선택만 가능 · 변환 준비 중</small></span></label>
      </fieldset>
      {variant === 'styled' && <StyleChoices name="photo_style" value={style} onChange={setStyle} />}
      <CreationPreview src={activePreview?.url} fileName={file?.name} error={fileError || decodeFailed} onImageError={() => setFailedUrl(activePreview.url)} />
      {variant === 'styled' && <p className="creation-help">위 사진은 원본입니다. 선택한 화풍으로 변환된 결과가 아닙니다.</p>}
      <p className="creation-unavailable">사진 업로드·원본 사진 기증·AI 화풍 변환은 준비 중입니다. 사진을 선택해도 이미지 작품이 저장되지 않습니다.</p>
    </div>
  )
}

function GeneratedCreation() {
  const [style, setStyle] = useState('watercolor')
  return (
    <div className="creation-options" id="generated-creation-options">
      <p className="creation-option-heading">핑계에서 시작하는 작품 <span className="creation-badge">준비 중</span></p>
      <p className="creation-help">위에 작성한 핑계를 바탕으로 이미지를 만드는 방식입니다. 지금은 화풍만 선택할 수 있으며 실제 AI 이미지 생성 요청은 보내지 않습니다.</p>
      <StyleChoices name="generated_style" value={style} onChange={setStyle} />
      <CreationPreview generated />
      <button type="button" className="museum-button secondary creation-generate-button" disabled>AI 작품 제작 준비 중</button>
      <p className="creation-unavailable">이미지가 생성되지 않은 상태에서는 AI 작품을 기증할 수 없습니다.</p>
    </div>
  )
}

export default function ArtworkCreation({ mode, onModeChange }) {
  return (
    <section className="artwork-creation" aria-labelledby="creation-title">
      <div className="creation-heading"><h2 id="creation-title">작품 제작 방식</h2><span className="creation-badge">이미지 기능 준비 중</span></div>
      <p className="creation-help">이미지 제작 방식을 미리 살펴보세요. 지금 기증할 수 있는 작품은 텍스트 작품입니다.</p>
      <fieldset className="creation-methods">
        <legend className="creation-sr-only">이미지 제작 방식 선택</legend>
        <div className="creation-method-grid">
          <label className="creation-method-card">
            <input type="radio" name="creation_mode" value="photo" checked={mode === 'photo'} onChange={() => onModeChange('photo')} aria-controls={mode === 'photo' ? 'photo-creation-options' : undefined} />
            <span className="creation-card-index" aria-hidden="true">01 / PHOTOGRAPH</span><strong>사진으로 작품 만들기</strong><span>원본 사진 전시 또는 AI 화풍 변환</span><small>사진은 내 브라우저에서만 미리보기</small>
          </label>
          <label className="creation-method-card">
            <input type="radio" name="creation_mode" value="generated" checked={mode === 'generated'} onChange={() => onModeChange('generated')} aria-controls={mode === 'generated' ? 'generated-creation-options' : undefined} />
            <span className="creation-card-index" aria-hidden="true">02 / IMAGINATION</span><strong>AI로 작품 만들기</strong><span>작성한 핑계에서 출발하는 새로운 그림</span><small>화풍 선택 가능 · 실제 생성은 준비 중</small>
          </label>
        </div>
      </fieldset>
      {mode === 'photo' && <PhotoCreation />}
      {mode === 'generated' && <GeneratedCreation />}
      <div className="text-donation-choice"><button type="button" className="text-link" aria-pressed={mode === 'text'} onClick={() => onModeChange('text')}>이미지 없이 텍스트로 기증{mode === 'text' ? ' ✓' : ' →'}</button><p role="status" aria-live="polite">{imageDonationBlockReason(mode) || '텍스트 작품 기증이 선택되어 있습니다. 아래 버튼으로 작품을 저장할 수 있습니다.'}</p></div>
    </section>
  )
}
