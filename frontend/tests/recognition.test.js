import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { artworkRequest } from '../src/artworkApi.js'
import { selectArtworks } from '../src/artworkRules.js'
import { changeRecognition, loadRecognition, recognitionValue, requestRecognition } from '../src/recognitionApi.js'

const visitor = 'fb504ced-8f18-4af9-b5da-e633efc7c516'
const artwork = { id: 42, title: '관람객의 선택', content: '오늘의 핑계를 작품으로 전시해 봅니다.',
  category: '약속', author: '테스트 작가', created_at: '2026-01-01T00:00:00.000001+00:00',
  updated_at: '2026-01-01T00:00:00.000001+00:00', recognition_count: 2, recognized_by_me: true }
const response = (data, status = 200) => new Response(JSON.stringify(data), { status })
const vote = (count, mine) => ({ artwork_id: 42, recognition_count: count, recognized_by_me: mine })

test('recognition sends explicit idempotent add/remove intent, validates count/identity and reads personalized state', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options })
    return response(options.method === 'GET' ? artwork : vote(options.method === 'PUT' ? 3 : 2, options.method === 'PUT'))
  })
  assert.deepEqual(await requestRecognition(42, visitor, true), { recognition_count: 3, recognized_by_me: true })
  assert.deepEqual(await requestRecognition(42, visitor, false), { recognition_count: 2, recognized_by_me: false })
  assert.deepEqual(await loadRecognition(42, visitor), { recognition_count: 2, recognized_by_me: true })
  assert.deepEqual(calls.map((c) => c.method), ['PUT', 'DELETE', 'GET'])
  for (const call of calls.slice(0, 2)) {
    assert.match(call.url, /\/api\/artworks\/42\/recognition$/)
    assert.deepEqual(JSON.parse(call.body), { visitor_id: visitor })
    assert.equal(call.cache, 'no-store')
    assert.ok(call.signal instanceof AbortSignal)
  }
  assert.equal(calls[2].headers['X-Visitor-ID'], visitor)
  for (const data of [vote(-1, true), vote(1.5, true), vote(1, 'true'), { ...vote(1, true), artwork_id: 43 }, null]) {
    assert.throws(() => recognitionValue(data, 42), /상태를 확인/)
  }
})

test('lost write response re-reads actual committed state with one write and no guessed increment', async (t) => {
  const methods = []
  let serverCount = 2
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    methods.push(options.method)
    if (options.method === 'PUT') { serverCount = 3; throw new TypeError('response lost after commit') }
    return response({ ...artwork, recognition_count: serverCount })
  })
  const outcome = await changeRecognition(42, visitor, true)
  assert.deepEqual(methods, ['PUT', 'GET'])
  assert.deepEqual(outcome.value, { recognition_count: 3, recognized_by_me: true })
  assert.match(outcome.error, /현재 상태를 다시 불러왔습니다/)
})

test('rejected writes reconcile unchanged state, while failed reconciliation gives unknown instead of stale success', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    calls.push(options.method)
    return options.method === 'GET' ? response({ ...artwork, recognized_by_me: false }) : response({ detail: '저장 실패' }, 503)
  })
  const known = await changeRecognition(42, visitor, true)
  assert.deepEqual(known.value, { recognition_count: 2, recognized_by_me: false })
  assert.deepEqual(calls, ['PUT', 'GET'])
  globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError') }
  const unknown = await changeRecognition(42, visitor, false)
  assert.equal(unknown.value, null)
  assert.match(unknown.error, /추가 좋아요 요청을 중단/)
  globalThis.fetch = async () => response({ detail: '없는 작품' }, 404)
  const missing = await changeRecognition(42, visitor, true)
  assert.equal(missing.value, null)
  assert.match(missing.error, /이미 삭제/)
})

test('wrong artwork or malformed success cannot become a recognized state', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return response({ ...vote(9, true), artwork_id: 43 }) })
  assert.equal((await changeRecognition(42, visitor, true)).value, null)
  assert.equal(calls, 2)
  globalThis.fetch = async () => response({ detail: '잘못된 방문객' }, 422)
  await assert.rejects(requestRecognition(42, visitor, true), (error) => error.status === 422)
})

test('gallery popular sort combines five-category filtering and exact oldest/id ties without mutating input', () => {
  const rows = [
    { ...artwork, id: 4, category: '운동', recognition_count: 8 },
    { ...artwork, id: 3, created_at: '2026-01-01T00:00:00.000002+00:00' },
    { ...artwork, id: 2 }, { ...artwork, id: 1 },
    { ...artwork, id: 5, recognition_count: 0 },
  ]
  const original = structuredClone(rows)
  assert.deepEqual(selectArtworks(rows, '전체', 'popular').map((r) => r.id), [4, 1, 2, 3, 5])
  assert.deepEqual(selectArtworks(rows, '약속', 'popular').map((r) => r.id), [1, 2, 3, 5])
  assert.deepEqual(selectArtworks(rows, '약속', 'latest').map((r) => r.id), [3, 5, 2, 1])
  assert.deepEqual(selectArtworks(rows, '기타', 'popular'), [])
  assert.deepEqual(rows, original)
})

test('hall and filtered list API accept only actual artwork-shaped records and nonnegative counts', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => response([artwork]))
  assert.deepEqual(await artworkRequest('/api/hall-of-fame'), [artwork])
  assert.deepEqual(await artworkRequest('/api/artworks?order=popular&category=약속'), [artwork])
  globalThis.fetch = async () => response([{ ...artwork, recognition_count: -1 }])
  await assert.rejects(artworkRequest('/api/hall-of-fame'), /불러오지 못했습니다/)
})

test('detail recognition UI shows persisted count/mine, protects identity and disables unknown state', async (t) => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => visitor } })
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else delete globalThis.localStorage
  })
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { default: Recognition } = await server.ssrLoadModule('/src/ArtworkRecognition.jsx')
    const render = (item = artwork, actor = visitor) => renderToStaticMarkup(React.createElement(Recognition, { artwork: item, visitorId: actor }))
    const mine = render()
    assert.match(mine, /aria-label="좋아요 취소"/)
    assert.match(mine, /<svg[^>]*class="like-icon"[^>]*fill="currentColor"/)
    assert.match(mine, /aria-describedby="like-count-42"/)
    assert.match(mine, /aria-pressed="true"/)
    assert.match(mine, /<strong>2<\/strong>/)
    assert.doesNotMatch(mine, /disabled=""/)
    const notLiked = render({ ...artwork, recognized_by_me: false, recognition_count: 0 })
    assert.match(notLiked, /aria-pressed="false"/)
    assert.match(notLiked, /aria-label="좋아요"/)
    assert.match(notLiked, /<svg[^>]*class="like-icon"[^>]*fill="none"/)
    assert.equal(mine.match(/<path d="([^"]+)"/)[1], notLiked.match(/<path d="([^"]+)"/)[1])
    assert.match(notLiked, /<strong>0<\/strong>/)
    assert.doesNotMatch(mine + notLiked, /명작 인정/)
    const blocked = render(artwork, 'different-visitor')
    assert.match(blocked, /disabled=""/)
    assert.doesNotMatch(blocked, /좋아요 취소|aria-pressed="true"/)
    const unknown = render({ ...artwork, recognition_count: undefined })
    assert.match(unknown, /disabled=""/)
    assert.match(unknown, /상태 다시 불러오기/)
    assert.match(unknown, /<strong>—<\/strong>/)
    assert.match(render(artwork, null), /저장소를 사용할 수 없거나/)
  } finally { await server.close() }
})

test('hall renders only real ranked records with shared frame, TOP3, image/text and empty/error states', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { HallExhibition } = await server.ssrLoadModule('/src/HallOfFame.jsx')
    const render = (resource) => renderToStaticMarkup(React.createElement(HallExhibition, { resource }))
    const items = [artwork, { ...artwork, id: 43, image_mode: 'generated', image_url: '/api/artworks/43/image' },
      { ...artwork, id: 44 }, { ...artwork, id: 45 }]
    const hall = render({ status: 'success', data: items })
    for (const item of items) assert.match(hall, new RegExp(`href="/artworks/${item.id}"`))
    for (const rank of [1, 2, 3, 4]) assert.ok(hall.includes(`<strong>${rank}위</strong>`))
    assert.equal((hall.match(/award-card--laureate/g) || []).length, 3)
    assert.equal((hall.match(/data-frame="antique-gold"/g) || []).length, 4)
    assert.match(hall, /exhibition-image/)
    assert.match(hall, /exhibition-quote/)
    assert.match(hall, /좋아요 수로 정렬/)
    assert.equal((hall.match(/class="artwork-like-count"/g) || []).length, 4)
    assert.equal((hall.match(/class="recognition-sr-only">좋아요 <\/span>2/g) || []).length, 4)
    assert.doesNotMatch(hall, /명작 인정/)
    assert.doesNotMatch(hall, /sample-collection|가상 작품/)
    assert.match(render({ status: 'success', data: [] }), /아직 명예의 전당에 전시할/)
    assert.match(render({ status: 'loading' }), /role="status"/)
    const error = render({ status: 'error', error: new Error('연결 오류'), reload: () => {} })
    assert.match(error, /role="alert"/)
    assert.match(error, /다시 불러오기/)
    assert.match(error, /연결 오류/)
  } finally { await server.close() }
})
