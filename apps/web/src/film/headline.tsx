import { Fragment, type ReactNode } from 'react'
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion'
import { EASE_IN_OUT, ease } from './motion'

const STAGGER = 4

function Words({ words, start }: { words: ReactNode[]; start: number }) {
  const frame = useCurrentFrame()
  return words.map((word, index) => {
    const at = start + index * STAGGER
    return (
      <Fragment key={index}>
        {index > 0 && ' '}
        <span className="inline-block overflow-hidden pb-[0.14em] align-bottom">
          <span
            className="inline-block"
            style={{ translate: `0 ${ease(frame, [at, at + 18], [110, 0])}%` }}
          >
            {word}
          </span>
        </span>
      </Fragment>
    )
  })
}

function Card({ children, exit }: { children: ReactNode; exit: number | null }) {
  const frame = useCurrentFrame()
  const leaving = exit === null ? 0 : ease(frame, [exit, exit + 10], [0, 1], EASE_IN_OUT)
  return (
    <AbsoluteFill className="text-ink">
      <div
        className="absolute top-0 left-0 grid h-[540px] w-[960px] origin-top-left scale-200 content-center justify-items-center gap-7 px-20"
        style={{ opacity: 1 - leaving }}
      >
        <div className="grid justify-items-center gap-7">{children}</div>
      </div>
    </AbsoluteFill>
  )
}

export function Headline({ words, duration }: { words: ReactNode[]; duration: number }) {
  return (
    <Card exit={duration - 10}>
      <p className="display-xl text-center text-balance">
        <Words words={words} start={2} />
      </p>
    </Card>
  )
}

export function EndCard() {
  const frame = useCurrentFrame()
  return (
    <Card exit={null}>
      <Img
        src={staticFile('whence-lockup.svg')}
        alt="Whence"
        width={186}
        height={27}
        style={{
          opacity: ease(frame, [4, 20], [0, 1]),
          translate: `0 ${ease(frame, [4, 24], [10, 0])}px`,
        }}
      />
      <p className="display-l text-center text-balance">
        <Words
          words={[
            'Study',
            'notes',
            'for',
            'the',
            'YouTube',
            'videos',
            'you',
            <i key="learn">learn</i>,
            'from.',
          ]}
          start={16}
        />
      </p>
    </Card>
  )
}
