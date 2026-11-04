import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { validatePhotoFile, createPhotoPreview, maxPhotoBytes } from '../src/artworkCreation.js'
import { createPhotoUploadSession, uploadPhoto } from '../src/photoApi.js'
import { artworkRequest } from '../src/artworkApi.js'
import { deleteArtworkAfterConfirmation } from '../src/artworkManagement.js'

const owner = 'fb504ced-8f18-4af9-b5da-e633efc7c516'
const file = () => new File(['test image bytes'], '기증 사진.png', { type: 'image/png' })
const artwork = { id: 42, title: '사진의 사정', content: '사진 작품에 함께 기증한 원문 핑계입니다.', author: '사진 작가', category: '약속',
  visitor_id: owner, can_manage: true, created_at: '2026-11-04T00:00:00Z', updated_at: '2026-11-04T00:00:00Z',
  refined_description: '사용자가 확인한 작품 설명입니다.', image_mode: 'photo', artwork_type: 'photo', image_url: '/api/artworks/42/image', recognition_count: 3 }

test('photo validation accepts only JPEG PNG WEBP up to 5MB and preview disposal never uploads', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Preview must remain local') })
  for (const [name, type] of [['a.jpg','image/jpeg'],['a.jpeg','image/jpeg'],['a.PNG','image/png'],['a.webp','image/webp']]) {
    assert.equal(validatePhotoFile(new File(['bytes'], name, { type })), type)
  }
  assert.equal(validatePhotoFile(new File(['bytes'], 'a.jpg')), 'image/jpeg')
  for (const bad of [new File(['gif'], 'a.gif', { type: 'image/gif' }), new File(['svg'], 'a.svg', { type: 'image/svg+xml' }),
    new File(['exe'], 'a.exe', { type: 'image/png' }), new File(['png'], 'a.png', { type: 'image/jpeg' })]) {
    assert.throws(() => validatePhotoFile(bad), /JPG, JPEG, PNG, WEBP/)
  }
  assert.throws(() => validatePhotoFile(new File([new Uint8Array(maxPhotoBytes + 1)], 'big.png', { type: 'image/png' })), /5MB/)
  assert.throws(() => validatePhotoFile(new File([], 'empty.png', { type: 'image/png' })), /비어/)
  const preview = createPhotoPreview(file())
  preview.dispose(); preview.dispose()
  assert.equal(calls, 0)
})

test('explicit photo upload sends original File only to the local photo API and validates the response', async (t) => {
  const selected = file(), attempt = { id: crypto.randomUUID(), token: 'a'.repeat(43) }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /\/api\/photo-uploads$/)
    assert.equal(options.method, 'POST')
    assert.equal(options.body, selected)
    assert.equal(options.headers['X-Visitor-ID'], owner)
    assert.equal(options.headers['X-Upload-Token'], attempt.token)
    assert.equal(options.headers['X-File-Name'], encodeURIComponent(selected.name))
    assert.doesNotMatch(url, /openai|curator|image-generations/)
    return new Response(JSON.stringify({ photo_token: attempt.token, size: selected.size, media_type: 'image/png', expires_at: Date.now() + 86400000 }), { status: 201 })
  })
  assert.equal((await uploadPhoto(selected, owner, attempt)).photo_token, attempt.token)
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: '사진은 5MB 이하로 선택해 주세요.' }), { status: 413 })
  await assert.rejects(uploadPhoto(selected, owner, attempt), (e) => e.status === 413 && /5MB/.test(e.message))
  globalThis.fetch = async () => new Response(JSON.stringify({ photo_token: 'wrong' }))
  await assert.rejects(uploadPhoto(selected, owner, attempt), /선택은 유지/)
})

test('upload cancellation aborts only file transmission and preserves the selected original for retry', async (t) => {
  const controller = new AbortController(), selected = file()
  const attempt = { id: crypto.randomUUID(), token: 'b'.repeat(43) }
  t.mock.method(globalThis, 'fetch', (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })
  }))
  const task = uploadPhoto(selected, owner, attempt, { signal: controller.signal })
  controller.abort()
  await assert.rejects(task, /업로드를 취소했습니다/)
  assert.equal(selected.name, '기증 사진.png')
  assert.equal(await selected.text(), 'test image bytes')
})

test('lost upload response reuses the same capability and completed uploads are not duplicated', async () => {
  const attempts = []
  let calls = 0
  const session = createPhotoUploadSession(async (photo, visitor, attempt) => {
    attempts.push({ id: attempt.id, token: attempt.token })
    if (++calls === 1) throw new Error('lost response')
    return { photo_token: attempt.token, expires_at: Date.now() + 86400000 }
  })
  const selected = file()
  await assert.rejects(session.tokenFor(selected, owner), /lost response/)
  const token = await session.tokenFor(selected, owner)
  assert.equal(await session.tokenFor(selected, owner), token)
  assert.deepEqual(attempts[0], attempts[1])
  assert.equal(calls, 2)
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(await session.tokenFor(file(), owner), token)
})

test('concurrent calls share an in-flight upload and failures never clear the selected file', async () => {
  let complete, calls = 0
  const selected = file()
  const session = createPhotoUploadSession((photo, visitor, attempt) => {
    calls++
    return new Promise((resolve) => { complete = () => resolve({ photo_token: attempt.token, expires_at: Date.now() + 100000 }) })
  })
  const first = session.tokenFor(selected, owner), second = session.tokenFor(selected, owner)
  assert.equal(calls, 1)
  complete()
  assert.equal(await first, await second)
  assert.equal(selected.name, '기증 사진.png')
})

test('cleanup-pending responses inform the owner without treating a committed deletion as a failure', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => owner } })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204, headers: { 'X-Photo-Cleanup': 'pending' } }))
  const notices = [], paths = []
  assert.equal(await deleteArtworkAfterConfirmation(artwork, owner, { confirm: () => true, notify: (text) => notices.push(text), navigate: (path) => paths.push(path) }), true)
  assert.match(notices[0], /작품은 삭제되었습니다/)
  assert.deepEqual(paths, ['/gallery'])
  globalThis.fetch = async () => new Response(JSON.stringify(artwork), { headers: { 'X-Photo-Cleanup': 'pending' } })
  assert.equal((await artworkRequest('/api/artworks/42', {}, { method: 'PUT' })).photo_cleanup_pending, true)
})

test('photo edit loads its existing image and description, while every exhibition reuses the photo frame', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { ArtworkEditForm } = await server.ssrLoadModule('/src/ArtworkManagement.jsx')
    const edit = renderToStaticMarkup(React.createElement(ArtworkEditForm, { artwork, visitorId: owner }))
    assert.match(edit, /현재 저장된 작품 사진/)
    assert.match(edit, /name="refined_description"/)
    assert.ok(edit.includes(artwork.refined_description))
    assert.match(edit, /새 사진을 선택하지 않으면 기존 사진이 유지/)
    assert.match(edit, /type="file"/)
    const noDescription = renderToStaticMarkup(React.createElement(ArtworkEditForm, { artwork: { ...artwork, refined_description: null }, visitorId: owner }))
    assert.match(noDescription, /name="refined_description"/)
    const { default: PhotoSelection } = await server.ssrLoadModule('/src/PhotoSelection.jsx')
    const selected = renderToStaticMarkup(React.createElement(PhotoSelection, { photo: { file: file(), url: 'blob:preview', error: '', clear() {}, select() {} } }))
    assert.match(selected, /사진 선택 취소/)
    assert.match(selected, /src="blob:preview"/)
    const { LiveArtworkCard } = await server.ssrLoadModule('/src/ArtworkPages.jsx')
    const { default: Exhibition } = await server.ssrLoadModule('/src/ArtworkExhibition.jsx')
    const { HallExhibition } = await server.ssrLoadModule('/src/HallOfFame.jsx')
    const { RandomExhibition } = await server.ssrLoadModule('/src/RandomArtwork.jsx')
    for (const element of [React.createElement(LiveArtworkCard, { artwork }), React.createElement(Exhibition, { artwork }),
      React.createElement(HallExhibition, { resource: { status: 'success', data: [artwork] } }),
      React.createElement(RandomExhibition, { resource: { status: 'success', data: artwork, pending: false }, onNext() {} })]) {
      const html = renderToStaticMarkup(element)
      assert.match(html, /data-frame="antique-gold"/)
      assert.match(html, /class="exhibition-image"/)
      assert.match(html, /\/api\/artworks\/42\/image/)
    }
  } finally { await server.close() }
})
