import { useEffect, useRef, useState } from 'react'
import ArtworkVisual from './ArtworkVisual.jsx'
import { artworkDescription } from './artworkPresentation.js'
import { createRandomArtworkLoader } from './randomArtwork.js'
import './RandomArtwork.css'

export function RandomExhibition({ resource, onNext }) {
  const artwork = resource.data
  if (resource.status === 'loading' && !artwork) return <div className="collection-notice" role="status">오늘의 인연이 될 작품을 찾고 있습니다…</div>
  return <>
    {resource.status === 'error' && <div className="collection-notice error-notice" role="alert">
      <p>새 작품을 불러오지 못했습니다. {resource.error.message}</p>
      {artwork && <p>앞서 만난 작품을 그대로 전시하고 있습니다.</p>}
      <button className="text-link" type="button" disabled={resource.pending} onClick={onNext}>다시 시도하기 ↗</button>
      <a className="text-link" href="/gallery">상설 전시관 ↗</a>
    </div>}
    {resource.status === 'success' && !artwork && <div className="empty-collection">
      <p>아직 운명처럼 만날 기증 작품이 없습니다. 첫 번째 전시를 열어 주세요.</p>
      <a className="museum-button primary" href="/submit">작품 기증하기 ＋</a>
      <button className="text-link" type="button" disabled={resource.pending} onClick={onNext}>다시 찾아보기 ↗</button>
    </div>}
    {artwork && <article className="detail-exhibit random-exhibit" aria-labelledby="random-artwork-title">
      <figure className="detail-artwork"><ArtworkVisual key={artwork.id} artwork={artwork} size="large" />
        <figcaption><span>우연히 마주한 소장품</span><span>COLLECTION № {String(artwork.id).padStart(3, '0')}</span></figcaption>
      </figure>
      <div className="detail-label">
        <p className="eyebrow">AN UNEXPECTED ENCOUNTER</p>
        <h2 id="random-artwork-title">{artwork.title}</h2>
        <p className="detail-author">작가 · {artwork.author}</p>
        <section className="detail-description" aria-labelledby="random-description-title">
          <h3 id="random-description-title">작품 설명</h3>
          <p className="detail-description-text">{artworkDescription(artwork).text}</p>
          {artworkDescription(artwork).temporary && <p className="detail-description-note">원문 핑계를 바탕으로 한 임시 설명입니다.</p>}
        </section>
        <dl>
          <div><dt>카테고리</dt><dd>{artwork.category}</dd></div>
          <div><dt>좋아요</dt><dd>{artwork.recognition_count ?? '—'}</dd></div>
        </dl>
        <div className="random-actions">
          <button className="museum-button primary" type="button" disabled={resource.pending} onClick={onNext}>
            {resource.pending ? '작품을 만나는 중…' : '다른 작품 만나기'}</button>
          <a className="museum-button secondary" href={`/artworks/${artwork.id}`}>작품 자세히 보기 ↗</a>
        </div>
        <p className="random-status" role="status" aria-live="polite">{resource.pending ? '다음 작품을 찾고 있습니다.' : '좋아요와 작품 관리는 상세 감상실에서 이용할 수 있습니다.'}</p>
      </div>
    </article>}
  </>
}

export default function RandomArtworkPage() {
  const [resource, setResource] = useState({ status: 'loading', data: null, error: null, pending: true })
  const loader = useRef(null)
  useEffect(() => {
    const current = createRandomArtworkLoader(setResource)
    loader.current = current
    current.load()
    return () => { current.dispose(); loader.current = null }
  }, [])
  return <main id="main-content" className="page-width gallery-page random-page">
    <section aria-labelledby="random-title">
      <div className="gallery-heading"><div><p className="eyebrow">A CHANCE ENCOUNTER / THE MUSEUM OF EXCUSES</p>
        <h1 id="random-title">운명의 작품 만나기<span className="title-period">.</span></h1>
        <p className="gallery-description">고르지 않았기에 만날 수 있는, 오늘의 한 작품.</p>
      </div><a className="text-link" href="/gallery">상설 전시관 ↗</a></div>
      <RandomExhibition resource={resource} onNext={() => loader.current?.load()} />
    </section>
  </main>
}
