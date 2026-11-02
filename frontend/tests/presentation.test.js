import test from 'node:test'
import assert from 'node:assert/strict'
import { artworkDescription, artworkImageUrl } from '../src/artworkPresentation.js'

test('missing/empty refined copy uses an explicit temporary description without changing the original', () => {
  const artwork = { content: '이불의 중력이 강해서\n오늘도 늦었습니다.' }
  const before = structuredClone(artwork)
  for (const refined_description of [undefined, null, '', ' \n ']) {
    const description = artworkDescription({ ...artwork, refined_description })
    assert.equal(description.temporary, true)
    assert.ok(description.text.includes(artwork.content))
  }
  assert.deepEqual(artworkDescription({ ...artwork, refined_description: '  별도로 다듬은 작품 설명\n둘째 줄  ' }), {
    text: '별도로 다듬은 작품 설명\n둘째 줄', temporary: false,
  })
  assert.deepEqual(artwork, before)
})

test('absent/invalid images resolve to placeholder; supported future media paths stay intact', () => {
  for (const image_url of [undefined, null, '', '  ', 'javascript:alert(1)', 'data:image/png;base64,test', '//example.test/art.png', '/\\example.test/art.png', 'https://', 'https://example.test/\nart.png']) {
    assert.equal(artworkImageUrl({ image_url }), null)
  }
  for (const image_url of ['/media/art.png', 'https://example.test/art.png', 'http://127.0.0.1:8000/media/art.png']) {
    assert.equal(artworkImageUrl({ image_url }), image_url)
  }
})
