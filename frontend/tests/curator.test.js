import test from 'node:test'
import assert from 'node:assert/strict'
import { initialCuratorState, curatorReducer, curatorInputError, curatorInput, curatorIsStale, curatorDonationFields } from '../src/curatorState.js'
import { requestCurator } from '../src/curatorApi.js'

const values = { title: '', content: '이불의 중력이 강해서 일어나지 못했습니다.', category: '지각·조퇴', author: '' }
const result = { titles: ['중력과의 협상', '기상 유예의 미학', '이불 속 작은 전시'], refined_description: '이 작품은 아침의 작은 사정을 조명합니다. 이불의 무게는 의지와 현실 사이의 거리를 드러냅니다.' }
const ready = () => curatorReducer(initialCuratorState, { type: 'success', result, snapshot: curatorInput(values) })

test('curator accepts an empty title, validates the original and uses only the five categories', () => {
  assert.equal(curatorInputError(values), '')
  assert.ok(curatorInputError({ ...values, content: '짧음' }))
  assert.ok(curatorInputError({ ...values, category: '과제' }))
  assert.ok(curatorInputError({ ...values, title: '가'.repeat(51) }))
  assert.deepEqual(curatorInput({ ...values, content: '  ' + values.content + '  ' }), { title: '', content: values.content, category: values.category })
})

test('generation is a draft; only the confirmed final explanation enters the donation payload', () => {
  const generated = ready()
  assert.deepEqual(curatorDonationFields(generated), {})
  const edited = curatorReducer(generated, { type: 'edit', value: '직접 고친 최종 작품 설명입니다.' })
  assert.deepEqual(curatorDonationFields(edited), {})
  const confirmed = curatorReducer(edited, { type: 'confirm', value: true })
  assert.deepEqual(curatorDonationFields(confirmed), { refined_description: edited.description, description_confirmed: true })
  assert.equal('titles' in curatorDonationFields(confirmed), false)
  assert.equal('content' in curatorDonationFields(confirmed), false)
  assert.deepEqual(curatorDonationFields(curatorReducer(confirmed, { type: 'input_changed' })), {})
  assert.deepEqual(curatorDonationFields(curatorReducer(confirmed, { type: 'edit', value: '다시 수정한 설명' })), {})
  assert.throws(() => curatorDonationFields({ ...confirmed, description: '가'.repeat(1001) }), /1000자/)
})

test('title changes never regenerate the description; original/category changes mark prior results stale', () => {
  const state = ready()
  assert.equal(curatorIsStale(state, { ...values, title: result.titles[1] }), false)
  assert.equal(curatorIsStale(state, { ...values, title: '내가 직접 고친 제목' }), false)
  assert.equal(curatorIsStale(state, { ...values, content: '새로 작성한 다른 원문 핑계입니다.' }), true)
  assert.equal(curatorIsStale(state, { ...values, category: '약속' }), true)
  assert.equal(curatorReducer(state, { type: 'input_changed' }).description, state.description)
})

test('regeneration failure preserves prior results and edits; successful regeneration requires fresh confirmation', () => {
  const approved = curatorReducer(curatorReducer(ready(), { type: 'edit', value: '수정 중인 설명입니다.' }), { type: 'confirm', value: true })
  const failed = curatorReducer(curatorReducer(approved, { type: 'start' }), { type: 'error', message: '연결 실패' })
  assert.equal(failed.description, approved.description)
  assert.deepEqual(failed.titles, approved.titles)
  assert.equal(failed.confirmed, true)
  const regenerated = curatorReducer(failed, { type: 'success', result, snapshot: curatorInput(values) })
  assert.equal(regenerated.confirmed, false)
})

test('curator client validates the pair of outputs and keeps provider keys out of browser requests', async (t) => {
  const payload = { ...curatorInput(values), visitor_id: 'demo', request_id: 'request' }
  const before = structuredClone(payload)
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/curator'))
    assert.equal(options.headers.Authorization, undefined)
    assert.deepEqual(JSON.parse(options.body), payload)
    return new Response(JSON.stringify(result), { status: 200 })
  })
  assert.deepEqual(await requestCurator(payload), result)
  assert.deepEqual(payload, before)
  for (const data of [{}, { ...result, titles: ['제목 하나'] }, { ...result, titles: ['중복 제목', '중복 제목', '중복 제목'] }, { ...result, refined_description: '' }]) {
    globalThis.fetch = async () => new Response(JSON.stringify(data), { status: 200 })
    await assert.rejects(requestCurator(payload), /결과를 받지 못했습니다/)
  }
})

test('missing key, rate limits, duplicate, API errors and timeouts do not auto-retry', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ detail: 'AI 미설정, 텍스트 기증 가능' }), { status: 503 }))
  await assert.rejects(requestCurator({}), /텍스트 기증 가능/)
  assert.equal(mock.mock.calls.length, 1)
  for (const status of [409, 429, 502, 504]) {
    let calls = 0
    globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ detail: '요청 실패 안내' }), { status }) }
    await assert.rejects(requestCurator({}), (error) => error.status === status && /자동 재시도하지 않습니다/.test(error.message) && !error.message.includes('요청 실패 안내'))
    assert.equal(calls, 1)
  }
  globalThis.fetch = async () => { throw new DOMException('Timeout', 'TimeoutError') }
  await assert.rejects(requestCurator({}), /자동 재시도하지 않습니다/)
})

test('curator exposes only allowlisted failure reasons, never raw provider messages, without retries', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request') })
  for (const [code, expected] of [
    ['curator_not_configured', /키가 설정되어 있지/],
    ['curator_authentication_failed', /인증에 실패/],
    ['curator_access_denied', /접근이 거부/],
    ['curator_model_unavailable', /모델을 찾을 수 없거나/],
    ['curator_quota_exceeded', /잔액 또는 사용 한도/],
    ['curator_provider_rate_limited', /일시적으로 제한/],
    ['curator_request_rejected', /요청 설정이 거절/],
    ['curator_network_error', /네트워크 연결/],
    ['curator_incomplete_response', /끝까지 생성되지 않아/],
    ['curator_invalid_response', /형식에 맞지 않아/],
    ['curator_response_refused', /추천을 제공하지 않았/],
    ['unknown_private_code', /지금은 AI 추천/],
    ['__proto__', /지금은 AI 추천/],
    [{ toString: null }, /지금은 AI 추천/],
    [null, /지금은 AI 추천/],
  ]) {
    let calls = 0
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ detail: { code, message: 'private SQL trace and test-only-not-a-real-key' } }), { status: 503 }) }
    await assert.rejects(requestCurator({}), error => {
      assert.equal(error.status, 503)
      assert.match(error.message, expected)
      assert.match(error.message, /추천 없이 텍스트 기증 가능/)
      assert.match(error.message, /자동 재시도하지 않습니다/)
      assert.doesNotMatch(error.message, /private|SQL|test-only|unknown_private/)
      return true
    })
    assert.equal(calls, 1)
  }
})
