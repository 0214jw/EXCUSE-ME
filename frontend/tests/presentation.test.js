import test from 'node:test'
import assert from 'node:assert/strict'
import { artworkDescription, artworkImageUrl, artworkPosterExcerpt, artworkPosterTone } from '../src/artworkPresentation.js'

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

test('poster palette belongs to the artwork, independent of list order, category edits and refresh', () => {
  const works = Array.from({ length: 9 }, (_, index) => ({ id: index + 1, category: '약속' }))
  assert.deepEqual(works.map(artworkPosterTone), ['wine', 'paper', 'ink', 'wine', 'paper', 'ink', 'wine', 'paper', 'ink'])
  const original = new Map(works.map(work => [work.id, artworkPosterTone(work)]))
  for (const work of works.toReversed()) {
    assert.equal(artworkPosterTone(JSON.parse(JSON.stringify(work))), original.get(work.id))
    assert.equal(artworkPosterTone({ ...work, category: '운동' }), original.get(work.id))
  }
  for (const id of [undefined, null, NaN, -1, 'invalid']) {
    const work = { id, category: '휴가·병가' }
    assert.ok(['wine', 'paper', 'ink'].includes(artworkPosterTone(work)))
    assert.equal(artworkPosterTone(work), artworkPosterTone({ ...work }))
  }
})

test('poster excerpt quotes the donated first sentence without rewriting or mutating the original', () => {
  const content = '  알람은 분명 제시간에 울렸습니다. 눈도 떴고 시간도 확인했습니다.  '
  assert.equal(artworkPosterExcerpt(content), '알람은 분명 제시간에 울렸습니다.')
  assert.equal(artworkPosterExcerpt('딱 5.5분만 더 누우려 했습니다. 다음 문장입니다.'), '딱 5.5분만 더 누우려 했습니다.')
  assert.equal(artworkPosterExcerpt('첫 줄의 핑계\n둘째 줄의 사정'), '첫 줄의 핑계')
  const long = '😀'.repeat(300)
  const excerpt = artworkPosterExcerpt(long)
  assert.equal(Array.from(excerpt).length, 120)
  assert.equal(excerpt, '😀'.repeat(119) + '…')
  assert.equal(long.length, 600)
  for (const content of [null, undefined, '', '   ']) assert.equal(artworkPosterExcerpt(content), '')
})
