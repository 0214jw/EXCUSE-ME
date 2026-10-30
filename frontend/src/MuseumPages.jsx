import { useState } from 'react'
import { categories, sampleArtworks, sampleNumber, selectSampleArtworks } from './sampleArtworks.js'

function Arrow() {
  return <span aria-hidden="true">↗</span>
}

function ArtworkCard({ artwork, onUnavailable }) {
  return (
    <article className="artwork-card" aria-labelledby={`artwork-${artwork.id}`}>
      <button type="button" className="artwork-open" aria-label={`${artwork.title} — 작품 상세 준비 중 안내`} onClick={() => onUnavailable('detail')}>
        <span className={`artwork-frame tone-${artwork.tone}`}>
          <span className="frame-canvas">
            <span className="canvas-edition">EXCUSE ME! / TEXT COLLECTION</span>
            <span className="canvas-quote">{artwork.quote}</span>
            <span className="canvas-signature">{artwork.author}</span>
          </span>
        </span>
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
  const featured = sampleArtworks[0]
  return (
    <main id="main-content">
      <section className="hero page-width" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="tiny-star" aria-hidden="true">✳</span> ABSURD ART MUSEUM</p>
          <h1 id="hero-title">세상에서 가장<br />쓸데없고,<br />가장 <em>창의적인</em><br />변명들의 박물관</h1>
          <p className="hero-description">누군가의 황당한 핑계가, 누군가에겐 한 편의 명작.<br className="desktop-break" /> 일상의 변명을 전시하고 함께 웃는 작은 박물관입니다.</p>
          <div className="hero-actions">
            <a className="museum-button primary" href="/gallery">전시 관람하기 <Arrow /></a>
            <button className="museum-button secondary" type="button" onClick={() => onUnavailable('submit')}>작품 기증하기 <span aria-hidden="true">＋</span></button>
          </div>
          <p className="hero-footnote">입장료는 없습니다. 그럴듯한 변명 하나면 충분합니다.</p>
        </div>
        <div className="hero-exhibit">
          <div className="exhibit-topline"><span>THIS WEEK’S SAMPLE</span><span>COLLECTION / 001</span></div>
          <div className="hero-frame"><div className="hero-canvas"><span className="canvas-edition">A STUDY OF EVERYDAY EXCUSES</span><span className="hero-quote">“의지는<br />있었으나,<br /><em>중력이</em><br />강했습니다.”</span><span className="canvas-signature">— {featured.author}</span></div></div>
          <div className="exhibit-caption"><div><span className="eyebrow">SAMPLE № {sampleNumber(featured.id)} / 지각</span><p>{featured.title}</p></div><span className="museum-seal" aria-label="변명도 예술이 된다">변명도<br />예술이 된다</span></div>
          <p className="exhibit-note">디자인 확인용 샘플 작품 · 가상 작가</p>
        </div>
      </section>

      <section className="museum-intro" aria-label="박물관 소개"><div className="page-width intro-inner"><p className="eyebrow">EVERY EXCUSE TELLS A STORY.</p><p>그럴듯하지 않아도 괜찮습니다.<br /><strong>어쩌면, 그래서 더 예술적이니까요.</strong></p><span className="intro-symbol" aria-hidden="true">✳</span></div></section>

      <section className="preview-section page-width" aria-labelledby="preview-title">
        <div className="section-heading"><div><p className="eyebrow">A FIRST LOOK</p><h2 id="preview-title" className="section-title">오늘의 변명, 내일의 명작.</h2></div><a className="text-link" href="/gallery">상설 전시관 둘러보기 <Arrow /></a></div>
        <SampleNotice />
        <div className="artwork-grid preview-grid">{sampleArtworks.slice(0, 3).map((artwork) => <ArtworkCard key={artwork.id} artwork={artwork} onUnavailable={onUnavailable} />)}</div>
        <div className="donation-note"><span className="eyebrow">YOUR EXCUSE BELONGS HERE.</span><p>당신의 변명에도, 작품 번호가 붙는 날이 옵니다.</p><button className="text-link" type="button" onClick={() => onUnavailable('submit')}>작품 기증 안내 <Arrow /></button></div>
      </section>
    </main>
  )
}

export function GalleryPage({ onUnavailable }) {
  const [category, setCategory] = useState('전체')
  const [order, setOrder] = useState('latest')
  const artworks = selectSampleArtworks(category, order)

  return (
    <main id="main-content" className="page-width gallery-page">
      <section aria-labelledby="gallery-title">
        <div className="gallery-heading"><div><p className="eyebrow">THE PERMANENT COLLECTION / EXHIBITION 01</p><h1 id="gallery-title">상설 전시관<span className="title-period">.</span></h1><p className="gallery-description">사소한 핑계도, 여기서는 근사한 작품이 됩니다.</p></div><span className="gallery-index" aria-hidden="true">08<span>EXCUSES<br />ON DISPLAY</span></span></div>
        <SampleNotice detailed />
        <div className="gallery-controls">
          <div className="category-filters" role="group" aria-label="작품 카테고리">{categories.map((item) => <button key={item} type="button" aria-pressed={category === item} className={`category-button ${category === item ? 'is-active' : ''}`} onClick={() => setCategory(item)}>{item}<span aria-hidden="true">{item === '전체' ? sampleArtworks.length : sampleArtworks.filter((artwork) => artwork.category === item).length}</span></button>)}</div>
          <label className="sort-control">정렬<select value={order} onChange={(event) => setOrder(event.target.value)}><option value="latest">최신순 (샘플)</option><option value="popular">인기순 (샘플)</option></select></label>
        </div>
        <div className="gallery-result"><p role="status" aria-live="polite"><strong>{artworks.length}</strong>점의 샘플 작품 <span> / {category}</span></p><p>{order === 'latest' ? '가상 등록일 기준' : '가상 명작 인정 수 기준'} · 상세 감상 준비 중</p></div>
        <div className="artwork-grid">{artworks.map((artwork) => <ArtworkCard key={artwork.id} artwork={artwork} onUnavailable={onUnavailable} />)}</div>
        {artworks.length === 0 && <div className="empty-collection"><p>이 카테고리에는 샘플 작품이 없습니다.</p><button className="text-link" type="button" onClick={() => setCategory('전체')}>전체 작품 보기 →</button></div>}
        <p className="gallery-end">— END OF SAMPLE COLLECTION —</p>
      </section>
    </main>
  )
}
