import { useState } from 'react'
import { artworkImageUrl, artworkPosterExcerpt, artworkPosterTone } from './artworkPresentation.js'
import antiqueFrame from './assets/museum-antique-gold-frame.png'
import './ArtworkVisual.css'

function ArtworkMedia({ artwork, imageUrl, size, framed, gallery }) {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <span className="exhibition-stage" data-frame={framed ? 'antique-gold' : 'none'} data-media={imageUrl && !failed ? 'image' : 'text'}>
        <span className="exhibition-surface">
          {imageUrl && !failed ? (
            <img className="exhibition-image" src={imageUrl} alt={`${artwork.title} 작품 이미지`}
              loading={size === 'thumbnail' ? 'lazy' : 'eager'} decoding="async" onError={() => setFailed(true)} />
          ) : (
            <span className="exhibition-text">
              <span className={gallery ? 'exhibition-poster-edition' : 'exhibition-edition'}>EXCUSE ME! / TEXT COLLECTION</span>
              <span className="exhibition-quote">{gallery ? artworkPosterExcerpt(artwork.content) : artwork.content}</span>
              {gallery ? <span className="exhibition-poster-footer"><span>{artwork.category}</span><span>COLLECTION № {String(artwork.id).padStart(3, '0')}</span></span> : <span className="exhibition-signature">{artwork.author}</span>}
            </span>
          )}
        </span>
        {framed && <img className="exhibition-frame-overlay" src={antiqueFrame} alt="" aria-hidden="true"
          width="1024" height="1536" loading={size === 'thumbnail' ? 'lazy' : 'eager'} decoding="async" />}
      </span>
      {failed && <span className="exhibition-image-note" role="status">이미지를 불러오지 못해 원문을 전시합니다.</span>}
    </>
  )
}

// Viewing only reads the saved representative URL; it never generates or uploads.
export default function ArtworkVisual({ artwork, size = 'thumbnail', tone = 'wine', framed = false, presentation = 'default' }) {
  const imageUrl = artworkImageUrl(artwork)
  const gallery = presentation === 'gallery' && !framed
  const visualTone = gallery ? artworkPosterTone(artwork) : tone
  return (
    <span className={`exhibition-visual exhibition-visual--${size} exhibition-visual--${visualTone}${framed ? ' exhibition-visual--framed' : ''}${gallery ? ' exhibition-visual--gallery' : ''}`}>
      <ArtworkMedia key={imageUrl || 'text'} artwork={artwork} imageUrl={imageUrl} size={size} framed={framed} gallery={gallery} />
    </span>
  )
}
