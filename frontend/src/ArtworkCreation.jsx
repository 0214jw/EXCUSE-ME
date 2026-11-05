import { useState } from 'react'
import { imageDonationBlockReason, imageStyles } from './artworkCreation.js'
import PhotoSelection from './PhotoSelection.jsx'

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
    <figure className={`creation-preview${generated ? ' creation-preview--generated' : ''}`}>
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
      <p className="creation-help">GPT Image 2 · medium · 768×1024 · 3:4 세로 · 1장. 입력·이미지 출력 사용량에 따라 비용이 발생합니다. 다시 생성할 때마다 비용이 발생할 수 있습니다. 공유 키 보호 설정이 켜져 있어야 사용할 수 있습니다.</p>
      <button type="button" className="museum-button secondary creation-generate-button" disabled={loading || curatorBusy} onClick={painting.generate}>{loading ? '회화를 제작하는 중… (최대 약 2분)' : state.result ? '작품 이미지 다시 생성하기 (유료)' : '작품 이미지 생성하기'}</button>
      <p role="status" aria-live="polite" className="creation-help">{loading ? '한 장을 제작하고 있습니다. 자동 재시도하지 않습니다. 입력 내용은 유지됩니다.' : '버튼을 누를 때만 생성합니다. 생성 결과는 기증 전까지 공개되지 않으며 24시간 동안 기증할 수 있습니다.'}</p>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      {state.result ? <figure className="creation-preview creation-preview--generated"><div className="creation-preview-frame">
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

export default function ArtworkCreation({ mode, onModeChange, painting, curatorBusy, photo }) {
  return (
    <section className="artwork-creation" aria-labelledby="creation-title">
      <div className="creation-heading"><h2 id="creation-title">작품 유형</h2><span className="creation-badge">TEXT / PHOTOGRAPH</span></div>
      <p className="creation-help">텍스트 작품 또는 원본 사진 작품을 기증해 주세요. 기존 AI 회화 메뉴는 별도 기능이며 사진을 변환하지 않습니다.</p>
      <fieldset className="creation-methods">
        <legend className="creation-sr-only">이미지 제작 방식 선택</legend>
        <div className="creation-method-grid">
          <label className="creation-method-card">
            <input type="radio" name="creation_mode" value="text" checked={mode === 'text'} onChange={() => onModeChange('text')} />
            <span className="creation-card-index" aria-hidden="true">01 / TEXT</span><strong>텍스트 작품</strong><span>이미지 없이 글 그대로 전시</span><small>기존 텍스트 기증 방식</small>
          </label>
          <label className="creation-method-card">
            <input type="radio" name="creation_mode" value="photo" checked={mode === 'photo'} onChange={() => onModeChange('photo')} aria-controls={mode === 'photo' ? 'donation-photo-section' : undefined} />
            <span className="creation-card-index" aria-hidden="true">02 / PHOTOGRAPH</span><strong>사진 작품</strong><span>원본 사진 전시</span><small>사진 선택 → 확인 → 원본 기증</small>
          </label>
          <label className="creation-method-card">
            <input type="radio" name="creation_mode" value="generated" checked={mode === 'generated'} onChange={() => onModeChange('generated')} aria-controls={mode === 'generated' ? 'generated-creation-options' : undefined} />
            <span className="creation-card-index" aria-hidden="true">03 / IMAGINATION</span><strong>AI로 작품 만들기</strong><span>작성한 핑계에서 출발하는 새로운 그림</span><small>기존 별도 기능 · 사진 변환 아님</small>
          </label>
        </div>
      </fieldset>
      {mode === 'photo' && photo && <PhotoSelection photo={photo} />}
      {mode === 'generated' && painting && <GeneratedCreation painting={painting} curatorBusy={curatorBusy} />}
      <div className="text-donation-choice"><button type="button" className="text-link" aria-pressed={mode === 'text'} onClick={() => onModeChange('text')}>이미지 없이 텍스트로 기증{mode === 'text' ? ' ✓' : ' →'}</button><p role="status" aria-live="polite">{imageDonationBlockReason(mode, painting?.ready, photo?.ready) || (mode === 'text' ? '텍스트 작품 기증이 선택되어 있습니다. 아래 버튼으로 작품을 저장할 수 있습니다.' : mode === 'photo' ? '확인한 원본 사진을 함께 기증합니다.' : '확인한 AI 회화를 함께 기증합니다.')}</p></div>
    </section>
  )
}
