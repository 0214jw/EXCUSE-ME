import { characterCount, trimText } from './artworkRules.js'
import { curatorIsStale } from './curatorState.js'

export function CuratorSuggestions({ curator, values, onChooseTitle, saving }) {
  const { state, generate } = curator
  const stale = curatorIsStale(state, values)
  return (
    <section className="curator-panel" aria-labelledby="curator-title">
      <div className="creation-heading"><h2 id="curator-title">AI 큐레이터</h2><span className="creation-badge">제목·설명 추천</span></div>
      <p className="creation-help">아래 원문 핑계와 카테고리를 입력한 뒤 추천받아 보세요. 제목은 비워도 됩니다. AI 이미지 생성과는 별개의 글쓰기 도움 기능입니다.</p>
      <p className="curator-privacy">버튼을 누르면 원문 핑계·현재 작품명·카테고리를 OpenAI에 보내 제목 3개와 작품 설명을 함께 요청합니다. 자동 호출·자동 재시도는 하지 않습니다.</p>
      <button type="button" className="museum-button secondary" disabled={saving || state.status === 'loading'} onClick={generate}>{state.status === 'loading' ? '큐레이터의 추천을 기다리는 중…' : state.titles.length ? '다시 생성하기' : 'AI 큐레이터에게 작품 추천받기'}</button>
      {state.status === 'loading' && <p className="creation-help" role="status">제목과 설명을 한 번에 요청하고 있습니다. 입력 내용은 계속 수정할 수 있습니다.</p>}
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      {stale && <p className="curator-stale" role="status">원문 핑계 또는 카테고리가 바뀌어 이전 AI 추천이 현재 내용과 다를 수 있습니다. 다시 생성하거나 설명을 직접 수정·확인해 주세요.</p>}
      {state.titles.length > 0 && <div className="curator-suggestions">
        <p className="curator-result-heading">추천 작품명 · 선택하거나 직접 수정할 수 있습니다.</p>
        {state.titles.map((title, index) => <button key={title} type="button" aria-pressed={values.title === title} disabled={saving || state.status === 'loading'} onClick={() => onChooseTitle(title)}><span aria-hidden="true">0{index + 1}</span>{title}</button>)}
        <p className="creation-help">제목을 바꿔도 작품 설명을 자동으로 다시 생성하지 않습니다. 추천을 사용하지 않고 직접 입력해도 됩니다.</p>
      </div>}
    </section>
  )
}

export function CuratorDescription({ curator }) {
  const { state, dispatch } = curator
  if (!state.snapshot) return null
  const count = characterCount(trimText(state.description))
  return (
    <section className="curator-description" aria-labelledby="curator-description-title">
      <h2 id="curator-description-title">작품 설명 미리보기·수정</h2>
      <p className="creation-help">원문 핑계와 별도로 저장할 설명입니다. AI가 원문에 없는 사실을 넣지 않았는지 확인하고 자유롭게 수정해 주세요.</p>
      <label className="creation-sr-only" htmlFor="refined-description">최종 작품 설명</label>
      <textarea id="refined-description" rows="6" value={state.description} disabled={state.status === 'loading'} onChange={(event) => dispatch({ type: 'edit', value: event.target.value })} aria-invalid={count > 1000} aria-describedby="description-count description-review" />
      <p className="field-hint" id="description-count">앞뒤 공백 제외, 최대 1000자 <span>{count} / 1000</span></p>
      {count > 1000 && <p className="field-error">작품 설명을 1000자 이내로 줄여 주세요.</p>}
      <label className="curator-confirm"><input type="checkbox" checked={state.confirmed} disabled={state.status === 'loading' || !count || count > 1000} onChange={(event) => dispatch({ type: 'confirm', value: event.target.checked })} /><span>이 설명을 확인했으며 작품 설명으로 함께 저장합니다.</span></label>
      <p className="creation-help" id="description-review">선택하지 않으면 설명은 저장하지 않고 기존 텍스트 작품으로 기증합니다. 원문·제목·카테고리나 설명을 수정하면 확인 선택이 해제됩니다.</p>
    </section>
  )
}
