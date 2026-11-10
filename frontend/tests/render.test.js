import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('real React pages render donation links, form, separate samples and preserved sculpture hero', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  const previousWindow = globalThis.window
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.jsx')
    const render = (pathname) => {
      globalThis.window = { location: { pathname } }
      return renderToStaticMarkup(React.createElement(App))
    }
    const home = render('/')
    assert.match(home, /<header[^>]*class="site-header site-header--landing site-header--dark"[^>]*data-theme="dark"/)
    assert.match(home, /<svg class="brand-symbol"[^>]*stroke="currentColor"/)
    const navigation = home.match(/<nav[^>]*>[\s\S]*?<\/nav>/)[0]
    assert.equal((navigation.match(/<a /g) || []).length, 3)
    for (const href of ['/', '/gallery', '/hall-of-fame']) assert.ok(navigation.includes(`href="${href}"`))
    for (const path of ['/gallery', '/artworks/1', '/submit', '/artworks/1/edit', '/hall-of-fame']) {
      const page = render(path)
      assert.match(page, /<header[^>]*class="site-header"[^>]*data-theme="light"/)
      assert.doesNotMatch(page, /site-header--dark|site-header--landing/)
      assert.doesNotMatch(page, /href="\/random"|운명의 작품 만나기/)
    }
    assert.match(home, /그럴듯한 사유/)
    assert.match(home, /the-birth-of-an-excuse-cutout/)
    assert.match(home, /class="poster-object"/)
    assert.match(home, /class="poster-slogan"/)
    assert.doesNotMatch(home, /excuse-me-hero\.png/)
    const main = home.slice(home.indexOf('<main'), home.indexOf('</main>') + '</main>'.length)
    const hero = main.slice(main.indexOf('<section class="poster-hero'), main.lastIndexOf('</main>'))
    assert.equal((hero.match(/<img /g) || []).length, 1) // sculpture remains without fake works while the real list loads
    assert.doesNotMatch(hero, /poster-study|EXCUSE STUDY/)
    assert.match(hero, /data-assembly="false"/)
    assert.doesNotMatch(hero, /poster-frame-overlay|poster-frame-mat|museum-antique-gold-frame\.png/)
    assert.match(home, /<main id="main-content" class="landing-page"/)
    assert.match(home, /<p class="brand-intro-copy">그럴듯한 사정들을 수집합니다\.<\/p>/)
    assert.equal((main.match(/<section\b/g) || []).length, 2)
    assert.match(main, /^<main[^>]*><section class="brand-intro"/)
    assert.match(main, /<\/section><section class="poster-hero/)
    assert.match(home, /<\/section><\/main><footer class="site-footer">/)
    assert.doesNotMatch(main, /museum-intro|preview-section|preview-grid|preview-title|collection-subtitle|donation-note|sample-notice|artwork-card|data-frame=/)
    assert.match(hero, /href="\/gallery">전시 관람하기/)
    assert.match(hero, /href="\/submit">작품 기증하기/)
    assert.doesNotMatch(hero, /<a[^>]*>\s*<img/)
    assert.equal((hero.match(/href="\/gallery"/g) || []).length, 1)
    assert.equal((hero.match(/href="\/submit"/g) || []).length, 1)
    assert.equal((home.match(/href="\/submit"/g) || []).length, 2) // header + existing Hero CTA
    const submit = render('/submit')
    for (const name of ['title', 'content', 'category', 'author']) assert.ok(submit.includes(`name="${name}"`))
    for (const category of ['지각·조퇴', '휴가·병가', '약속', '운동', '기타']) assert.ok(submit.includes(`<option value="${category}">`))
    assert.equal((submit.match(/<option value=/g) || []).length, 6) // placeholder + five choices
    assert.doesNotMatch(submit, /type="file"/)
    assert.match(submit, /실제 인증 수단은 아닙니다/)
    const gallery = render('/gallery')
    assert.match(gallery, /<h1 id="gallery-title">상설 전시관/)
    assert.match(gallery, /기증 작품 카테고리/)
    assert.match(gallery, /<details class="sample-collection">/)
    assert.match(gallery, /가상 작품 8점/)
    assert.equal((gallery.match(/<article /g) || []).length, 8) // all eight are inside the separate samples
    assert.equal((gallery.match(/data-frame="none"/g) || []).length, 8)
    assert.equal((gallery.match(/class="exhibition-frame-overlay"/g) || []).length, 0)
    assert.doesNotMatch(gallery, /museum-antique-gold-frame\.png/)
    assert.doesNotMatch(gallery, /walnut|exhibition-mat/)
    assert.doesNotMatch(gallery, /class="artwork-frame/)
    assert.doesNotMatch(home, /class="artwork-frame|exhibition-frame-overlay/)
    assert.equal((home.match(/data-frame="none"/g) || []).length, 0)
    assert.match(render('/artworks/1'), /모셔오는 중/)
    assert.match(render('/artworks/1/edit'), /내 작품 수정하기/)
    assert.match(render('/health'), /서버 연결 확인/)
    const hall = render('/hall-of-fame')
    assert.match(hall, /id="hall-title"/)
    assert.match(hall, /가장 많은 사람이 속아준 핑계 · 이번 달의 TOP 3/)
    assert.match(hall, /명예의 전당 소장품을 불러오는 중/)
    assert.match(home, /href="\/hall-of-fame"/)
    assert.match(gallery, /option value="popular"/)
    assert.doesNotMatch(home, /href="\/random"|운명의 작품 만나기/)
    for (const path of ['/random', '/random/', '/artworks/random', '/artworks/random/edit']) {
      const retired = render(path)
      assert.match(retired, /전시실을 찾을 수 없습니다/)
      assert.match(retired, /href="\/gallery">전시관으로 돌아가기/)
      assert.match(retired, /class="site-footer"/)
      assert.doesNotMatch(retired, /href="\/random"|운명의 작품 만나기|random-page|random-title|모셔오는 중/)
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    await server.close()
  }
})

test('exhibition renders frameless image separately from ordered information, preserving legacy text works', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { default: Exhibition } = await server.ssrLoadModule('/src/ArtworkExhibition.jsx')
    const artwork = { id: 42, title: '이불의 중력', author: '익명의 예술가', content: '이불의 중력이 너무 강해 오늘도 늦었습니다.', category: '지각·조퇴', created_at: '2026-11-02T00:00:00Z' }
    const legacy = renderToStaticMarkup(React.createElement(Exhibition, { artwork }))
    assert.match(legacy, /exhibition-visual--large/)
    assert.match(legacy, /exhibition-visual--gallery/)
    assert.match(legacy, /exhibition-poster-edition/)
    assert.match(legacy, /exhibition-poster-footer/)
    assert.doesNotMatch(legacy, /exhibition-frame-overlay/)
    assert.doesNotMatch(legacy, /museum-antique-gold-frame\.png/)
    assert.match(legacy, /exhibition-quote/)
    assert.match(legacy, /텍스트 작품/)
    assert.match(legacy, /원문 핑계를 바탕으로 전시합니다/)
    assert.ok(legacy.includes(artwork.content))
    assert.doesNotMatch(legacy, /class="exhibition-image"|<blockquote/)
    assert.ok(legacy.indexOf('<figure') < legacy.indexOf('class="detail-label"'))
    const label = legacy.slice(legacy.indexOf('class="detail-label"'))
    const positions = ['id="artwork-title"', '작가 ·', '작품 설명', '기증 날짜', '카테고리', '나의 핑계도 기증하기'].map((text) => label.indexOf(text))
    assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])))
    const prepared = renderToStaticMarkup(React.createElement(Exhibition, { artwork: {
      ...artwork, image_url: '/media/future.png', refined_description: '별도로 다듬은 작품 설명', image_mode: 'generated', image_style: 'watercolor',
    } }))
    assert.match(prepared, /<img[^>]+src="\/media\/future.png"/)
    assert.doesNotMatch(prepared, /exhibition-visual--gallery/)
    assert.match(prepared, /alt="이불의 중력 작품 이미지"/)
    assert.match(prepared, /별도로 다듬은 작품 설명/)
    assert.doesNotMatch(prepared, /임시 설명/)
    assert.match(prepared, /원문 핑계 확인하기/)
    assert.match(prepared, /이불의 중력이 너무 강해/)
    assert.equal(artwork.content, '이불의 중력이 너무 강해 오늘도 늦었습니다.')
  } finally {
    await server.close()
  }
})

test('saved representative images and legacy text use the same frameless gallery/detail display without API calls', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('Viewing must not call generation APIs') }
  try {
    const { LiveArtworkCard } = await server.ssrLoadModule('/src/ArtworkPages.jsx')
    const { default: Exhibition } = await server.ssrLoadModule('/src/ArtworkExhibition.jsx')
    const base = { id: 12, title: '어제의 작은 사정', content: '일상의 작은 사정이 모여 하나의 핑계가 되었습니다.', author: '익명의 예술가', category: '약속', created_at: '2026-11-02T00:00:00Z' }
    for (const Component of [LiveArtworkCard, Exhibition]) {
      for (const media of [
        { image_mode: 'generated', image_url: '/api/artworks/12/image' },
        { image_mode: 'photo', image_url: '/media/photo.png' },
        { image_mode: 'photo', image_url: 'https://example.test/converted.png' },
      ]) {
        const artwork = { ...base, ...media }
        const before = structuredClone(artwork)
        const html = renderToStaticMarkup(React.createElement(Component, { artwork }))
        for (const layer of ['exhibition-stage', 'exhibition-surface', 'exhibition-image']) assert.ok(html.includes(layer))
        assert.match(html, /data-frame="none"/)
        assert.match(html, /data-media="image"/)
        assert.doesNotMatch(html, /exhibition-frame-overlay|museum-antique-gold-frame\.png/)
        assert.equal((html.match(/<img /g) || []).length, 1)
        assert.match(html, /alt="어제의 작은 사정 작품 이미지"/)
        assert.ok(html.includes(media.image_url))
        assert.doesNotMatch(html, /class="exhibition-text"/)
        assert.equal(html.includes('exhibition-visual--gallery'), Component === LiveArtworkCard)
        assert.deepEqual(artwork, before)
      }
      for (const image_url of [undefined, null, '', 'javascript:alert(1)']) {
        const html = renderToStaticMarkup(React.createElement(Component, { artwork: { ...base, image_url } }))
        assert.equal((html.match(/<img /g) || []).length, 0)
        assert.doesNotMatch(html, /class="exhibition-image"/)
        assert.match(html, /class="exhibition-text"/)
        assert.match(html, /data-media="text"/)
        assert.match(html, /data-frame="none"/)
        assert.ok(html.includes(base.content))
      }
    }
    const card = renderToStaticMarkup(React.createElement(LiveArtworkCard, { artwork: base }))
    assert.match(card, /href="\/artworks\/12"/)
    assert.match(card, /artwork-label--minimal/)
    assert.doesNotMatch(card, /artwork-excerpt|<time|artwork-label-top|exhibition-frame-overlay/)
    assert.ok(card.includes(base.title) && card.includes(base.author) && card.includes(base.category))
    for (const rank of [1, 2, 3, 4, 10]) {
      const ranked = renderToStaticMarkup(React.createElement(LiveArtworkCard, { artwork: base, rank }))
      assert.equal(ranked.includes('exhibition-frame-overlay'), rank <= 3)
      assert.equal(ranked.includes('artwork-label--minimal'), rank > 3)
      assert.equal(ranked.includes('exhibition-visual--gallery'), rank > 3)
    }
    const content = '첫 문장은 사용자가 작성한 그대로입니다. ' + '상세에서만 볼 수 있는 원문입니다. '.repeat(15)
    const longWork = { ...base, content }
    const before = structuredClone(longWork)
    const poster = renderToStaticMarkup(React.createElement(LiveArtworkCard, { artwork: longWork }))
    assert.match(poster, /exhibition-poster-edition/)
    assert.match(poster, /EXCUSE ME! \/ TEXT COLLECTION/)
    assert.match(poster, /첫 문장은 사용자가 작성한 그대로입니다\./)
    assert.doesNotMatch(poster, /상세에서만 볼 수 있는 원문/)
    assert.match(poster, /exhibition-poster-footer/)
    assert.match(poster, /COLLECTION № 012/)
    assert.ok(poster.indexOf('exhibition-poster-footer') < poster.indexOf('artwork-label--minimal'))
    const detail = renderToStaticMarkup(React.createElement(Exhibition, { artwork: longWork }))
    assert.ok(detail.includes(content))
    assert.match(detail, /exhibition-visual--gallery/)
    assert.match(detail, /exhibition-poster-footer/)
    assert.ok(detail.includes(`<details class="detail-original"><summary>원문 핑계 확인하기</summary><p>${content}</p></details>`))
    assert.deepEqual(longWork, before)
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
    await server.close()
  }
})

test('curator preview shows editable suggestions, explicit confirmation, stale warning and a usable manual title field', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { CuratorSuggestions, CuratorDescription } = await server.ssrLoadModule('/src/CuratorPanel.jsx')
    const state = { status: 'success', titles: ['중력의 미학', '기상 유예', '이불 속 전시'], description: '작품의 설명입니다. 원문은 보존됩니다.', confirmed: false, snapshot: { content: '이전의 원문 핑계입니다.', category: '약속' }, error: '' }
    const curator = { state, generate() {}, dispatch() {} }
    const values = { title: state.titles[1], content: '새로 고친 원문 핑계입니다.', category: '약속' }
    const titles = renderToStaticMarkup(React.createElement(CuratorSuggestions, { curator, values, onChooseTitle() {} }))
    assert.match(titles, /다시 생성하기/)
    assert.match(titles, /aria-pressed="true"/)
    assert.match(titles, /이전 AI 추천이 현재 내용과 다를 수 있습니다/)
    assert.match(titles, /자동으로 다시 생성하지 않습니다/)
    assert.match(titles, /Google Gemini에 보내/)
    const description = renderToStaticMarkup(React.createElement(CuratorDescription, { curator }))
    assert.match(description, /<textarea/)
    assert.match(description, /type="checkbox"/)
    assert.doesNotMatch(description, /checked=""/)
    assert.match(description, /이 설명을 확인했으며/)
    const missingKey = renderToStaticMarkup(React.createElement(CuratorSuggestions, { curator: { ...curator, state: { ...state, status: 'error', titles: [], error: 'AI가 설정되지 않았습니다. 텍스트 기증은 가능합니다.' } }, values, onChooseTitle() {} }))
    assert.match(missingKey, /텍스트 기증은 가능합니다/)
  } finally {
    await server.close()
  }
})

test('creation cards support original photos separately from existing painting generation', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { default: ArtworkCreation, CreationPreview, StyleChoices } = await server.ssrLoadModule('/src/ArtworkCreation.jsx')
    const painting = { state: { status: 'idle', result: null, error: '' }, style: 'watercolor', ready: false, setStyle() {}, generate() {}, dispatch() {} }
    const photoState = { file: null, url: null, error: '', ready: false, select() {}, clear() {} }
    const renderMode = (mode) => renderToStaticMarkup(React.createElement(ArtworkCreation, { mode, painting, photo: photoState, onModeChange() {} }))
    const text = renderMode('text')
    assert.match(text, /사진 작품/)
    assert.match(text, /텍스트 작품/)
    assert.match(text, /AI로 작품 만들기/)
    assert.match(text, /텍스트 작품 기증이 선택되어 있습니다/)
    assert.match(text, /aria-pressed="true"/)
    const photo = renderMode('photo')
    assert.match(photo, /type="file"/)
    assert.match(photo, /accept="\.jpg,\.jpeg,\.png,\.webp,image\/jpeg,image\/png,image\/webp"/)
    assert.match(photo, /원본 사진 전시/)
    assert.match(photo, /사진은 AI에 전송하지 않습니다/)
    assert.match(photo, /최대 5MB/)
    assert.doesNotMatch(photo, /name="photo_treatment"|name="photo_style"|GIF/)
    const generated = renderMode('generated')
    for (const style of ['수채화', '유화', '점묘화', '연필 드로잉', '콜라주']) assert.ok(generated.includes(style))
    assert.match(generated, /작품 이미지 생성하기/)
    assert.match(generated, /별개의 유료 요청/)
    assert.match(generated, /768×1024 · 3:4 세로 · 1장/)
    assert.doesNotMatch(generated, /1024×1024|0\.053/)
    assert.match(generated, /이미지가 아직 생성되지 않았습니다/)
    assert.doesNotMatch(generated, /<img /)
    const styles = renderToStaticMarkup(React.createElement(StyleChoices, { name: 'photo_style', value: 'oil', onChange() {} }))
    assert.match(styles, /name="photo_style"[^>]*checked=""[^>]*value="oil"/)
    const preview = renderToStaticMarkup(React.createElement(CreationPreview, { src: 'blob:local-preview', fileName: '내사진.png' }))
    assert.match(preview, /src="blob:local-preview"/)
    assert.match(preview, /선택한 원본 사진 미리보기: 내사진.png/)
    const failure = renderToStaticMarkup(React.createElement(CreationPreview, { src: 'blob:local-preview', error: true }))
    assert.match(failure, /사진 미리보기를 표시할 수 없습니다/)
    assert.doesNotMatch(failure, /<img /)
  } finally {
    await server.close()
  }
})

test('generated preview, review confirmation, stale state and detail/gallery media URLs render', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { GeneratedCreation } = await server.ssrLoadModule('/src/ArtworkCreation.jsx')
    const { LiveArtworkCard } = await server.ssrLoadModule('/src/ArtworkPages.jsx')
    const { default: Exhibition } = await server.ssrLoadModule('/src/ArtworkExhibition.jsx')
    const painting = { state: { status: 'success', result: { image_token: 'a'.repeat(43), preview_data_url: 'data:image/png;base64,iVBORw==' } }, style: 'oil', ready: false, stale: true, setStyle() {}, generate() {}, dispatch() {} }
    const preview = renderToStaticMarkup(React.createElement(GeneratedCreation, { painting }))
    assert.match(preview, /alt="기증 전 확인하는 AI 생성 회화"/)
    assert.match(preview, /비공개 미리보기/)
    assert.match(preview, /이전 이미지와 일치하지 않습니다/)
    assert.match(preview, /type="checkbox"[^>]*disabled/)
    const artwork = { id: 7, title: '회화 작품', content: '원문은 그대로 유지된 텍스트입니다.', author: '작가', category: '약속', created_at: '2026-11-02T00:00:00Z', image_url: '/api/artworks/7/image', image_mode: 'generated', image_style: 'oil' }
    for (const Component of [LiveArtworkCard, Exhibition]) {
      assert.match(renderToStaticMarkup(React.createElement(Component, { artwork })), /src="http:\/\/127.0.0.1:8000\/api\/artworks\/7\/image"/)
    }
  } finally { await server.close() }
})
