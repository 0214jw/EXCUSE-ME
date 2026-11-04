import { useEffect, useRef, useState } from 'react'
import HealthCheck from './HealthCheck.jsx'
import { HomePage } from './MuseumPages.jsx'
import { ArtworkDetailPage, GalleryPage, SubmitPage } from './ArtworkPages.jsx'
import { getVisitorId } from './visitor.js'
import ArtworkEditPage from './ArtworkEditPage.jsx'
import HallOfFamePage from './HallOfFame.jsx'

const notices = {
  detail: { title: '디자인 확인용 예시 작품입니다.', message: '이 작품과 작가명·좋아요 수는 가상이며 DB에 저장된 작품이 아닙니다. 실제 기증 작품은 상설 전시관 위쪽에서 감상할 수 있습니다.' },
}

function Brand() {
  return <a className="brand" href="/" aria-label="EXCUSE ME! 박물관 홈"><span className="brand-symbol" aria-hidden="true">✳</span><span>EXCUSE ME!<small>THE MUSEUM OF EXCUSES</small></span></a>
}

export default function App() {
  // Plain links use Vite's SPA fallback, with native history and direct URL access.
  // These public pages do not require an additional routing library.
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const dialogRef = useRef(null)
  const [notice, setNotice] = useState(notices.detail)
  useEffect(() => {
    try { getVisitorId() } catch { /* Registration presents storage errors without blocking browsing. */ }
  }, [])

  function onUnavailable(kind) {
    setNotice(notices[kind])
    if (!dialogRef.current.open) dialogRef.current.showModal()
  }

  let page
  if (path === '/') page = <HomePage onUnavailable={onUnavailable} />
  else if (path === '/gallery') page = <GalleryPage onUnavailable={onUnavailable} />
  else if (path === '/health') page = <HealthCheck />
  else if (path === '/submit') page = <SubmitPage />
  else if (path === '/hall-of-fame') page = <HallOfFamePage />
  else if (/^\/artworks\/[^/]+\/edit$/.test(path)) page = <ArtworkEditPage id={path.split('/')[2]} />
  else if (/^\/artworks\/[^/]+$/.test(path)) page = <ArtworkDetailPage id={path.split('/')[2]} />
  else {
    page = (
      <main id="main-content" className="page-width placeholder-page">
        <p className="eyebrow">EXCUSE ME! / INFORMATION</p>
        <h1 className="section-title">전시실을 찾을 수 없습니다.</h1>
        <p>주소를 확인하거나 상설 전시관으로 돌아가 주세요.</p>
        <a className="museum-button primary" href="/gallery">전시관으로 돌아가기 ↗</a>
      </main>
    )
  }

  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="site-header">
        <div className="page-width header-inner">
          <Brand />
          <nav aria-label="상단 내비게이션">
            <a href="/" aria-current={path === '/' ? 'page' : undefined}>박물관 소개</a>
            <a href="/gallery" aria-current={path === '/gallery' ? 'page' : undefined}>상설 전시관</a>
            <a href="/hall-of-fame" aria-current={path === '/hall-of-fame' ? 'page' : undefined}>명예의 전당</a>
          </nav>
          <a className="header-donate" href="/submit" aria-current={path === '/submit' ? 'page' : undefined}>작품 기증하기 <span aria-hidden="true">↗</span></a>
        </div>
      </header>
      {page}
      <footer className="site-footer">
        <div className="page-width footer-top"><Brand /><p>모든 변명에는, 나름의 사정이 있다.</p><a className="health-link" href="/health" aria-current={path === '/health' ? 'page' : undefined}>서버 연결 확인 ↗</a></div>
        <div className="page-width footer-bottom"><span>EXCUSE ME! · ABSURD ART MUSEUM</span><span>회원가입 없는 데모 · 기증한 텍스트 작품은 저장·공개됩니다.</span></div>
      </footer>
      <dialog ref={dialogRef} className="museum-dialog" aria-labelledby="notice-title" aria-describedby="notice-message">
        <p className="eyebrow">COMING SOON</p>
        <h2 id="notice-title">{notice.title}</h2>
        <p id="notice-message">{notice.message}</p>
        <form method="dialog"><button className="museum-button primary" autoFocus>확인</button></form>
      </dialog>
    </>
  )
}
