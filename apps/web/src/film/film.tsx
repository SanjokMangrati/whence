import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion'
import { EndCard, Headline } from './headline'
import { HomeScreen } from './home'
import { job, LINK, QUESTION_COUNT } from './job'
import { MakingScreen } from './making'
import { ease, rise, sweepStyle, typed } from './motion'
import { QuizScreen, SummaryScreen } from './quiz'
import { ReaderScreen } from './reader'
import { Shot } from './shot'
import { SCENES } from './timeline'

const ANSWER = "In attention, vectors talk. In the MLP, they don't."
const LIMIT = 3

function PasteScene({ today }: { today: number }) {
  const frame = useCurrentFrame()
  return (
    <Shot
      duration={SCENES.paste.duration}
      enter="tilt"
      exit="slide"
      pointer={[
        { at: 84, on: 'sheet', dx: 180, dy: 70 },
        { at: 100, on: 'sheet' },
        { at: 104, on: 'sheet' },
        { at: 118, on: 'make' },
      ]}
      clicks={[102, 120]}
      focus={[
        { at: 30, on: null },
        { at: 54, on: 'composer' },
        { at: 136, on: 'composer' },
        { at: 156, on: null },
      ]}
    >
      <HomeScreen
        today={today}
        link={typed(LINK, frame, 50, 76)}
        sheet={frame >= 102}
        pressed={frame >= 120 && frame < 126}
        used={frame >= 120 ? 1 : 0}
        limit={LIMIT}
        rows={[]}
        reviews={[]}
        selected={null}
        sourceTitle={job.specimen.source.title}
      />
    </Shot>
  )
}

function MakingScene() {
  const frame = useCurrentFrame()
  return (
    <Shot duration={SCENES.making.duration} enter="slide" exit="fade">
      <MakingScreen step={frame < 26 ? 0 : frame < 48 ? 1 : frame < 68 ? 2 : 3} />
    </Shot>
  )
}

function CheckScene() {
  const frame = useCurrentFrame()
  const opened = frame >= 64
  return (
    <>
      {opened && <style>{sweepStyle('film-sweep', frame, 84)}</style>}
      <Shot
        duration={SCENES.check.duration}
        enter="fade"
        exit="fade"
        pointer={[
          { at: 44, on: 'marker', dx: 160, dy: 110 },
          { at: 62, on: 'marker', leave: true },
          { at: 152, on: 'sheet-tab', dx: 120, dy: 70 },
          { at: 166, on: 'sheet-tab' },
          { at: 170, on: 'sheet-tab' },
          { at: 192, on: 'show-0', leave: true },
        ]}
        clicks={[64, 168, 194]}
        focus={[
          { at: 12, on: null },
          { at: 34, on: 'panel' },
          { at: 70, on: 'panel' },
          { at: 92, on: 'video' },
          { at: 128, on: 'video' },
          { at: 150, on: 'panel' },
        ]}
      >
        <ReaderScreen
          opened={opened}
          tab={ease(frame, [168, 178], [0, 1])}
          shownFacts={frame >= 194 ? 1 : 0}
          sheetFrom={(index) => rise(frame, 174 + index * 3)}
        />
      </Shot>
    </>
  )
}

function RecallScene() {
  const frame = useCurrentFrame()
  const answered = frame >= 96
  return (
    <>
      {answered && <style>{sweepStyle('film-sweep', frame, 106)}</style>}
      <Shot
        duration={SCENES.recall.duration}
        enter="fade"
        exit="fade"
        pointer={[
          { at: 74, on: 'show', dx: 170, dy: 90 },
          { at: 90, on: 'show', leave: true },
          { at: 134, on: 'good', dx: 90, dy: 80 },
          { at: 150, on: 'good', leave: true },
        ]}
        clicks={[92, 152]}
        focus={[
          { at: 6, on: null },
          { at: 30, on: 'quiz' },
        ]}
      >
        <QuizScreen
          typed={typed(ANSWER, frame, 20, 64)}
          pressed={frame >= 92 && frame < 98}
          answered={answered}
          answerFrom={rise(frame, 96)}
          picked={frame >= 152 ? 'good' : null}
        />
      </Shot>
    </>
  )
}

function SummaryScene({ dates }: { dates: Date[] }) {
  const frame = useCurrentFrame()
  return (
    <Shot
      duration={SCENES.summary.duration}
      enter="fade"
      exit="slide"
      pointer={[
        { at: 78, on: 'back-home', dx: 150, dy: 80 },
        { at: 94, on: 'back-home', leave: true },
      ]}
      clicks={[96]}
    >
      <SummaryScreen
        dates={dates}
        drawn={ease(frame, [28, 70], [0, 1])}
        rowFrom={(index) => rise(frame, 2 + index * 4)}
        pressed={frame >= 96 && frame < 102}
      />
    </Shot>
  )
}

function BackScene({ today, dates }: { today: number; dates: Date[] }) {
  const frame = useCurrentFrame()
  return (
    <Shot
      duration={SCENES.back.duration}
      enter="slide"
      exit="drop"
      pointer={[
        { at: 50, on: 'next-day', dx: 130, dy: 90 },
        { at: 66, on: 'next-day', leave: true },
      ]}
      clicks={[68]}
      focus={[
        { at: 22, on: null },
        { at: 44, on: 'calendar' },
      ]}
    >
      <HomeScreen
        today={today}
        link=""
        sheet={false}
        pressed={false}
        used={1}
        limit={LIMIT}
        rows={[
          {
            title: job.specimen.source.title,
            meta: `Notes · Cheat sheet · ${QUESTION_COUNT} questions`,
            next: dates[0]!,
          },
        ]}
        reviews={dates}
        selected={frame >= 68 ? dates[0]! : null}
        sourceTitle={job.specimen.source.title}
      />
    </Shot>
  )
}

export function Film({ today }: { today: number }) {
  const dates = job.reviewDates(today)
  return (
    <AbsoluteFill className="bg-paper-2 text-ink [&_*]:animate-none [&_*]:transition-none">
      <Sequence from={SCENES.paste.from} durationInFrames={SCENES.paste.duration}>
        <PasteScene today={today} />
      </Sequence>
      <Sequence from={SCENES.making.from} durationInFrames={SCENES.making.duration}>
        <MakingScene />
      </Sequence>
      <Sequence from={SCENES.checkTitle.from} durationInFrames={SCENES.checkTitle.duration}>
        <Headline
          duration={SCENES.checkTitle.duration}
          words={[
            'Every',
            'note',
            'has',
            'a',
            <>
              <i>timestamp</i>.
            </>,
          ]}
        />
      </Sequence>
      <Sequence from={SCENES.check.from} durationInFrames={SCENES.check.duration}>
        <CheckScene />
      </Sequence>
      <Sequence from={SCENES.recallTitle.from} durationInFrames={SCENES.recallTitle.duration}>
        <Headline
          duration={SCENES.recallTitle.duration}
          words={['Then', 'Whence', <i key="quizzes">quizzes</i>, 'you.']}
        />
      </Sequence>
      <Sequence from={SCENES.recall.from} durationInFrames={SCENES.recall.duration}>
        <RecallScene />
      </Sequence>
      <Sequence from={SCENES.reviewTitle.from} durationInFrames={SCENES.reviewTitle.duration}>
        <Headline
          duration={SCENES.reviewTitle.duration}
          words={[
            'Review',
            'only',
            'what',
            'you’re',
            'about',
            'to',
            <>
              <i>forget</i>.
            </>,
          ]}
        />
      </Sequence>
      <Sequence from={SCENES.summary.from} durationInFrames={SCENES.summary.duration}>
        <SummaryScene dates={dates} />
      </Sequence>
      <Sequence from={SCENES.back.from} durationInFrames={SCENES.back.duration}>
        <BackScene today={today} dates={dates} />
      </Sequence>
      <Sequence from={SCENES.end.from} durationInFrames={SCENES.end.duration}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  )
}
