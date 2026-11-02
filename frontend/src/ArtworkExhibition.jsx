import { useState } from 'react'
import { artworkDescription, artworkImageUrl } from './artworkPresentation.js'

function FramedImage({ imageUrl, title }) {
  const [failed, setFailed] = useState(false)
  if (!imageUrl || failed) {
    const message = failed ? '작품 이미지를 불러오지 못했습니다.' : '작품 이미지는 준비 중입니다.'
    return (
      <div className="detail-image-placeholder" role="img" aria-label={message}>
        <span className="placeholder-artwork-mark" aria-hidden="true">✳</span>
        <span className="eyebrow" aria-hidden="true">A SPACE FOR YOUR STORY</span>
        <p aria-hidden="true">{message}</p>
        <span className="placeholder-artwork-note" aria-hidden="true">{failed ? '작품 설명은 계속 감상할 수 있습니다.' : '그림이 놓일 자리에서, 먼저 이야기를 감상해 주세요.'}</span>
      </div>
    )
  }
  return <img className="detail-artwork-image" src={imageUrl} alt={`${title} 작품 이미지`} decoding="async" onError={() => setFailed(true)} />
}

// Data-driven exhibition view: no generation or upload request runs during viewing.
export default function ArtworkExhibition({ artwork }) {
  const description = artworkDescription(artwork)
  const imageUrl = artworkImageUrl(artwork)
  const donatedAt = new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Seoul',
  }).format(new Date(artwork.created_at))

  return (
    <article className="detail-exhibit" aria-labelledby="artwork-title">
      <figure className="detail-artwork">
        <div className="detail-frame"><div className="detail-image-mat"><div className="detail-image-surface">
          <FramedImage key={imageUrl || 'pending'} imageUrl={imageUrl} title={artwork.title} />
        </div></div></div>
        <figcaption><span>COLLECTION № {String(artwork.id).padStart(3, '0')}</span><span>{imageUrl ? '작품 이미지' : '이미지 준비 중'}</span></figcaption>
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
      </div>
    </article>
  )
}
