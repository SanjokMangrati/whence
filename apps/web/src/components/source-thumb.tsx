import { Pilcrow } from 'lucide-react'
import Image from 'next/image'
import { Icon } from './icon'
import { youtubeThumbnail, youtubeVideoId } from '@/lib/youtube'

export function SourceThumb({
  url,
  sourceType,
  className,
}: {
  url: string
  sourceType: 'video' | 'article'
  className: string
}) {
  const videoId = sourceType === 'video' ? youtubeVideoId(url) : null
  if (videoId !== null) {
    return (
      <Image
        src={youtubeThumbnail(videoId)}
        alt=""
        width={480}
        height={270}
        unoptimized
        className={`aspect-video w-full bg-ink object-cover ${className}`}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`grid aspect-video w-full place-items-center border border-line bg-card text-ink-3 ${className}`}
    >
      <Icon icon={Pilcrow} size={20} />
    </span>
  )
}
