import { useEffect, useRef, useState } from 'react'
import { createPhotoPreview, imageDonationBlockReason, imageStyles } from './artworkCreation.js'

export function StyleChoices({ name, value, onChange, generated = false }) {
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
      <p className="creation-help">{generated ? '선택한 재료의 질감과 표현을 이미지 생성에 반영합니다. 화풍 선택만으로 API를 호출하지 않습니다.' : '사진 화풍 변환은 준비 중이며 실행되지 않습니다.'}</p>
    </fieldset>
  )
}

export function CreationPreview({ src, fileName, error, onImageError, generated = false }) {
  return (
    <figure className="creation-preview">
      <div className="creation-preview-frame">
        {src && !error ? <img src={src} alt={`선택한 원본 사진 미리보기: ${fileName}`} onError={onImageError} /> : <div className="creation-preview-empty">
          <span aria-hidden="true">✳</span>
          <p>{generated ? '이곳에 당신의 회화가 놓입니다.' : error ? '사진 미리보기를 표시할 수 없습니다.' : '선택한 사진이 이곳에 놓입니다.'}</p>
          <small>{generated ? '이미지가 아직 생성되지 않았습니다.' : '사진은 서버에 전송되지 않습니다.'}</small>
        </div>}
      </div>
      <figcaption>{generated ? '버튼을 눌러 생성한 뒤 결과를 확인해 주세요.' : '원본 사진 미리보기 · 업로드·기증되지 않음'}</figcaption>
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

export function GeneratedCreation({ painting, curatorBusy = false }) {
  const { state } = painting
  const loading = state.status === 'loading'
  const [failedPreview, setFailedPreview] = useState(null)
  const [loadedPreview, setLoadedPreview] = useState(null)
  const previewFailed = Boolean(state.result && failedPreview === state.result.image_token)
  const previewLoaded = Boolean(state.result && loadedPreview === state.result.image_token)
  return (
    <div className="creation-options" id="generated-creation-options" aria-busy={loading}>
      <p className="creation-option-heading">핑계에서 시작하는 회화 <span className="creation-badge">AI 이미지 생성</span></p>
      <p className="creation-help">작품명·원문·확인된 작품 설명을 바탕으로 회화를 제작합니다. AI 큐레이터의 글 추천과 별개의 유료 요청입니다. 입력 내용은 OpenAI에 전송됩니다.</p>
      <fieldset disabled={loading}><StyleChoices generated name="generated_style" value={painting.style} onChange={painting.setStyle} /></fieldset>
      <p className="creation-help">GPT Image 2 · medium · 1024×1024 · 1장. 예상 출력 비용 약 US $0.053 + 입력 비용. 다시 생성할 때마다 비용이 발생할 수 있습니다. 공유 키 보호 설정이 켜져 있어야 사용할 수 있습니다.</p>
      <button type="button" className="museum-button secondary creation-generate-button" disabled={loading || curatorBusy} onClick={painting.generate}>{loading ? '회화를 제작하는 중… (최대 약 2분)' : state.result ? '작품 이미지 다시 생성하기 (유료)' : '작품 이미지 생성하기'}</button>
      <p role="status" aria-live="polite" className="creation-help">{loading ? '한 장을 제작하고 있습니다. 자동 재시도하지 않습니다. 입력 내용은 유지됩니다.' : '버튼을 누를 때만 생성합니다. 생성 결과는 기증 전까지 공개되지 않으며 24시간 동안 기증할 수 있습니다.'}</p>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      {state.result ? <figure className="creation-preview"><div className="creation-preview-frame">
        {previewFailed ? <p role="alert">미리보기를 읽을 수 없습니다. 이미지 기증을 진행하지 마세요. 텍스트 기증은 가능합니다.</p> : <img src={state.result.preview_data_url} alt="기증 전 확인하는 AI 생성 회화" onLoad={() => setLoadedPreview(state.result.image_token)} onError={() => {
          setFailedPreview(state.result.image_token)
          painting.dispatch({ type: 'invalidate' })
        }} />}
      </div><figcaption>AI 생성 회화 · 아직 기증되지 않은 비공개 미리보기</figcaption></figure> : <CreationPreview generated />}
      {painting.stale && <p className="field-error" role="status">작품 정보나 화풍이 바뀌어 이전 이미지와 일치하지 않습니다. 자동 재생성하지 않습니다. 다시 생성하거나 텍스트로 기증해 주세요.</p>}
      {painting.expired && <p className="field-error" role="status">미리보기의 기증 가능 시간이 만료되었습니다.</p>}
      {state.result && <label className="painting-confirm"><input type="checkbox" checked={painting.ready && !previewFailed && previewLoaded} disabled={loading || painting.stale || painting.expired || previewFailed || !previewLoaded} onChange={(event) => painting.dispatch({ type: 'confirm', value: event.target.checked })} />생성된 이미지를 확인했으며 이 이미지와 작품 정보를 함께 기증합니다.</label>}
      <p className="creation-help">화면을 떠나면 미리보기 선택이 사라집니다. 기증 전 결과는 전시관에 등록되지 않습니다. 실패해도 ‘이미지 없이 텍스트로 기증’을 이용할 수 있습니다.</p>
    </div>
  )
}

export default function ArtworkCreation({ mode, onModeChange, painting, curatorBusy }) {
  return (
    <section className="artwork-creation" aria-labelledby="creation-title">
      <div className="creation-heading"><h2 id="creation-title">작품 제작 방식</h2><span className="creation-badge">TEXT / AI PAINTING</span></div>
      <p className="creation-help">텍스트 그대로 기증하거나, 한 장의 AI 회화로 전시해 보세요. 사진 기증은 준비 중입니다.</p>
      <fieldset className="creation-methods">
        <legend className="creation-sr-only">이미지 제작 방식 선택</legend>
        <div className="creation-method-grid">
          <label className="creation-method-card">
            <input type="radio" name="creation_mode" value="photo" checked={mode === 'photo'} onChange={() => onModeChange('photo')} aria-controls={mode === 'photo' ? 'photo-creation-options' : undefined} />
            <span className="creation-card-index" aria-hidden="true">01 / PHOTOGRAPH</span><strong>사진으로 작품 만들기</strong><span>원본 사진 전시 또는 AI 화풍 변환</span><small>사진은 내 브라우저에서만 미리보기</small>
          </label>
          <label className="creation-method-card">
            <input type="radio" name="creation_mode" value="generated" checked={mode === 'generated'} onChange={() => onModeChange('generated')} aria-controls={mode === 'generated' ? 'generated-creation-options' : undefined} />
            <span className="creation-card-index" aria-hidden="true">02 / IMAGINATION</span><strong>AI로 작품 만들기</strong><span>작성한 핑계에서 출발하는 새로운 그림</span><small>화풍 선택 → 이미지 생성 → 확인 후 기증</small>
          </label>
        </div>
      </fieldset>
      {mode === 'photo' && <PhotoCreation />}
      {mode === 'generated' && painting && <GeneratedCreation painting={painting} curatorBusy={curatorBusy} />}
      <div className="text-donation-choice"><button type="button" className="text-link" aria-pressed={mode === 'text'} onClick={() => onModeChange('text')}>이미지 없이 텍스트로 기증{mode === 'text' ? ' ✓' : ' →'}</button><p role="status" aria-live="polite">{imageDonationBlockReason(mode, painting?.ready) || (mode === 'text' ? '텍스트 작품 기증이 선택되어 있습니다. 아래 버튼으로 작품을 저장할 수 있습니다.' : '확인한 AI 회화를 함께 기증합니다.')}</p></div>
    </section>
  )
}
