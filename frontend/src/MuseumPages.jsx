import { useState } from 'react'
import { categories, sampleArtworks, sampleNumber, selectSampleArtworks } from './sampleArtworks.js'
import HeroExhibition from './HeroExhibition.jsx'
import ArtworkVisual from './ArtworkVisual.jsx'

function Arrow() {
  return <span aria-hidden="true">↗</span>
}

function ArtworkCard({ artwork, onUnavailable, exhibition = false }) {
  return (
    <article className="artwork-card" aria-labelledby={`artwork-${artwork.id}`}>
      <button type="button" className="artwork-open" aria-label={`${artwork.title} — 작품 상세 준비 중 안내`} onClick={() => onUnavailable('detail')}>
        {exhibition ? <ArtworkVisual artwork={{ ...artwork, content: artwork.quote }} tone={artwork.tone} /> : <span className={`artwork-frame tone-${artwork.tone}`}>
          <span className="frame-canvas">
            <span className="canvas-edition">EXCUSE ME! / TEXT COLLECTION</span>
            <span className="canvas-quote">{artwork.quote}</span>
            <span className="canvas-signature">{artwork.author}</span>
          </span>
        </span>}
        <span className="artwork-label">
          <span className="artwork-label-top"><span>SAMPLE № {sampleNumber(artwork.id)}</span><span>{artwork.category}</span></span>
          <span id={`artwork-${artwork.id}`} role="heading" aria-level="3" className="artwork-title">{artwork.title}<Arrow /></span>
          <span className="artwork-excerpt">{artwork.content}</span>
          <span className="artwork-author">가상 작가 · {artwork.author}</span>
          <span className="artwork-label-bottom"><span>명작 인정 {artwork.sampleRecognitions} · 예시</span><span>상세 준비 중</span></span>
        </span>
      </button>
    </article>
  )
}

function SampleNotice({ detailed = false }) {
  return (
    <div className="sample-notice">
      <span className="sample-marker" aria-hidden="true">i</span>
      <p><strong>디자인 확인용 샘플 데이터</strong>{detailed
        ? ' · 작품과 작가명·등록일·명작 인정 수는 모두 가상입니다. 필터·정렬은 샘플에만 적용되며 실제 기증·투표 결과가 아닙니다.'
        : ' · 실제 기증된 작품이 아닙니다. 회원가입 없이 둘러보는 데모 화면입니다.'}</p>
    </div>
  )
}

export function HomePage({ onUnavailable }) {
  return (
    <main id="main-content">
      <HeroExhibition />

      <section className="museum-intro" aria-label="박물관 소개"><div className="page-width intro-inner"><p className="eyebrow">EVERY EXCUSE TELLS A STORY.</p><p>그럴듯하지 않아도 괜찮습니다.<br /><strong>어쩌면, 그래서 더 예술적이니까요.</strong></p><span className="intro-symbol" aria-hidden="true">✳</span></div></section>

      <section className="preview-section page-width" aria-labelledby="preview-title">
        <div className="section-heading"><div><p className="eyebrow">A FIRST LOOK</p><h2 id="preview-title" className="section-title">오늘의 변명, 내일의 명작.</h2></div><a className="text-link" href="/gallery">상설 전시관 둘러보기 <Arrow /></a></div>
        <SampleNotice />
        <div className="artwork-grid preview-grid">{sampleArtworks.slice(0, 3).map((artwork) => <ArtworkCard key={artwork.id} artwork={artwork} onUnavailable={onUnavailable} />)}</div>
        <div className="donation-note"><span className="eyebrow">YOUR EXCUSE BELONGS HERE.</span><p>당신의 변명에도, 작품 번호를 붙여드립니다.</p><a className="text-link" href="/submit">작품 기증하기 <Arrow /></a></div>
      </section>
    </main>
  )
}

export function SampleCollection({ onUnavailable }) {
  const [category, setCategory] = useState('전체')
  const [order, setOrder] = useState('latest')
  const artworks = selectSampleArtworks(category, order)

  return (
    <details className="sample-collection">
      <summary>디자인 예시 전시 · 가상 작품 8점 둘러보기</summary>
      <section aria-label="가상 예시 작품 전시">
        <SampleNotice detailed />
        <div className="gallery-controls">
          <div className="category-filters" role="group" aria-label="예시 작품 카테고리">{categories.map((item) => <button key={item} type="button" aria-pressed={category === item} className={`category-button ${category === item ? 'is-active' : ''}`} onClick={() => setCategory(item)}>{item}<span aria-hidden="true">{item === '전체' ? sampleArtworks.length : sampleArtworks.filter((artwork) => artwork.category === item).length}</span></button>)}</div>
          <label className="sort-control">정렬<select value={order} onChange={(event) => setOrder(event.target.value)}><option value="latest">최신순 (샘플)</option><option value="popular">인기순 (샘플)</option></select></label>
        </div>
        <div className="gallery-result"><p role="status" aria-live="polite"><strong>{artworks.length}</strong>점의 샘플 작품 <span> / {category}</span></p><p>{order === 'latest' ? '가상 등록일 기준' : '가상 명작 인정 수 기준'} · 상세 감상 준비 중</p></div>
        <div className="artwork-grid">{artworks.map((artwork) => <ArtworkCard key={artwork.id} artwork={artwork} onUnavailable={onUnavailable} exhibition />)}</div>
        {artworks.length === 0 && <div className="empty-collection"><p>이 카테고리에는 샘플 작품이 없습니다.</p><button className="text-link" type="button" onClick={() => setCategory('전체')}>전체 작품 보기 →</button></div>}
        <p className="gallery-end">— END OF SAMPLE COLLECTION —</p>
      </section>
    </details>
  )
}
