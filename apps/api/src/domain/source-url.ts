import { DomainError } from './errors'
import type { SourceType } from './types'

export interface NormalizedSource {
  normalizedUrl: string
  url: string
  sourceType: SourceType
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])

const UNSUPPORTED_HOSTS = new Set([
  'vimeo.com',
  'tiktok.com',
  'twitch.tv',
  'x.com',
  'twitter.com',
  'instagram.com',
  'facebook.com',
  'soundcloud.com',
  'spotify.com',
])

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_[ce]id$|igshid$|ref$|ref_src$)/

export function normalizeSourceUrl(raw: string): NormalizedSource {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new DomainError('unsupported_source', 'The URL could not be parsed.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DomainError('unsupported_source', `${url.protocol} URLs are not supported.`)
  }
  if (url.username !== '' || url.password !== '') {
    throw new DomainError('unsupported_source', 'The URL carries credentials.')
  }
  if (url.port !== '') {
    throw new DomainError(
      'unsupported_source',
      'Only the default HTTP and HTTPS ports are fetched.',
    )
  }

  const host = hostOf(url)
  if (isUnsupportedHost(host)) {
    throw new DomainError('unsupported_source', `${host} is not a supported source.`)
  }

  if (YOUTUBE_HOSTS.has(host)) {
    const watchUrl = `https://www.youtube.com/watch?v=${youtubeVideoId(url, host)}`
    return { normalizedUrl: watchUrl, url: watchUrl, sourceType: 'video' }
  }

  return {
    normalizedUrl: normalizeArticleUrl(url, host),
    url: withoutTracking(url),
    sourceType: 'article',
  }
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '')
}

function isUnsupportedHost(host: string): boolean {
  return [...UNSUPPORTED_HOSTS].some((blocked) => host === blocked || host.endsWith(`.${blocked}`))
}

function youtubeVideoId(url: URL, host: string): string {
  const segments = url.pathname.split('/').filter((segment) => segment !== '')
  const candidate =
    host === 'youtu.be'
      ? segments[0]
      : segments[0] === 'watch'
        ? (url.searchParams.get('v') ?? undefined)
        : segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live'
          ? segments[1]
          : undefined

  if (candidate === undefined || !VIDEO_ID.test(candidate)) {
    throw new DomainError('unsupported_source', 'The URL carries no YouTube video id.')
  }
  return candidate
}

function withoutTracking(url: URL): string {
  const clean = new URL(url)
  clean.hash = ''
  const tracking = [...clean.searchParams.keys()].filter((key) => TRACKING_PARAMS.test(key))
  for (const key of tracking) clean.searchParams.delete(key)
  return clean.toString()
}

function normalizeArticleUrl(url: URL, host: string): string {
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.test(key))
    .sort(([left], [right]) => left.localeCompare(right))

  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : ''
  const query = new URLSearchParams(kept).toString()
  return `${url.protocol}//${host}${path}${query === '' ? '' : `?${query}`}`
}
