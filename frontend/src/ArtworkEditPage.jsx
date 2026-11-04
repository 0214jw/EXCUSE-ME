import useArtworkResource from './useArtworkResource.js'
import { ResourceNotice } from './ArtworkPages.jsx'
import { ArtworkEditForm } from './ArtworkManagement.jsx'
import { canManageArtwork } from './artworkManagement.js'

export default function ArtworkEditPage({ id }) {
  const resource = useArtworkResource(`/api/artworks/${encodeURIComponent(id)}`)
  const artwork = resource.data
  return (
    <main id="main-content" className="page-width donation-page">
      <div className="donation-heading"><p className="eyebrow">COLLECTION / EDIT YOUR ARTWORK</p><h1 className="section-title">내 작품 수정하기</h1></div>
      <ResourceNotice resource={resource} />
      {resource.status === 'success' && (canManageArtwork(artwork, resource.visitorId) ?
        <div className="donation-layout">
          <aside className="donation-guide"><h2>{artwork.title}</h2><p>작품명·핑계·카테고리·작가명과 저장된 작품 설명을 수정합니다.</p><p>소유자 구분은 브라우저에 저장한 방문객 ID에 따른 로컬 데모 기능이며 실제 인증이 아닙니다.</p><a className="text-link" href={`/artworks/${artwork.id}`}>작품 감상실로 돌아가기 ↗</a></aside>
          <ArtworkEditForm key={`${artwork.id}:${resource.visitorId}`} artwork={artwork} visitorId={resource.visitorId} />
        </div> : <div className="collection-notice" role="alert"><p>이 방문객 ID로 기증한 작품만 수정할 수 있습니다. 브라우저 저장소가 사라지거나 다른 브라우저를 사용하면 내 작품으로 구분되지 않습니다.</p><a className="text-link" href={`/artworks/${artwork.id}`}>작품 감상실로 돌아가기 ↗</a></div>)}
    </main>
  )
}
