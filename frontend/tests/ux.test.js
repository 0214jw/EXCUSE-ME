import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { artworkRequest, userMessage } from '../src/artworkApi.js'
import { requestCurator } from '../src/curatorApi.js'
import { requestPainting } from '../src/paintingApi.js'
import { requestRecognition } from '../src/recognitionApi.js'
import { uploadPhoto } from '../src/photoApi.js'

const artwork = { id: 1, title: '작은 사정', content: '그날의 작은 사정이 작품이 되었습니다.', author: '작가', category: '기타',
  created_at: '2026-11-04T00:00:00.123456Z', updated_at: '2026-11-04T00:00:00Z', recognition_count: 0 }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status })

test('server diagnostics and unknown field values never become public messages across API clients', async (t) => {
  const diagnostic = 'Internal Server Error / SQL database/private.sqlite / 테스트용 내부 진단'
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return response({ detail: diagnostic,
    errors: { title: diagnostic, category: diagnostic, unexpected: diagnostic } }, 422) })
  for (const request of [
    () => artworkRequest('/api/artworks', {}),
    () => requestCurator({}),
    () => requestPainting({}),
    () => requestRecognition(1, 'demo', true),
    () => uploadPhoto(new File(['original'], 'photo.jpg', { type: 'image/jpeg' }), 'demo', { id: 'id', token: 'token' }),
  ]) {
    await assert.rejects(request(), (error) => {
      assert.equal(error.status, 422)
      assert.match(error.message, /[가-힣]/)
      assert.doesNotMatch(error.message, /Internal|SQL|private|내부 진단/)
      if (error.fields.title) {
        assert.equal(error.fields.title, '작품명은 2~50자로 입력해 주세요.')
        assert.equal(error.fields.category, '카테고리 한 가지를 선택해 주세요.')
        assert.equal(Object.hasOwn(error.fields, 'unexpected'), false)
      }
      return true
    })
  }
  assert.equal(calls, 5) // mocked, explicit requests only; no paid provider or retry
  assert.equal(userMessage(new TypeError(diagnostic), '입력은 유지됩니다.'), '입력은 유지됩니다.')
})

test('invalid dates become recoverable read errors rather than crashing any exhibition', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response(artwork))
  assert.deepEqual(await artworkRequest('/api/artworks/1'), artwork)
  for (const key of ['created_at', 'updated_at']) {
    for (const value of ['', 'not-a-date', '999999999999999999']) {
      const invalid = { ...artwork, [key]: value }
      for (const path of ['/api/artworks', '/api/artworks/1', '/api/hall-of-fame', '/api/artworks/random']) {
        globalThis.fetch = async () => response(['/api/artworks', '/api/hall-of-fame'].includes(path) ? [invalid] : invalid)
        await assert.rejects(artworkRequest(path), /작품을 불러오지 못했습니다/)
      }
    }
  }
})

test('photo selection connects labels and controls and renders loading, invalid and broken-preview states', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { default: Creation } = await server.ssrLoadModule('/src/ArtworkCreation.jsx')
    const photo = { file: { name: '사진.png' }, url: 'blob:local-photo', ready: false, error: '', clear() {}, select() {} }
    const render = (overrides = {}) => renderToStaticMarkup(React.createElement(Creation, { mode: 'photo', photo: { ...photo, ...overrides }, onModeChange() {} }))
    const loading = render()
    const controls = loading.match(/aria-controls="([^"]+)"/)[1]
    assert.ok(loading.includes(`id="${controls}"`))
    assert.match(loading, /for="donation-photo"/)
    assert.match(loading, /id="donation-photo"[^>]+aria-invalid="false"[^>]+aria-describedby="donation-photo-help donation-photo-error"/)
    for (const id of ['donation-photo-help', 'donation-photo-error']) assert.ok(loading.includes(`id="${id}"`))
    assert.match(loading, /role="status">사진 미리보기를 불러오는 중/)
    const failed = render({ error: '사진을 읽을 수 없습니다.' })
    assert.match(failed, /aria-invalid="true"/)
    assert.match(failed, /role="alert">사진을 읽을 수 없습니다/)
    assert.match(failed, /사진을 표시할 수 없습니다/)
    assert.doesNotMatch(failed, /<img[^>]+src="blob:local-photo"/)
    const ready = render({ ready: true })
    assert.match(ready, /alt="기증할 원본 사진 미리보기"/)
    assert.doesNotMatch(ready, /사진 미리보기를 불러오는 중/)
  } finally { await server.close() }
})

test('error views conceal diagnostics and provide recovery; next-work loading retains the preceding work', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { ResourceNotice } = await server.ssrLoadModule('/src/ArtworkPages.jsx')
    const { HallExhibition } = await server.ssrLoadModule('/src/HallOfFame.jsx')
    const { RandomExhibition } = await server.ssrLoadModule('/src/RandomArtwork.jsx')
    for (const Component of [ResourceNotice, HallExhibition, RandomExhibition]) {
      const html = renderToStaticMarkup(React.createElement(Component, { resource: { status: 'error', error: { message: 'SQL debug trace', status: 503 }, data: null }, onNext() {} }))
      assert.doesNotMatch(html, /SQL|debug|trace/)
      assert.match(html, /role="alert"/)
      assert.match(html, /<button[^>]*>다시/)
      assert.match(html, /href="\/gallery"/)
    }
    const loading = renderToStaticMarkup(React.createElement(RandomExhibition, { resource: { status: 'success', data: artwork, pending: true }, onNext() {} }))
    assert.match(loading, /작은 사정/)
    assert.match(loading, /disabled="" aria-busy="true"/)
    assert.match(loading, /href="\/artworks\/1"/)
    assert.match(loading, /<dt>좋아요<\/dt><dd>0<\/dd>/)
  } finally { await server.close() }
})
