import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, artworkRequest } from '../src/artworkApi.js'

const artwork = { id: 1, title: '작품명', content: '작품의 핑계 내용입니다.', category: '약속', author: '익명의 예술가', created_at: '2026-11-02T01:00:00Z', updated_at: '2026-11-02T01:00:00Z' }
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

test('API client handles list, detail and registration responses', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse([]))
  assert.deepEqual(await artworkRequest('/api/artworks'), [])
  globalThis.fetch = async () => jsonResponse([artwork])
  assert.deepEqual(await artworkRequest('/api/artworks'), [artwork])
  globalThis.fetch = async () => jsonResponse(artwork)
  assert.deepEqual(await artworkRequest('/api/artworks/1'), artwork)
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'POST')
    assert.equal(JSON.parse(options.body).request_id, 'same-retry-key')
    return jsonResponse(artwork, 201)
  }
  assert.deepEqual(await artworkRequest('/api/artworks', { request_id: 'same-retry-key' }), artwork)
})

test('API client separates empty results, 404, validation errors and unreadable responses', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse({ detail: '작품 없음' }, 404))
  await assert.rejects(artworkRequest('/api/artworks/999'), (error) => error instanceof ApiError && error.status === 404)
  globalThis.fetch = async () => jsonResponse({ detail: '입력 확인', errors: { title: '제목 오류' } }, 422)
  await assert.rejects(artworkRequest('/api/artworks', {}), (error) => error.fields.title === '작품명은 2~50자로 입력해 주세요.')
  for (const data of [{}, artwork, [null], [{ id: 1 }]]) {
    globalThis.fetch = async () => jsonResponse(data)
    await assert.rejects(artworkRequest('/api/artworks'), /불러오지 못했습니다/)
  }
  globalThis.fetch = async () => new Response('invalid JSON', { status: 200 })
  await assert.rejects(artworkRequest('/api/artworks'), /불러오지 못했습니다/)
})

test('lost responses, timeouts and server errors never claim a successful donation', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Offline') })
  await assert.rejects(artworkRequest('/api/artworks', {}), /이미 저장되었을 수도/)
  globalThis.fetch = async () => { throw new DOMException('Timed out', 'TimeoutError') }
  await assert.rejects(artworkRequest('/api/artworks', {}), /저장 결과를 확인하지 못했습니다/)
  globalThis.fetch = async () => jsonResponse({ detail: 'DB unavailable' }, 503)
  await assert.rejects(artworkRequest('/api/artworks', {}), /같은 요청의 중복 저장을 방지/)
  await assert.rejects(artworkRequest('/api/artworks'), /불러오지 못했습니다/)
})

test('exhibition metadata accepts legacy, null and prepared values; malformed metadata is rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(artwork))
  const empty = { refined_description: null, image_url: null, image_mode: null, image_style: null }
  const prepared = { refined_description: '작품 설명', image_url: '/media/test.png', image_mode: 'generated', image_style: 'watercolor' }
  for (const metadata of [{}, empty, prepared, { ...prepared, image_mode: 'photo' }]) {
    const data = { ...artwork, ...metadata }
    globalThis.fetch = async () => jsonResponse(data)
    assert.deepEqual(await artworkRequest('/api/artworks/1'), data)
  }
  for (const metadata of [{ refined_description: {} }, { image_url: 42 }, { image_mode: 'invalid' }, { image_style: [] }]) {
    globalThis.fetch = async () => jsonResponse({ ...artwork, ...metadata })
    await assert.rejects(artworkRequest('/api/artworks/1'), /불러오지 못했습니다/)
  }
})
