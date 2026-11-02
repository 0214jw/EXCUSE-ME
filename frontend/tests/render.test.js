import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('real React pages render donation links, form, separate samples and preserved hero', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const previousWindow = globalThis.window
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.jsx')
    const render = (pathname) => {
      globalThis.window = { location: { pathname } }
      return renderToStaticMarkup(React.createElement(App))
    }
    const home = render('/')
    assert.match(home, /그럴듯한 사유/)
    assert.match(home, /the-birth-of-an-excuse-cutout/)
    assert.ok((home.match(/href="\/submit"/g) || []).length >= 3)
    const submit = render('/submit')
    for (const name of ['title', 'content', 'category', 'author']) assert.ok(submit.includes(`name="${name}"`))
    for (const category of ['지각·조퇴', '휴가·병가', '약속', '운동', '기타']) assert.ok(submit.includes(`<option value="${category}">`))
    assert.equal((submit.match(/<option value=/g) || []).length, 6) // placeholder + five choices
    assert.doesNotMatch(submit, /type="file"/)
    assert.match(submit, /실제 인증 수단은 아닙니다/)
    const gallery = render('/gallery')
    assert.match(gallery, /기증 작품 카테고리/)
    assert.match(gallery, /<details class="sample-collection">/)
    assert.match(gallery, /가상 작품 8점/)
    assert.equal((gallery.match(/<article /g) || []).length, 8) // all eight are inside the separate samples
    assert.match(render('/artworks/1'), /모셔오는 중/)
    assert.match(render('/health'), /서버 연결 확인/)
    assert.match(render('/hall-of-fame'), /명예의 전당은 준비 중/)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    await server.close()
  }
})

test('exhibition renders framed image separately from ordered information, preserving legacy text works', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: Exhibition } = await server.ssrLoadModule('/src/ArtworkExhibition.jsx')
    const artwork = { id: 42, title: '이불의 중력', author: '익명의 예술가', content: '이불의 중력이 너무 강해 오늘도 늦었습니다.', category: '지각·조퇴', created_at: '2026-11-02T00:00:00Z' }
    const legacy = renderToStaticMarkup(React.createElement(Exhibition, { artwork }))
    assert.match(legacy, /작품 이미지는 준비 중입니다/)
    assert.match(legacy, /원문 핑계를 바탕으로 한 임시 설명/)
    assert.ok(legacy.includes(artwork.content))
    assert.doesNotMatch(legacy, /<img |<blockquote/)
    assert.ok(legacy.indexOf('<figure') < legacy.indexOf('class="detail-label"'))
    const label = legacy.slice(legacy.indexOf('class="detail-label"'))
    const positions = ['id="artwork-title"', '작가 ·', '작품 설명', '기증 날짜', '카테고리', '나의 핑계도 기증하기'].map((text) => label.indexOf(text))
    assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])))
    const prepared = renderToStaticMarkup(React.createElement(Exhibition, { artwork: {
      ...artwork, image_url: '/media/future.png', refined_description: '별도로 다듬은 작품 설명', image_mode: 'generated', image_style: 'watercolor',
    } }))
    assert.match(prepared, /<img[^>]+src="\/media\/future.png"/)
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

test('curator preview shows editable suggestions, explicit confirmation, stale warning and a usable manual title field', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
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
    assert.match(titles, /OpenAI에 보내/)
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

test('creation cards expose local-only photo choices and clearly unavailable AI styling', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: ArtworkCreation, CreationPreview, StyleChoices } = await server.ssrLoadModule('/src/ArtworkCreation.jsx')
    const renderMode = (mode) => renderToStaticMarkup(React.createElement(ArtworkCreation, { mode, onModeChange() {} }))
    const text = renderMode('text')
    assert.match(text, /사진으로 작품 만들기/)
    assert.match(text, /AI로 작품 만들기/)
    assert.match(text, /텍스트 작품 기증이 선택되어 있습니다/)
    assert.match(text, /aria-pressed="true"/)
    const photo = renderMode('photo')
    assert.match(photo, /type="file"/)
    assert.match(photo, /accept="image\/jpeg,image\/png,image\/webp,image\/gif"/)
    assert.match(photo, /원본 사진 전시/)
    assert.match(photo, /AI 화풍 변환/)
    assert.match(photo, /업로드·기증되지 않음/)
    assert.match(photo, /사진 작품 기증과 AI 화풍 변환은 준비 중/)
    const generated = renderMode('generated')
    for (const style of ['수채화', '유화', '점묘화', '연필 드로잉', '콜라주']) assert.ok(generated.includes(style))
    assert.match(generated, /<button[^>]*disabled=""[^>]*>AI 작품 제작 준비 중/)
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
