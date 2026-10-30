import { useRef, useState } from 'react'
import HealthCheck from './HealthCheck.jsx'
import { GalleryPage, HomePage } from './MuseumPages.jsx'

const notices = {
  submit: { title: '작품 기증은 준비 중입니다.', message: '아직 작품을 등록할 수 없습니다. 지금은 디자인 확인용 샘플 전시를 둘러보세요.' },
  detail: { title: '작품 감상실은 준비 중입니다.', message: '현재 카드는 디자인 확인용 샘플입니다. 작품의 실제 상세 조회와 명작 인정 기능은 다음 개발 단계에서 만나요.' },
  hall: { title: '명예의 전당은 준비 중입니다.', message: '실제 투표와 순위는 아직 제공하지 않습니다. 전시관의 인기순은 가상 인정 수로 정렬하는 샘플입니다.' },
}

function Brand() {
  return <a className="brand" href="/" aria-label="EXCUSE ME! 박물관 홈"><span className="brand-symbol" aria-hidden="true">✳</span><span>EXCUSE ME!<small>THE MUSEUM OF EXCUSES</small></span></a>
}

export default function App() {
  // Plain links use Vite's SPA fallback, with native history and direct URL access.
  // These public pages do not require an additional routing library.
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const dialogRef = useRef(null)
  const [notice, setNotice] = useState(notices.submit)

  function onUnavailable(kind) {
    setNotice(notices[kind])
    if (!dialogRef.current.open) dialogRef.current.showModal()
  }

  let page
  if (path === '/') page = <HomePage onUnavailable={onUnavailable} />
  else if (path === '/gallery') page = <GalleryPage onUnavailable={onUnavailable} />
  else if (path === '/health') page = <HealthCheck />
  else {
    const futurePage = path === '/submit' ? notices.submit : path === '/hall-of-fame' ? notices.hall : /^\/artworks\/[^/]+$/.test(path) ? notices.detail : null
    page = (
      <main id="main-content" className="page-width placeholder-page">
        <p className="eyebrow">EXCUSE ME! / INFORMATION</p>
        <h1 className="section-title">{futurePage?.title || '전시실을 찾을 수 없습니다.'}</h1>
        <p>{futurePage?.message || '주소를 확인하거나 상설 전시관으로 돌아가 주세요.'}</p>
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
            <button type="button" onClick={() => onUnavailable('hall')}>명예의 전당<span className="coming-soon">준비 중</span></button>
          </nav>
          <button className="header-donate" type="button" onClick={() => onUnavailable('submit')}>작품 기증하기 <span aria-hidden="true">↗</span></button>
        </div>
      </header>
      {page}
      <footer className="site-footer">
        <div className="page-width footer-top"><Brand /><p>모든 변명에는, 나름의 사정이 있다.</p><a className="health-link" href="/health" aria-current={path === '/health' ? 'page' : undefined}>서버 연결 확인 ↗</a></div>
        <div className="page-width footer-bottom"><span>EXCUSE ME! · ABSURD ART MUSEUM</span><span>디자인 확인용 데모 · 실제 작품 저장 없음</span></div>
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
