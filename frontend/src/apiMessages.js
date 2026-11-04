// Server/proxy details may contain technical diagnostics. Keep the HTTP status
// for client behavior, and show only our own messages and field hints.
export function serverMessage(status, context = 'artwork') {
  if (context === 'photo') {
    if (status === 413) return '사진은 5MB 이하로 선택해 주세요.'
    if (status === 422) return '사진을 읽을 수 없습니다. 5MB 이하의 JPG, PNG, WEBP 정지 이미지를 선택해 주세요. 최대 4천만 화소까지 지원합니다.'
    if (status === 410) return '사진 기증 가능 시간이 지났습니다. 사진을 다시 선택해 주세요.'
    if (status === 409) return '사진 선택과 기존 저장 결과를 확인한 뒤 다시 시도해 주세요.'
    if (status === 429) return '다른 사진을 확인하는 중입니다. 잠시 후 다시 시도해 주세요.'
    return '사진 업로드에 실패했습니다. 입력과 사진 선택은 유지됩니다. 잠시 후 다시 시도해 주세요.'
  }
  if (context === 'curator' || context === 'painting') {
    const advice = context === 'curator' ? '추천 없이 텍스트 기증 가능합니다.' : '입력은 유지됩니다. 이미지 없이 텍스트로 기증할 수 있습니다.'
    const reason = status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
      : status === 409 ? '앞선 요청이 처리 중이거나 이미 완료되었습니다. 결과를 확인해 주세요.'
      : status === 422 ? '작품명과 핑계 내용을 확인해 주세요.'
      : status === 504 ? '응답 대기 시간이 지났습니다.'
      : context === 'curator' ? '지금은 AI 추천을 이용할 수 없습니다.' : '지금은 이미지 제작을 이용할 수 없습니다.'
    return `${reason} ${advice} 자동 재시도하지 않습니다.${context === 'painting' && status >= 500 ? ' 이미 요청한 이미지의 비용 발생 여부는 사용량에서 확인해 주세요.' : ''}`
  }
  if (context === 'recognition') return status === 404 ? '작품이 없거나 이미 삭제되었습니다.' : '좋아요를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  if (status === 404) return '작품을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.'
  if (status === 403) return '다른 방문객의 작품은 수정하거나 삭제할 수 없습니다. 기증할 때 사용한 브라우저인지 확인해 주세요.'
  if (status === 422) return '입력값을 확인해 주세요.'
  if (status === 409) return '기존 저장 결과와 입력 내용을 확인해 주세요. 작성 중인 내용은 유지됩니다.'
  if (status === 410) return '이미지 기증 가능 시간이 지났습니다. 선택 상태를 다시 확인해 주세요.'
  if (status === 429) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

const fieldMessages = {
  title: '작품명은 2~50자로 입력해 주세요.',
  content: '핑계 내용은 10~300자로 입력해 주세요.',
  category: '카테고리 한 가지를 선택해 주세요.',
  author: '작가명은 최대 20자로 입력해 주세요.',
  refined_description: '작품 설명은 최대 1000자로 입력해 주세요.',
}

export function serverFieldMessages(errors) {
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return {}
  return Object.fromEntries(Object.entries(fieldMessages).filter(([key]) => Object.hasOwn(errors, key)))
}
