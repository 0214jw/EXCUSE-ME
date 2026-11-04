import test from 'node:test'
import assert from 'node:assert/strict'
import { initialPaintingState, paintingInput, paintingInputError, paintingReducer, paintingReady, paintingDonationFields } from '../src/paintingState.js'
import { requestPainting } from '../src/paintingApi.js'
import { imageDonationBlockReason } from '../src/artworkCreation.js'
import { artworkImageUrl } from '../src/artworkPresentation.js'

const values = { title: ' 이불의 중력 ', content: '이불의 중력이 강해서 일어나지 못했습니다.', category: '지각·조퇴', author: '' }
const input = paintingInput(values, '확인한 작품 설명입니다.', 'oil')
const result = { image_token: 'a'.repeat(43), preview_data_url: 'data:image/png;base64,iVBORw==', expires_at: Date.now() / 1000 + 86400 }
const draft = () => paintingReducer(initialPaintingState, { type: 'success', result, snapshot: JSON.stringify(input) })

test('only a reviewed current unexpired painting capability can enter generated donation', () => {
  const before = structuredClone(values)
  assert.equal(paintingReady(draft(), input), false)
  assert.deepEqual(paintingDonationFields('generated', draft(), input), {})
  const reviewed = paintingReducer(draft(), { type: 'confirm', value: true })
  assert.equal(paintingReady(reviewed, input), true)
  assert.deepEqual(paintingDonationFields('generated', reviewed, input), { image_token: result.image_token, image_confirmed: true })
  for (const mode of ['text', 'photo']) assert.deepEqual(paintingDonationFields(mode, reviewed, input), {})
  for (const change of [{ title: '다른 제목' }, { content: '다른 원문 핑계입니다.' }, { category: '약속' }, { refined_description: '바뀐 설명' }, { image_style: 'pencil' }]) {
    assert.equal(paintingReady(reviewed, { ...input, ...change }), false)
  }
  assert.equal(paintingReady(reviewed, input, result.expires_at * 1000 + 1), false)
  assert.equal(paintingReady(paintingReducer(reviewed, { type: 'invalidate' }), input), false)
  assert.deepEqual(values, before)
  assert.equal('image_url' in paintingDonationFields('generated', reviewed, input), false)
  assert.equal(imageDonationBlockReason('generated', true), '')
  assert.ok(imageDonationBlockReason('generated', false))
  assert.ok(imageDonationBlockReason('photo', true))
})

test('painting validation requires source and reviewed description; failed requests preserve draft', () => {
  assert.equal(paintingInputError(values, '', false), '')
  assert.ok(paintingInputError({ ...values, title: '' }, '', false))
  assert.ok(paintingInputError(values, '미확인 설명', false))
  assert.equal(paintingInputError(values, '확인 설명', true), '')
  const state = paintingReducer(paintingReducer(draft(), { type: 'start' }), { type: 'error', message: '시간 초과' })
  assert.equal(state.result, result)
  assert.equal(state.confirmed, false)
  assert.equal(state.error, '시간 초과')
  assert.equal(artworkImageUrl({ image_url: '/api/artworks/12/image' }), 'http://127.0.0.1:8000/api/artworks/12/image')
})

test('image API has one explicit request, bounded timeout, structured preview and sanitized errors', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.ok(url.endsWith('/api/image-generations'))
    assert.equal(options.method, 'POST')
    assert.equal(options.cache, 'no-store')
    assert.ok(options.signal)
    assert.deepEqual(JSON.parse(options.body), input)
    return new Response(JSON.stringify(result), { status: 200 })
  }
  try {
    assert.deepEqual(await requestPainting(input), result)
    assert.equal(calls, 1)
    for (const [status, message] of [[503, '이미지 생성 꺼짐'], [429, '횟수 제한'], [409, '중복 요청'], [504, '시간 초과']]) {
      calls = 0
      globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ detail: message }), { status }) }
      await assert.rejects(requestPainting(input), (error) => error.status === status && /자동 재시도하지 않습니다/.test(error.message) && !error.message.includes(message))
      assert.equal(calls, 1)
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ ...result, preview_data_url: 'https://untrusted.test/picture' }))
    await assert.rejects(requestPainting(input), /입력은 유지/)
    globalThis.fetch = async () => { throw new DOMException('secret', 'TimeoutError') }
    await assert.rejects(requestPainting(input), /자동 재시도하지 않습니다/)
  } finally { globalThis.fetch = original }
})
