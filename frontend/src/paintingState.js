import { normalizeArtwork, validateArtwork } from './artworkRules.js'

export const initialPaintingState = { status: 'idle', result: null, snapshot: '', confirmed: false, error: '' }

export function paintingInput(values, description, style) {
  const { title, content, category } = normalizeArtwork(values)
  return { title, content, category, refined_description: description || null, image_style: style }
}

export function paintingInputError(values, description, descriptionConfirmed) {
  const errors = validateArtwork(values)
  if (errors.title || errors.content || errors.category) return errors.title || errors.content || errors.category
  if (description?.trim() && !descriptionConfirmed) return '작품 설명을 이미지에 반영하려면 위 설명 확인란을 선택해 주세요. 설명을 비우면 원문만으로 제작할 수 있습니다.'
  return ''
}

export function paintingReducer(state, action) {
  switch (action.type) {
    case 'start': return { ...state, status: 'loading', confirmed: false, error: '' }
    case 'success': return { status: 'success', result: action.result, snapshot: action.snapshot, confirmed: false, error: '' }
    case 'error': return { ...state, status: 'error', confirmed: false, error: action.message }
    case 'confirm': return { ...state, confirmed: action.value }
    case 'invalidate': return { ...state, confirmed: false }
    default: return state
  }
}

export function paintingReady(state, input, now = Date.now()) {
  return Boolean(state.status !== 'loading' && state.result && state.confirmed &&
    state.snapshot === JSON.stringify(input) && state.result.expires_at * 1000 > now)
}

export function paintingDonationFields(mode, state, input) {
  return mode === 'generated' && paintingReady(state, input)
    ? { image_token: state.result.image_token, image_confirmed: true } : {}
}
