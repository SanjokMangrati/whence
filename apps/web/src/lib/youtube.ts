export function youtubeVideoId(raw: string): string | null {
  const url = new URL(raw)
  const [first, second] = url.pathname.split('/').filter((segment) => segment !== '')
  if (url.hostname === 'youtu.be') return first ?? null
  if (first === 'watch') return url.searchParams.get('v')
  if (first === 'shorts' || first === 'embed' || first === 'live') return second ?? null
  return null
}

export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

export function seekPlayer(player: HTMLIFrameElement | null, seconds: number) {
  const target = player?.contentWindow
  for (const [func, args] of [
    ['seekTo', [seconds, true]],
    ['playVideo', []],
  ] as const) {
    target?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  }
}
