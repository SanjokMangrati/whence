import type { ReactNode } from 'react'
import { SpecimenTimeline } from '@/components/specimen-dates'
import { SpecimenQuestion } from '@/components/specimen-question'
import { SpecimenReader } from '@/components/specimen-reader'
import { SpecimenSheet } from '@/components/specimen-sheet'

export const HERO = {
  title: (
    <>
      Study notes for the YouTube videos you <i>learn</i> from.
    </>
  ),
  body: 'Paste a link to a video or an article. Whence writes notes with a timestamp on every line, then quizzes you on them, so you don’t have to watch it again.',
}

export const PROBLEM = {
  title: (
    <>
      You forget most of a video within a few <i>days</i>.
    </>
  ),
  body: 'Then you need it. You know the video covered it, but not what it said, so you watch the whole thing again.',
}

export interface Feature {
  id: string
  title: ReactNode
  body: string
  demo: ReactNode
  wide?: boolean
}

export const FEATURES: Feature[] = [
  {
    id: 'check',
    title: (
      <>
        Every note has a <i>timestamp</i>.
      </>
    ),
    body: 'Click one and the video plays from that second, so you can check a note without scrubbing for it.',
    demo: (
      <div className="rounded-md bg-card p-5 shadow-float sm:p-8">
        <SpecimenReader />
      </div>
    ),
    wide: true,
  },
  {
    id: 'sheet',
    title: (
      <>
        The things you&rsquo;d look up later, on one <i>page</i>.
      </>
    ),
    body: 'Find a definition or a command without opening the video again.',
    demo: <SpecimenSheet />,
  },
  {
    id: 'recall',
    title: (
      <>
        Then Whence <i>quizzes</i> you.
      </>
    ),
    body: 'Questions ask why things work, so you can explain them later. Each answer shows where the video says it.',
    demo: <SpecimenQuestion />,
  },
  {
    id: 'back',
    title: (
      <>
        Review only what you&rsquo;re about to <i>forget</i>.
      </>
    ),
    body: 'Questions you miss come back sooner and ones you know wait longer, so reviews stay short. Whence can email you when one is due.',
    demo: (
      <div className="grid gap-4 rounded-md bg-card p-5 shadow-float sm:p-8">
        <SpecimenTimeline />
      </div>
    ),
  },
]

export const PRICING = {
  title: 'Pricing',
  body: 'A link that fails doesn’t count. Cancel Pro any time.',
}

export const FAQ = [
  {
    q: 'What can I paste?',
    a: 'A YouTube video, or an article you can open without logging in.',
  },
  {
    q: 'How do I know the notes are right?',
    a: 'Click a note’s timestamp to hear that part of the video.',
  },
  {
    q: 'Why not paste it into ChatGPT?',
    a: 'You can use ChatGPT for one-off questions. Whence is for the videos you want to remember.',
  },
  {
    q: 'Why not use Anki?',
    a: 'You can, but you write every card yourself. Whence writes the questions for you.',
  },
  {
    q: 'What happens if I cancel?',
    a: 'Pro lasts until the end of the month you paid for. Then you’re on Free, and you keep your notes, questions, and collections.',
  },
  {
    q: 'Can I get a refund?',
    a: 'Yes, if you ask within 14 days of your first payment.',
  },
]

export const CLOSING = {
  title: (
    <>
      Try it on the last video you <i>learned</i> something from.
    </>
  ),
}
