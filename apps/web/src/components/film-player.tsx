'use client'

import { Player, type PlayerRef } from '@remotion/player'
import { useEffect, type RefObject } from 'react'
import { Film } from '@/film/film'
import { DURATION, FPS, HEIGHT, WIDTH } from '@/film/timeline'

export default function FilmPlayer({
  player,
  today,
  onReady,
  onFrame,
  onEnded,
}: {
  player: RefObject<PlayerRef | null>
  today: number
  onReady: () => void
  onFrame: (frame: number) => void
  onEnded: () => void
}) {
  useEffect(() => {
    const current = player.current
    if (current === null) return
    const frame = ({ detail }: { detail: { frame: number } }) => onFrame(detail.frame)
    const end = () => {
      onFrame(DURATION - 1)
      onEnded()
    }
    current.addEventListener('frameupdate', frame)
    current.addEventListener('ended', end)
    onReady()
    return () => {
      current.removeEventListener('frameupdate', frame)
      current.removeEventListener('ended', end)
    }
  }, [player, onReady, onFrame, onEnded])

  return (
    <Player
      ref={player}
      component={Film}
      inputProps={{ today }}
      durationInFrames={DURATION}
      fps={FPS}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      moveToBeginningWhenEnded={false}
      acknowledgeRemotionLicense
      style={{ width: '100%', height: '100%' }}
    />
  )
}
