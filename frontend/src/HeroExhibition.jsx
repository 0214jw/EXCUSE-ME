import { useState } from 'react'
import sculptureImage from './assets/the-birth-of-an-excuse-cutout.png'
import antiqueFrame from './assets/museum-antique-gold-frame.png'
import './HeroExhibition.css'

const backgroundStudies = [
  { number: '01', tone: 'wine', quote: '미완성이 아니라,\n숙성 중입니다.' },
  { number: '02', tone: 'ink', quote: '마음은 벌써\n도착했습니다.' },
  { number: '03', tone: 'paper', quote: '의지는 있었으나,\n중력이 강했습니다.' },
  { number: '04', tone: 'olive', quote: '알람과 저의\n진술이 다릅니다.' },
]

export default function HeroExhibition() {
  const [imageUnavailable, setImageUnavailable] = useState(false)

  return (
    <section className="poster-hero page-width" aria-labelledby="hero-title">
      <div className="poster-topline">
        <p className="eyebrow">EXCUSE ME! / DIGITAL MUSEUM</p>
        <span>A COLLECTION OF BEAUTIFUL EXCUSES</span>
      </div>

      <div className="poster-wall">
        <div className="poster-gallery" aria-hidden="true">
          {backgroundStudies.map((study) => (
            <div className={'poster-frame poster-frame-' + study.number + ' poster-frame-' + study.tone} key={study.number}>
              <span className="poster-frame-stage">
                <span className="poster-frame-canvas"><span>{study.quote}</span><small>EXCUSE STUDY / {study.number}</small></span>
                <img className="poster-frame-overlay" src={antiqueFrame} width="1024" height="1536" alt="" decoding="async" />
              </span>
            </div>
          ))}
        </div>

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

        <span className="poster-side-note" aria-hidden="true">EVERY EXCUSE DESERVES AN EXHIBITION.</span>
        <span className="poster-edition" aria-hidden="true">EXHIBITION / 01</span>
      </div>

      <div className="poster-information">
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
