import test from 'node:test'
import assert from 'node:assert/strict'
import { createPhotoPreview, imageDonationBlockReason, imageStyles } from '../src/artworkCreation.js'
import { normalizeArtwork } from '../src/artworkRules.js'

test('photo requires a decoded preview while file and style choices stay out of text JSON', () => {
  assert.equal(imageDonationBlockReason('text'), '')
  assert.match(imageDonationBlockReason('photo'), /미리보기/)
  assert.equal(imageDonationBlockReason('photo', false, true), '')
  for (const mode of ['generated', '', undefined, 'unknown']) {
    assert.match(imageDonationBlockReason(mode), /준비 중/)
  }
  assert.deepEqual(imageStyles.map(({ value, label }) => [value, label]), [
    ['watercolor', '수채화'], ['oil', '유화'], ['pointillism', '점묘화'], ['pencil', '연필 드로잉'], ['collage', '콜라주'],
  ])
  const photo = new File(['local content'], 'local.png', { type: 'image/png' })
  const result = normalizeArtwork({ title: '  작품명  ', content: '기존 텍스트 기증 내용은 그대로입니다.', category: '약속', author: '', file: photo, image_mode: 'photo', image_style: 'oil', image_url: 'blob:local-only' })
  assert.deepEqual(result, { title: '작품명', content: '기존 텍스트 기증 내용은 그대로입니다.', category: '약속', author: '익명의 예술가' })
})

test('local photo preview URLs expose the selected bytes and release on disposal', async () => {
  const first = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'photo.png', { type: 'image/png' })
  const second = new File(['another local image'], 'photo.webp', { type: 'image/webp' })
  const preview = createPhotoPreview(first)
  const replacement = createPhotoPreview(second)
  try {
    assert.ok(preview.url.startsWith('blob:'))
    assert.equal(preview.file, first)
    assert.deepEqual(new Uint8Array(await (await fetch(preview.url)).arrayBuffer()), new Uint8Array(await first.arrayBuffer()))
    preview.dispose()
    preview.dispose()
    await assert.rejects(fetch(preview.url))
    assert.equal(await (await fetch(replacement.url)).text(), 'another local image')
  } finally {
    preview.dispose()
    replacement.dispose()
  }
  await assert.rejects(fetch(replacement.url))
})

test('invalid or empty photo files cannot create a preview URL', () => {
  for (const file of [null, new File(['text'], 'text.txt', { type: 'text/plain' }), new File(['<svg/>'], 'vector.svg', { type: 'image/svg+xml' })]) {
    assert.throws(() => createPhotoPreview(file), /JPG, JPEG, PNG, WEBP/)
  }
  assert.throws(() => createPhotoPreview(new File([], 'empty.png', { type: 'image/png' })), /비어 있는 파일/)
})
