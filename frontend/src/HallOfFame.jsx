import useArtworkResource from './useArtworkResource.js'
import { LiveArtworkCard } from './ArtworkPages.jsx'
import './HallOfFame.css'

export function HallExhibition({ resource }) {
  if (resource.status === 'loading') return <div className="collection-notice" role="status">명예의 전당 소장품을 불러오는 중입니다…</div>
  if (resource.status === 'error') return <div className="collection-notice error-notice" role="alert">
    <p>명예의 전당을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
    <button className="text-link" type="button" onClick={resource.reload}>다시 불러오기 ↗</button>
    <a className="text-link" href="/gallery">상설 전시관 ↗</a>
  </div>
  const artworks = resource.data
  if (!artworks.length) return <div className="empty-collection"><p>아직 명예의 전당에 전시할 기증 작품이 없습니다.</p><a className="museum-button primary" href="/submit">첫 작품 기증하기 ＋</a></div>
  return <>
    <p className="hall-caption">이번 달(한국 시간)에 등록된 작품 중 좋아요 수로 정렬한 TOP 10 · 현재 {artworks.length}점 · 동점이면 등록일, 작품 번호가 빠른 순서로 전시합니다.</p>
    <ol className="artwork-grid hall-grid" aria-label="명예의 전당 순위">
      {artworks.map((artwork, index) => <li key={artwork.id}><LiveArtworkCard artwork={artwork} rank={index + 1} /></li>)}
    </ol>
  </>
}

export default function HallOfFamePage() {
  const resource = useArtworkResource('/api/hall-of-fame')
  return <main id="main-content" className="page-width gallery-page hall-page">
    <section aria-labelledby="hall-title">
      <div className="gallery-heading"><div><p className="eyebrow">THE HALL OF FAME / VISITORS’ CHOICE</p><h1 id="hall-title">명예의 전당<span className="title-period">.</span></h1><p className="gallery-description">가장 많은 사람이 속아준 핑계 · 이번 달의 TOP 10.</p></div><a className="museum-button secondary" href="/gallery">상설 전시관 ↗</a></div>
      <HallExhibition resource={resource} />
    </section>
  </main>
}
