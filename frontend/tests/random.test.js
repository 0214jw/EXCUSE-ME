import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { artworkRequest } from '../src/artworkApi.js'
import { createRandomArtworkLoader } from '../src/randomArtwork.js'

const artwork = { id: 42, title: '우연히 만난 작품', content: '지금 만나게 된 핑계의 원문입니다.', category: '약속', author: '기증 작가',
  created_at: '2026-11-04T00:00:00+00:00', updated_at: '2026-11-04T00:00:00+00:00', refined_description: '저장된 AI 작품 설명입니다.', recognition_count: 7 }
const response = (value, status = 200) => new Response(JSON.stringify(value), { status })

test('random API reads one saved artwork or explicit empty result, never all artworks or a write', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return response(artwork) })
  assert.deepEqual(await artworkRequest('/api/artworks/random?exclude_id=40'), artwork)
  assert.match(calls[0].url, /\/api\/artworks\/random\?exclude_id=40$/)
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].options.cache, 'no-store')
  assert.equal(calls[0].options.body, undefined)
  globalThis.fetch = async () => response(null)
  assert.equal(await artworkRequest('/api/artworks/random'), null)
  assert.equal(await artworkRequest('/api/artworks/random?exclude_id=42'), null)
  await assert.rejects(artworkRequest('/api/artworks/42'), /불러오지 못했습니다/)
  for (const value of [[], [artwork], {}, { ...artwork, recognition_count: -1 }]) {
    globalThis.fetch = async () => response(value)
    await assert.rejects(artworkRequest('/api/artworks/random'), /불러오지 못했습니다/)
  }
})

test('fast repeated clicks issue one request and the next draw excludes the last displayed artwork', async () => {
  const paths = [], states = []
  let complete
  const loader = createRandomArtworkLoader((state) => states.push(state), (path) => {
    paths.push(path)
    return new Promise((resolve) => { complete = resolve })
  })
  const first = loader.load()
  assert.equal(await loader.load(), false)
  assert.equal(paths.length, 1)
  assert.equal(states.at(-1).pending, true)
  complete(artwork)
  await first
  assert.deepEqual(states.at(-1).data, artwork)
  const second = loader.load()
  assert.equal(await loader.load(), false)
  assert.equal(paths[1], '/api/artworks/random?exclude_id=42')
  complete({ ...artwork, id: 43 })
  await second
  assert.equal(states.at(-1).data.id, 43)
  assert.equal(states.at(-1).pending, false)
})

test('failed draw preserves the previous artwork and retries the same exclusion only on explicit action', async () => {
  const states = [], paths = []
  let attempt = 0
  const loader = createRandomArtworkLoader((state) => states.push(state), async (path) => {
    paths.push(path)
    if (++attempt === 2) throw new Error('연결 실패')
    return { ...artwork, id: attempt === 1 ? 42 : 43 }
  })
  await loader.load()
  await loader.load()
  assert.equal(states.at(-1).status, 'error')
  assert.equal(states.at(-1).data.id, 42)
  assert.equal(paths.length, 2)
  await loader.load()
  assert.equal(states.at(-1).status, 'success')
  assert.equal(states.at(-1).data.id, 43)
  assert.deepEqual(paths, ['/api/artworks/random', '/api/artworks/random?exclude_id=42', '/api/artworks/random?exclude_id=42'])
})

test('initial failure, empty exhibition and single-work repeat remain distinct outcomes', async () => {
  let latest, calls = 0
  const loader = createRandomArtworkLoader((state) => { latest = state }, async () => {
    calls++
    if (calls === 1) throw new Error('서버 오류')
    if (calls === 2) return null
    return artwork
  })
  await loader.load()
  assert.equal(latest.status, 'error')
  await loader.load()
  assert.equal(latest.status, 'success')
  assert.equal(latest.data, null)
  await loader.load()
  await loader.load()
  assert.equal(latest.data.id, 42)
})

test('leaving the page prevents a late response or failure from updating the view', async () => {
  for (const failed of [false, true]) {
    const states = []
    let finish
    const loader = createRandomArtworkLoader((state) => states.push(state), () => new Promise((resolve, reject) => {
      finish = () => failed ? reject(new Error('late')) : resolve(artwork)
    }))
    const task = loader.load()
    loader.dispose()
    finish()
    await task
    assert.equal(states.length, 1)
    assert.equal(await loader.load(), false)
  }
})

test('HTTP failures are errors rather than empty exhibitions and can recover on an explicit retry', async (t) => {
  const states = []
  t.mock.method(globalThis, 'fetch', async () => response({ detail: '저장소 오류' }, 503))
  const loader = createRandomArtworkLoader((state) => states.push(state))
  await loader.load()
  assert.equal(states.at(-1).status, 'error')
  assert.ok(states.at(-1).error)
  globalThis.fetch = async () => response(artwork)
  await loader.load()
  assert.equal(states.at(-1).status, 'success')
  assert.equal(states.at(-1).data.recognition_count, 7)
})

test('random room reuses gold image/text frames, saved description and real metadata without vote controls', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { RandomExhibition } = await server.ssrLoadModule('/src/RandomArtwork.jsx')
    const render = (resource) => renderToStaticMarkup(React.createElement(RandomExhibition, { resource, onNext: () => {} }))
    const state = { status: 'success', data: artwork, pending: false }
    const text = render(state)
    for (const value of [artwork.title, artwork.author, artwork.category, artwork.refined_description]) assert.ok(text.includes(value))
    assert.match(text, /<dt>좋아요<\/dt><dd>7<\/dd>/)
    assert.match(text, /data-frame="antique-gold"/)
    assert.match(text, /exhibition-quote/)
    assert.match(text, /href="\/artworks\/42">작품 자세히 보기/)
    assert.match(text, /다른 작품 만나기/)
    assert.doesNotMatch(text, /like-button|sample-collection/)
    const image = render({ ...state, data: { ...artwork, image_mode: 'generated', image_url: '/api/artworks/42/image' } })
    assert.match(image, /exhibition-image/)
    assert.match(image, /\/api\/artworks\/42\/image/)
    const legacy = render({ ...state, data: { ...artwork, refined_description: null } })
    assert.match(legacy, /원문 핑계를 바탕으로 전시합니다/)
    assert.match(render({ ...state, pending: true }), /disabled=""/)
    assert.match(render({ status: 'loading', data: null }), /role="status"/)
    const empty = render({ ...state, data: null })
    assert.match(empty, /아직 운명처럼 만날 기증 작품이 없습니다/)
    assert.match(empty, /href="\/submit"/)
    const error = render({ status: 'error', error: new Error('연결 실패'), data: artwork })
    assert.match(error, /role="alert"/)
    assert.match(error, /다시 시도하기/)
    assert.match(error, /앞서 만난 작품을 그대로 전시/)
    assert.ok(error.includes(artwork.title))
  } finally { await server.close() }
})
