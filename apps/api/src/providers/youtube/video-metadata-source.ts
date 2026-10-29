import { DomainError } from '../../domain/errors'
import type { VideoMetadata, VideoMetadataSource } from '../../domain/ports'

const VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos'

const DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/

interface YouTubeVideo {
  snippet: {
    title: string
    channelTitle: string
    liveBroadcastContent: 'none' | 'live' | 'upcoming'
  }
  contentDetails: { duration: string }
}

interface YouTubeVideoList {
  items: YouTubeVideo[]
}

export interface YouTubeConfig {
  apiKey: string
}

export function createYouTubeVideoMetadataSource(config: YouTubeConfig): VideoMetadataSource {
  return {
    async lookup(url: string): Promise<VideoMetadata> {
      const id = new URL(url).searchParams.get('v')
      if (id === null) {
        throw new DomainError('unsupported_source', 'The URL carries no YouTube video id.')
      }

      const query = new URLSearchParams({ part: 'snippet,contentDetails', id })
      const response = await fetch(`${VIDEOS_ENDPOINT}?${query}`, {
        headers: { 'x-goog-api-key': config.apiKey },
      })
      if (!response.ok) {
        throw new DomainError('extraction_failed', `YouTube returned ${response.status}.`)
      }

      const { items } = (await response.json()) as YouTubeVideoList
      const video = items[0]
      if (video === undefined) {
        throw new DomainError('unsupported_source', 'The video is private or does not exist.')
      }
      if (video.snippet.liveBroadcastContent !== 'none') {
        throw new DomainError('unsupported_source', 'A live stream has no fixed length.')
      }

      return {
        title: video.snippet.title || null,
        channel: video.snippet.channelTitle || null,
        lengthMs: toMilliseconds(video.contentDetails.duration),
      }
    },
  }
}

function toMilliseconds(duration: string): number {
  const match = DURATION.exec(duration)
  if (match === null) {
    throw new DomainError('extraction_failed', `YouTube returned the duration ${duration}.`)
  }
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match
  return (
    (((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000
  )
}
