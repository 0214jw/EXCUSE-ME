import { artworkDescription, artworkImageUrl } from './artworkPresentation.js'
import ArtworkVisual from './ArtworkVisual.jsx'

// Data-driven exhibition view: no generation or upload request runs during viewing.
export default function ArtworkExhibition({ artwork, actions = null }) {
  const description = artworkDescription(artwork)
  const imageUrl = artworkImageUrl(artwork)
  const donatedAt = new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Seoul',
  }).format(new Date(artwork.created_at))

  return (
    <article className="detail-exhibit" aria-labelledby="artwork-title">
      <figure className="detail-artwork">
        <ArtworkVisual artwork={artwork} size="large" />
        <figcaption><span>COLLECTION № {String(artwork.id).padStart(3, '0')}</span><span>{imageUrl ? '작품 이미지 · 원본 비율' : '텍스트 작품 · 원문 전체는 작품 정보에서'}</span></figcaption>
      </figure>
      <div className="detail-label">
        <h1 id="artwork-title">{artwork.title}</h1>
        <p className="detail-author">작가 · {artwork.author}</p>
        <section className="detail-description" aria-labelledby="description-title">
          <h2 id="description-title">작품 설명</h2>
          <p className="detail-description-text">{description.text}</p>
          {description.temporary && <p className="detail-description-note">원문 핑계를 바탕으로 한 임시 설명입니다.</p>}
        </section>
        <details className="detail-original"><summary>원문 핑계 확인하기</summary><p>{artwork.content}</p></details>
        <dl>
          <div><dt>기증 날짜</dt><dd><time dateTime={artwork.created_at}>{donatedAt}</time></dd></div>
          <div><dt>카테고리</dt><dd>{artwork.category}</dd></div>
        </dl>
        <a className="museum-button secondary" href="/submit">나의 핑계도 기증하기 ＋</a>
        {actions}
      </div>
    </article>
  )
}
