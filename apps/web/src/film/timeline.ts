export const FPS = 30
export const WIDTH = 1920
export const HEIGHT = 1080

export const SCENES = {
  paste: { from: 0, duration: 168 },
  making: { from: 168, duration: 84 },
  checkTitle: { from: 252, duration: 48 },
  check: { from: 300, duration: 244 },
  recallTitle: { from: 544, duration: 48 },
  recall: { from: 592, duration: 200 },
  reviewTitle: { from: 792, duration: 52 },
  summary: { from: 844, duration: 110 },
  back: { from: 954, duration: 116 },
  end: { from: 1070, duration: 90 },
} as const

export const DURATION = SCENES.end.from + SCENES.end.duration

export const CHAPTERS = [
  { name: 'Paste', from: SCENES.paste.from, text: 'Paste a link.' },
  { name: 'Check', from: SCENES.checkTitle.from, text: 'Jump to any moment.' },
  {
    name: 'Recall',
    from: SCENES.recallTitle.from,
    text: 'Answer, then check the video.',
  },
  { name: 'Review', from: SCENES.reviewTitle.from, text: 'See when it comes back.' },
] as const

export function chapterAt(frame: number): number {
  return CHAPTERS.findLastIndex((chapter) => frame >= chapter.from)
}
