import { loadFont as loadHanken } from '@remotion/google-fonts/HankenGrotesk'
import { loadFont as loadPlexMono } from '@remotion/google-fonts/IBMPlexMono'
import { loadFont as loadNewsreader } from '@remotion/google-fonts/Newsreader'
import { AbsoluteFill, Composition } from 'remotion'
import { Film } from './film'
import { DURATION, FPS, HEIGHT, WIDTH } from './timeline'
import '../app/globals.css'

const serif = loadNewsreader('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily
loadNewsreader('italic', { weights: ['400'], subsets: ['latin'] })
const sans = loadHanken('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily
const mono = loadPlexMono('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily
const FONTS = `:root{--font-newsreader:'${serif}';--font-hanken:'${sans}';--font-plex-mono:'${mono}'}`

function startOfToday(): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime()
}

function Wide({ today }: { today: number }) {
  return (
    <>
      <style>{FONTS}</style>
      <Film today={today} />
    </>
  )
}

function Square({ today }: { today: number }) {
  const scale = HEIGHT / WIDTH
  return (
    <AbsoluteFill className="bg-paper">
      <style>{FONTS}</style>
      <div
        className="absolute left-0 origin-top-left"
        style={{
          width: WIDTH,
          height: HEIGHT,
          top: (HEIGHT - HEIGHT * scale) / 2,
          transform: `scale(${scale})`,
        }}
      >
        <Film today={today} />
      </div>
    </AbsoluteFill>
  )
}

export function Root() {
  const today = startOfToday()
  return (
    <>
      <Composition
        id="film"
        component={Wide}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ today }}
      />
      <Composition
        id="film-square"
        component={Square}
        durationInFrames={DURATION}
        fps={FPS}
        width={HEIGHT}
        height={HEIGHT}
        defaultProps={{ today }}
      />
    </>
  )
}
