import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { artworkRequest, ApiError } from '../src/artworkApi.js'
import { readVisitorId } from '../src/visitor.js'
import { artworkEditValues, artworkEditPayload, validateArtworkEdit, canManageArtwork, deleteArtworkAfterConfirmation } from '../src/artworkManagement.js'

const owner = 'fb504ced-8f18-4af9-b5da-e633efc7c516'
const stranger = 'ea91fae7-0fc2-4eda-a09b-919f93aa4ddd'
const artwork = { id: 42, title: '이불의 중력', content: '이불의 중력이 강해서 늦었습니다.', category: '약속', author: '기증 작가',
  refined_description: '저장된 큐레이터 해설입니다.', image_url: '/api/artworks/42/image', image_mode: 'generated', image_style: 'oil',
  created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z', can_manage: true }

function visitorStorage(t, id = owner) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const store = { id, getItem() { return this.id } }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  return store
}

test('ownership needs the server flag and the same current demo ID, never an author name', (t) => {
  const store = visitorStorage(t, owner.toUpperCase())
  assert.equal(readVisitorId(), owner)
  assert.equal(canManageArtwork(artwork, owner), true)
  for (const can_manage of [false, undefined, 'true']) assert.equal(canManageArtwork({ ...artwork, can_manage }, owner), false)
  store.id = stranger
  assert.equal(canManageArtwork(artwork, owner), false)
  store.id = null
  assert.equal(canManageArtwork(artwork, owner), false)
  assert.equal(readVisitorId(), null)
})

test('edit prefill and shared donation validation preserve drafts and exclude media/owner-transfer fields', () => {
  const values = artworkEditValues(artwork)
  const before = structuredClone(values)
  assert.equal(values.refined_description, artwork.refined_description)
  assert.deepEqual(validateArtworkEdit(values), {})
  const payload = artworkEditPayload(values, owner, true)
  assert.equal(payload.visitor_id, owner)
  assert.equal(payload.refined_description, artwork.refined_description)
  const titleOnly = artworkEditPayload({ ...values, title: '제목만 바꾼 작품' }, owner, true)
  assert.equal(titleOnly.refined_description, artwork.refined_description)
  const changedDescription = artworkEditPayload({ ...values, refined_description: '수정한 작품 설명입니다.' }, owner, true)
  assert.equal(changedDescription.refined_description, '수정한 작품 설명입니다.')
  for (const field of ['id', 'image_url', 'image_style', 'image_mode', 'request_id', 'created_at']) assert.equal(field in payload, false)
  for (const [field, value] of [['title', '가'], ['content', '짧음'], ['category', '과제'], ['author', '가'.repeat(21)], ['refined_description', '가'.repeat(1001)]]) {
    assert.ok(validateArtworkEdit({ ...values, [field]: value })[field])
  }
  assert.deepEqual(validateArtworkEdit({ ...values, title: '😀'.repeat(50), content: '가'.repeat(300), refined_description: '가'.repeat(1000) }), {})
  assert.deepEqual(values, before)
  assert.equal(artworkEditPayload({ ...values, refined_description: ' ' }, owner, true).refined_description, null)
  assert.equal('refined_description' in artworkEditPayload(values, owner, false), false)
})

test('ownership header stays out of URLs; PUT sends only the explicit edit and DELETE handles 204', async (t) => {
  const payload = artworkEditPayload(artworkEditValues(artwork), owner, true)
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/artworks/42'))
    assert.equal(url.includes(owner), false)
    assert.equal(options.headers['X-Visitor-ID'], owner)
    return new Response(JSON.stringify(artwork))
  })
  assert.equal((await artworkRequest('/api/artworks/42', undefined, { visitorId: owner })).can_manage, true)
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'PUT')
    assert.deepEqual(JSON.parse(options.body), payload)
    return new Response(JSON.stringify(artwork))
  }
  assert.deepEqual(await artworkRequest('/api/artworks/42', payload, { method: 'PUT' }), artwork)
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'DELETE')
    assert.deepEqual(JSON.parse(options.body), { visitor_id: owner })
    return new Response(null, { status: 204 })
  }
  assert.equal(await artworkRequest('/api/artworks/42', { visitor_id: owner }, { method: 'DELETE' }), null)
})

test('cancelled deletion does not send any request, navigate or modify the artwork', async (t) => {
  visitorStorage(t)
  let calls = 0
  let navigations = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('No deletion after cancel') })
  const before = structuredClone(artwork)
  assert.equal(await deleteArtworkAfterConfirmation(artwork, owner, { confirm: () => false, navigate: () => navigations++ }), false)
  assert.equal(calls, 0)
  assert.equal(navigations, 0)
  assert.deepEqual(artwork, before)
})

test('confirmed deletion navigates only after success; identity changes and server rejection keep the page', async (t) => {
  const store = visitorStorage(t)
  let calls = 0
  const navigations = []
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: 204 }) })
  assert.equal(await deleteArtworkAfterConfirmation(artwork, owner, { confirm: () => true, navigate: (path) => navigations.push(path) }), true)
  assert.deepEqual(navigations, ['/gallery'])
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ detail: '다른 방문객의 작품입니다.' }), { status: 403 }) }
  await assert.rejects(deleteArtworkAfterConfirmation(artwork, owner, { confirm: () => true, navigate: (path) => navigations.push(path) }), /다른 방문객/)
  assert.equal(navigations.length, 1)
  const before = calls
  await assert.rejects(deleteArtworkAfterConfirmation(artwork, owner, { confirm: () => { store.id = stranger; return true } }), /변경/)
  assert.equal(calls, before)
})

test('mutation validation, missing/foreign works and uncertain network outcomes remain errors without changing drafts', async (t) => {
  const values = artworkEditValues(artwork)
  const before = structuredClone(values)
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ detail: '입력 오류', errors: { title: '작품명 확인' } }), { status: 422 }))
  await assert.rejects(artworkRequest('/api/artworks/42', {}, { method: 'PUT' }), (e) => e instanceof ApiError && e.fields.title === '작품명 확인')
  for (const status of [403, 404]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: '수정할 수 없습니다.' }), { status })
    await assert.rejects(artworkRequest('/api/artworks/42', {}, { method: 'PUT' }), (e) => e.status === status)
  }
  globalThis.fetch = async () => { throw new DOMException('private', 'TimeoutError') }
  await assert.rejects(artworkRequest('/api/artworks/42', {}, { method: 'PUT' }), /입력 내용은 유지/)
  await assert.rejects(artworkRequest('/api/artworks/42', {}, { method: 'DELETE' }), /이미 삭제되었을 수도/)
  assert.deepEqual(values, before)
})

test('owner controls and prefilled edit form render only for the matching server-checked visitor', async (t) => {
  const store = visitorStorage(t)
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { ArtworkOwnerActions, ArtworkEditForm } = await server.ssrLoadModule('/src/ArtworkManagement.jsx')
    const renderActions = (item = artwork) => renderToStaticMarkup(React.createElement(ArtworkOwnerActions, { artwork: item, visitorId: owner }))
    assert.match(renderActions(), /작품 수정하기/)
    assert.match(renderActions(), /작품 삭제하기/)
    assert.match(renderActions(), /href="\/artworks\/42\/edit"/)
    assert.equal(renderActions({ ...artwork, can_manage: false }), '')
    store.id = stranger
    assert.equal(renderActions(), '')
    store.id = owner
    const form = renderToStaticMarkup(React.createElement(ArtworkEditForm, { artwork, visitorId: owner }))
    for (const name of ['title', 'content', 'category', 'author', 'refined_description']) assert.ok(form.includes(`name="${name}"`))
    for (const value of [artwork.title, artwork.content, artwork.author, artwork.refined_description]) assert.ok(form.includes(value))
    assert.match(form, /option value="약속" selected=""/)
    assert.doesNotMatch(form, /type="file"|작품 이미지 생성하기/)
    const legacy = renderToStaticMarkup(React.createElement(ArtworkEditForm, { artwork: { ...artwork, refined_description: null }, visitorId: owner }))
    assert.doesNotMatch(legacy, /name="refined_description"/)
  } finally { await server.close() }
})
