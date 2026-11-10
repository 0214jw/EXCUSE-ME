import { useLayoutEffect, useRef, useState } from 'react'
import sculptureImage from './assets/the-birth-of-an-excuse-cutout.png'
import useArtworkResource from './useArtworkResource.js'
import HeroArtworkAssembly from './HeroArtworkAssembly.jsx'
import { observeHeroAssembly, selectHeroArtworks } from './heroAssembly.js'
import './HeroExhibition.css'

export default function HeroExhibition() {
  const [imageUnavailable, setImageUnavailable] = useState(false)
  const resource = useArtworkResource('/api/artworks')
  const artworks = selectHeroArtworks(resource.status === 'success' ? resource.data : null)
  const scene = useRef(null), pin = useRef(null), installation = useRef(null)
  const hasArtworks = artworks.length > 0

  useLayoutEffect(() => {
    return observeHeroAssembly(scene.current, pin.current, installation.current, document.querySelector('.site-header'))
  }, [hasArtworks, resource.data])

  return (
    <section className="poster-hero" data-assembly={hasArtworks ? 'true' : 'false'} aria-labelledby="hero-title">
     <div ref={scene} className="hero-scroll-scene" data-assembly={hasArtworks ? 'true' : 'false'}>
      <div ref={pin} className="hero-pin">
      <div className="poster-topline">
        <p className="eyebrow">EXCUSE ME! / DIGITAL MUSEUM</p>
        <span>A COLLECTION OF BEAUTIFUL EXCUSES</span>
      </div>

      <div ref={installation} className="hero-installation">
       <div className="poster-wall">

        <h1 id="hero-title" className="poster-slogan" aria-label="EXCUSE ME! — The Birth of an Excuse">EXCUSE ME!</h1>

        <div className="poster-plinth" aria-hidden="true" />
        <figure className="poster-object">
          {imageUnavailable ? (
            <div className="poster-fallback" role="status">
              <p>조형물 이미지를 불러오지 못했습니다.</p>
              <span>작품 설명과 전시 관람은 계속 이용할 수 있습니다.</span>
            </div>
          ) : (
            <img
              src={sculptureImage}
              width="1024"
              height="1536"
              alt="턱을 괴고 깊이 생각하는 흰색 인물 조각상. 배경 없이 분리된 조형물이 전시 받침대 위에 놓여 있습니다."
              fetchPriority="high"
              loading="eager"
              decoding="async"
              onError={() => setImageUnavailable(true)}
            />
          )}
          <figcaption className="poster-object-caption">디지털 조형물 · 전시 연출</figcaption>
        </figure>

        <span className="poster-edition" aria-hidden="true">EXHIBITION / 01</span>
       </div>
       <HeroArtworkAssembly artworks={artworks} />
      </div>

      </div>
     </div>
      <div className="poster-information page-width">
        <div className="poster-label">
          <p className="eyebrow">The Birth of an Excuse</p>
          <h2>그럴듯한 사유</h2>
          <blockquote>“조금만 더 생각하면, 완벽한 변명이 나올 것 같았습니다.”</blockquote>
        </div>
        <div className="poster-visit">
          <p>모든 핑계에는 전시될 자격이 있다.</p>
          <div className="poster-actions">
            <a className="museum-button primary" href="/gallery">전시 관람하기 <span aria-hidden="true">↗</span></a>
            <a className="museum-button secondary" href="/submit">작품 기증하기 <span aria-hidden="true">＋</span></a>
          </div>
        </div>
      </div>
    </section>
  )
}
