import test from 'node:test'
import assert from 'node:assert/strict'
import { artworkCategories, characterCount, normalizeArtwork, selectArtworks, validateArtwork } from '../src/artworkRules.js'
import { categories, sampleArtworks, selectSampleArtworks } from '../src/sampleArtworks.js'
import { getVisitorId } from '../src/visitor.js'

const valid = { title: '이불의 중력', content: '오늘은 이불의 중력이 너무 강했습니다.', category: '지각·조퇴', author: '' }

test('exact category contract, sample classification and original sample sorting', () => {
  assert.deepEqual(artworkCategories, ['지각·조퇴', '휴가·병가', '약속', '운동', '기타'])
  assert.deepEqual(categories, ['전체', ...artworkCategories])
  assert.equal(sampleArtworks.length, 8)
  assert.equal(new Set(sampleArtworks.map((row) => row.id)).size, 8)
  const original = structuredClone(sampleArtworks)
  for (const category of artworkCategories) {
    assert.ok(sampleArtworks.some((row) => row.category === category))
    assert.ok(selectSampleArtworks(category).every((row) => row.category === category))
  }
  const latest = selectSampleArtworks()
  assert.ok(latest.every((row, i) => !i || Date.parse(latest[i - 1].createdAt) >= Date.parse(row.createdAt)))
  const popular = selectSampleArtworks('전체', 'popular')
  assert.ok(popular.every((row, i) => !i || popular[i - 1].sampleRecognitions >= row.sampleRecognitions))
  assert.deepEqual(sampleArtworks, original)
})

test('form rules reject invalid values and handle exact Unicode boundaries', () => {
  assert.deepEqual(validateArtwork(valid), {})
  for (const category of ['지각', '과제', '', '전체', '지각ㆍ조퇴']) assert.ok(validateArtwork({ ...valid, category }).category)
  for (const title of ['', '  ', '가', '😀'.repeat(51)]) assert.ok(validateArtwork({ ...valid, title }).title)
  for (const content of ['', ' '.repeat(20), '가'.repeat(9), '가'.repeat(301)]) assert.ok(validateArtwork({ ...valid, content }).content)
  for (const length of [2, 49, 50]) assert.deepEqual(validateArtwork({ ...valid, title: '😀'.repeat(length) }), {})
  for (const length of [10, 299, 300]) assert.deepEqual(validateArtwork({ ...valid, content: '가'.repeat(length) }), {})
  assert.ok(validateArtwork({ ...valid, author: '가'.repeat(21) }).author)
  assert.deepEqual(validateArtwork({ ...valid, author: '😀'.repeat(20) }), {})
  assert.equal(characterCount('😀'), 1)
  assert.deepEqual(normalizeArtwork({ ...valid, title: ' \n제목\n ', content: ' \n가나다라\n마바사아자차 ', author: ' \n ' }), {
    title: '제목', content: '가나다라\n마바사아자차', category: '지각·조퇴', author: '익명의 예술가',
  })
})

test('live category filters preserve newest order without mixing samples or mutating data', () => {
  const rows = [{ id: 1, category: '약속', created_at: '2026-11-02T01:00:00Z' },
    { id: 2, category: '운동', created_at: '2026-11-02T02:00:00Z' },
    { id: 3, category: '약속', created_at: '2026-11-02T02:00:00Z' }]
  const original = structuredClone(rows)
  assert.deepEqual(selectArtworks(rows).map((row) => row.id), [3, 2, 1])
  assert.deepEqual(selectArtworks(rows, '약속').map((row) => row.id), [3, 1])
  assert.deepEqual(selectArtworks(rows, '기타'), [])
  assert.deepEqual(selectArtworks([]), [])
  assert.deepEqual(rows, original)
})

test('demo ID persists, separates browser stores, rejects invalid stored ID and reports blocked storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const makeStore = () => {
    const values = new Map()
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  }
  try {
    const a = makeStore()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: a })
    const first = getVisitorId()
    assert.equal(getVisitorId(), first)
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: makeStore() })
    assert.notEqual(getVisitorId(), first)
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: a })
    assert.equal(getVisitorId(), first)
    a.setItem('excuse-me.visitor-id', 'invalid')
    assert.notEqual(getVisitorId(), 'invalid')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Blocked') } })
    assert.throws(getVisitorId, /방문객 정보를 저장할 수 없습니다/)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})
