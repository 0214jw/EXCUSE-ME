import { artworkCategories, characterCount, trimText } from './artworkRules.js'

export const initialCuratorState = { status: 'idle', titles: [], description: '', confirmed: false, snapshot: null, error: '' }

export function curatorInput(values) {
  return { title: trimText(values.title), content: trimText(values.content), category: values.category }
}

export function curatorInputError(values) {
  const input = curatorInput(values)
  if (characterCount(input.content) < 10 || characterCount(input.content) > 300) return '먼저 아래 핑계 내용을 10~300자로 작성해 주세요.'
  if (!artworkCategories.includes(input.category)) return '먼저 카테고리를 선택해 주세요.'
  if (characterCount(input.title) > 50) return '작품명은 50자 이내로 입력하거나 비워두고 추천받아 주세요.'
  return ''
}

export function curatorReducer(state, action) {
  switch (action.type) {
    case 'start': return { ...state, status: 'loading', error: '' }
    case 'success': return { ...state, status: 'success', titles: action.result.titles, description: action.result.refined_description, snapshot: action.snapshot, confirmed: false, error: '' }
    case 'error': return { ...state, status: 'error', error: action.message }
    case 'edit': return { ...state, description: action.value, confirmed: false }
    case 'input_changed': return { ...state, confirmed: false }
    case 'confirm': return { ...state, confirmed: Boolean(action.value) }
    default: return state
  }
}

export function curatorIsStale(state, values) {
  const input = curatorInput(values)
  return Boolean(state.snapshot && (state.snapshot.content !== input.content || state.snapshot.category !== input.category))
}

// Only an explicitly reviewed, final description enters the donation request.
// Candidates, generation snapshots and drafts stay in memory and are never posted.
export function curatorDonationFields(state) {
  const description = trimText(state.description)
  if (!state.confirmed || !description) return {}
  if (characterCount(description) > 1000) throw new Error('저장할 작품 설명은 1000자 이내로 입력해 주세요.')
  return { refined_description: description, description_confirmed: true }
}
