import { useState } from 'react'
import { artworkImageUrl } from './artworkPresentation.js'
import antiqueFrame from './assets/museum-antique-gold-frame.png'
import './ArtworkVisual.css'

function ArtworkMedia({ artwork, imageUrl, size }) {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <span className="exhibition-stage" data-frame="antique-gold">
        <span className="exhibition-surface">
          {imageUrl && !failed ? (
            <img className="exhibition-image" src={imageUrl} alt={`${artwork.title} 작품 이미지`}
              loading={size === 'thumbnail' ? 'lazy' : 'eager'} decoding="async" onError={() => setFailed(true)} />
          ) : (
            <span className="exhibition-text">
              <span className="exhibition-edition">EXCUSE ME! / TEXT COLLECTION</span>
              <span className="exhibition-quote">{artwork.content}</span>
              <span className="exhibition-signature">{artwork.author}</span>
            </span>
          )}
        </span>
        <img className="exhibition-frame-overlay" src={antiqueFrame} alt="" aria-hidden="true"
          width="1024" height="1536" loading={size === 'thumbnail' ? 'lazy' : 'eager'} decoding="async" />
      </span>
      {failed && <span className="exhibition-image-note" role="status">이미지를 불러오지 못해 원문을 전시합니다.</span>}
    </>
  )
}

// Viewing only reads the saved representative URL; it never generates or uploads.
export default function ArtworkVisual({ artwork, size = 'thumbnail', tone = 'wine' }) {
  const imageUrl = artworkImageUrl(artwork)
  return (
    <span className={`exhibition-visual exhibition-visual--${size} exhibition-visual--${tone}`}>
      <ArtworkMedia key={imageUrl || 'text'} artwork={artwork} imageUrl={imageUrl} size={size} />
    </span>
  )
}
