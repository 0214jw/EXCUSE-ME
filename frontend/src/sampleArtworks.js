// Design samples only. Authors, dates and recognition counts are fictional.
// This is not a DB schema or the future artwork API contract.
export const categories = ['전체', '지각', '과제', '약속', '운동', '기타']

export const sampleArtworks = [
  {
    id: 8,
    title: '중력의 사적인 사정',
    content: '오늘따라 침대 주변의 중력이 유난히 강했습니다. 일어나려는 의지는 있었으나, 물리 법칙을 거스를 수는 없었습니다.',
    author: '뉴턴의 후손',
    category: '지각',
    createdAt: '2026-10-30T09:00:00+09:00',
    sampleRecognitions: 128,
    tone: 'wine',
    quote: '의지는 있었으나,\n중력이 강했습니다.',
  },
  {
    id: 7,
    title: '파일은 완성되었습니다',
    content: '과제는 완성했습니다. 다만 파일이 제출이라는 현실을 받아들이지 못하고 제 컴퓨터에 남기로 했습니다.',
    author: '저장만 열두 번',
    category: '과제',
    createdAt: '2026-10-29T18:00:00+09:00',
    sampleRecognitions: 96,
    tone: 'paper',
    quote: '완성은 했습니다.\n제출과는 별개로.',
  },
  {
    id: 6,
    title: '도착이라는 상대성',
    content: '마음은 이미 약속 장소에 도착했습니다. 몸이 마음의 속도를 따라잡지 못하고 있을 뿐입니다.',
    author: '마음만 급행',
    category: '약속',
    createdAt: '2026-10-28T12:00:00+09:00',
    sampleRecognitions: 215,
    tone: 'ink',
    quote: '마음은 벌써\n도착했습니다.',
  },
  {
    id: 5,
    title: '근육과의 협상 결렬',
    content: '운동을 하려 했지만 근육 측에서 오늘은 회복의 날이라고 주장했습니다. 원만한 관계를 위해 양보했습니다.',
    author: '내일부터 선수',
    category: '운동',
    createdAt: '2026-10-27T16:00:00+09:00',
    sampleRecognitions: 64,
    tone: 'olive',
    quote: '오늘은 근육의\n의견을 존중합니다.',
  },
  {
    id: 4,
    title: '고양이가 결정한 하루',
    content: '나가려고 했는데 고양이가 무릎에서 잠들었습니다. 작은 생명의 숙면보다 중요한 일정은 없다고 판단했습니다.',
    author: '집사의 의무',
    category: '기타',
    createdAt: '2026-10-26T11:00:00+09:00',
    sampleRecognitions: 173,
    tone: 'paper',
    quote: '고양이가 자니,\n일정도 잠시 쉽니다.',
  },
  {
    id: 3,
    title: '알람의 묵비권',
    content: '알람은 울렸다고 하고 저는 못 들었다고 합니다. 양측의 주장이 엇갈려 추가 수면 조사가 필요했습니다.',
    author: '다섯 분의 철학자',
    category: '지각',
    createdAt: '2026-10-25T08:00:00+09:00',
    sampleRecognitions: 87,
    tone: 'ink',
    quote: '알람과 저의\n진술이 다릅니다.',
  },
  {
    id: 2,
    title: '생각의 숙성 기간',
    content: '아이디어를 더 깊게 숙성시키고 있습니다. 마감일은 지났지만 훌륭한 생각에는 발효의 시간이 필요합니다.',
    author: '마감의 미학',
    category: '과제',
    createdAt: '2026-10-24T20:00:00+09:00',
    sampleRecognitions: 142,
    tone: 'wine',
    quote: '미완성이 아니라,\n숙성 중입니다.',
  },
  {
    id: 1,
    title: '출발 직전의 평행우주',
    content: '분명 출발하려고 문을 열었는데 다른 우주의 제가 다시 소파에 앉았습니다. 우주 간 의견 조율이 늦어졌습니다.',
    author: '소파 위 탐험가',
    category: '약속',
    createdAt: '2026-10-23T14:00:00+09:00',
    sampleRecognitions: 52,
    tone: 'olive',
    quote: '다른 우주의 저는\n이미 출발했습니다.',
  },
]

export function selectSampleArtworks(category = '전체', order = 'latest', artworks = sampleArtworks) {
  const filtered = artworks.filter((artwork) => category === '전체' || artwork.category === category)
  return filtered.sort((a, b) => {
    if (order === 'popular' && a.sampleRecognitions !== b.sampleRecognitions) {
      return b.sampleRecognitions - a.sampleRecognitions
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id
  })
}

export function sampleNumber(id) {
  return String(id).padStart(3, '0')
}
