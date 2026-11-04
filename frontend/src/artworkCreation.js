export const imageStyles = [
  { value: 'watercolor', label: '수채화', english: 'WATERCOLOR', mark: '≈' },
  { value: 'oil', label: '유화', english: 'OIL PAINTING', mark: '▰' },
  { value: 'pointillism', label: '점묘화', english: 'POINTILLISM', mark: '∴' },
  { value: 'pencil', label: '연필 드로잉', english: 'PENCIL', mark: '╱' },
  { value: 'collage', label: '콜라주', english: 'COLLAGE', mark: '◈' },
]

export const maxPhotoBytes = 5 * 1024 * 1024
const previewTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

export function validatePhotoFile(file) {
  const extension = file?.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
  if (!previewTypes[extension] || (file.type && file.type !== previewTypes[extension])) throw new Error('JPG, JPEG, PNG, WEBP 사진만 선택해 주세요.')
  if (/[\\/:\u0000-\u001f]/.test(file.name)) throw new Error('폴더 경로가 없는 사진 파일을 선택해 주세요.')
  if (file.size === 0) throw new Error('비어 있는 파일입니다. 다른 사진을 선택해 주세요.')
  if (file.size > maxPhotoBytes) throw new Error('사진은 5MB 이하로 선택해 주세요.')
  return previewTypes[extension]
}

export function imageDonationBlockReason(mode, ready = false, photoReady = false) {
  if (mode === 'text') return ''
  if (mode === 'photo') return photoReady ? '' : '기증할 사진을 선택하고 미리보기가 표시되는지 확인해 주세요.'
  if (mode === 'generated' && ready) return ''
  return 'AI 이미지를 생성하고 결과 확인란을 선택해야 기증할 수 있습니다. 아직 기증 준비 중입니다. 이미지 없이 텍스트로도 기증할 수 있습니다.'
}

// Local preview only. Actual upload is a separate, explicit donation step.
export function createPhotoPreview(file) {
  validatePhotoFile(file)
  const url = URL.createObjectURL(file)
  let disposed = false
  return {
    file, url,
    dispose() {
      if (!disposed) URL.revokeObjectURL(url)
      disposed = true
    },
  }
}
