export const imageStyles = [
  { value: 'watercolor', label: '수채화', english: 'WATERCOLOR', mark: '≈' },
  { value: 'oil', label: '유화', english: 'OIL PAINTING', mark: '▰' },
  { value: 'pointillism', label: '점묘화', english: 'POINTILLISM', mark: '∴' },
  { value: 'pencil', label: '연필 드로잉', english: 'PENCIL', mark: '╱' },
  { value: 'collage', label: '콜라주', english: 'COLLAGE', mark: '◈' },
]

const previewTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function imageDonationBlockReason(mode) {
  if (mode === 'text') return ''
  if (mode === 'photo') return '사진은 브라우저 안에서만 미리보기할 수 있습니다. 사진 작품 기증과 AI 화풍 변환은 준비 중입니다. 지금 기증하려면 이미지 없이 텍스트로 기증을 선택해 주세요.'
  return 'AI 작품 제작과 이미지 기증은 준비 중입니다. 지금 기증하려면 이미지 없이 텍스트로 기증을 선택해 주세요.'
}

// Local-only blob URL: never upload the File or include it in an artwork payload.
// The owner must dispose on replacement, removal, mode change or unmount.
export function createPhotoPreview(file) {
  if (!previewTypes.has(file?.type)) throw new Error('JPG, PNG, WebP, GIF 사진을 선택해 주세요.')
  if (file.size === 0) throw new Error('비어 있는 파일입니다. 다른 사진을 선택해 주세요.')
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
