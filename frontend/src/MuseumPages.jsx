import { useState } from 'react'
import { categories, sampleArtworks, selectSampleArtworks } from './sampleArtworks.js'
import HeroExhibition from './HeroExhibition.jsx'
import ArtworkVisual from './ArtworkVisual.jsx'
import BrandIntro from './BrandIntro.jsx'
import './ArtworkCard.css'

function ArtworkCard({ artwork, onUnavailable, presentation = 'default' }) {
  return (
    <article className="artwork-card" aria-labelledby={`artwork-${artwork.id}`}>
      <button type="button" className="artwork-open" aria-label={`${artwork.title} — 예시 작품 안내`} onClick={() => onUnavailable('detail')}>
        <ArtworkVisual artwork={{ ...artwork, content: presentation === 'gallery' ? artwork.content : artwork.quote }} tone={artwork.tone} presentation={presentation} />
        <span className="artwork-label artwork-label--minimal">
          <span id={`artwork-${artwork.id}`} role="heading" aria-level="3" className="artwork-title">{artwork.title}</span>
          <span className="artwork-author">가상 작가 · {artwork.author}</span>
          <span className="artwork-metadata"><span>{artwork.category}</span><span>좋아요 {artwork.sampleRecognitions} · 예시</span></span>
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
        ? ' · 작품과 작가명·등록일·좋아요 수는 모두 가상입니다. 필터·정렬은 샘플에만 적용되며 실제 기증·좋아요 결과가 아닙니다.'
        : ' · 실제 기증된 작품이 아닙니다. 회원가입 없이 둘러보는 데모 화면입니다.'}</p>
    </div>
  )
}

export function HomePage() {
  return (
    <main id="main-content" className="landing-page">
      <BrandIntro />
      <HeroExhibition />
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
        <div className="gallery-result"><p role="status" aria-live="polite"><strong>{artworks.length}</strong>점의 샘플 작품 <span> / {category}</span></p><p>{order === 'latest' ? '가상 등록일 기준' : '가상 좋아요 수 기준'} · 예시 전시</p></div>
        <div className="artwork-grid">{artworks.map((artwork) => <ArtworkCard key={artwork.id} artwork={artwork} onUnavailable={onUnavailable} presentation="gallery" />)}</div>
        {artworks.length === 0 && <div className="empty-collection"><p>이 카테고리에는 샘플 작품이 없습니다.</p><button className="text-link" type="button" onClick={() => setCategory('전체')}>전체 작품 보기 →</button></div>}
        <p className="gallery-end">— END OF SAMPLE COLLECTION —</p>
      </section>
    </details>
  )
}
