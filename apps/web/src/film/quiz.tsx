import { Trash2, X } from 'lucide-react'
import { job } from './job'
import { DueDates } from '@/components/due-dates'
import { Evidence } from '@/components/evidence'
import { Icon } from '@/components/icon'
import { Journey } from '@/components/journey'
import { ProgressBar } from '@/components/progress-bar'
import { RatingButtons, type Rating } from '@/components/rating-buttons'
import { plural } from '@/lib/format'

type Shown = { opacity: number; translate: string }

export function QuizScreen({
  typed,
  pressed,
  answered,
  answerFrom,
  picked,
}: {
  typed: string
  pressed: boolean
  answered: boolean
  answerFrom: Shown
  picked: Rating | null
}) {
  const { question } = job.specimen
  return (
    <main className="grid">
      <div className="mx-auto flex w-[640px] items-center gap-4 pt-6">
        <ProgressBar value={1} total={1} label="01 / 01" />
        <div className="flex">
          <span className="btn btn-ghost w-10 px-0 text-ink-2">
            <Icon icon={Trash2} />
          </span>
          <span className="btn btn-ghost w-10 px-0 text-ink-2">
            <Icon icon={X} />
          </span>
        </div>
      </div>
      <div
        data-focus="quiz"
        className="mx-auto mt-[72px] grid min-h-[652px] w-[640px] content-start gap-7"
      >
        <div className="grid gap-3.5">
          <p className="mono-label text-ink-3">{job.title}</p>
          <h1 className="display-l">{question.question}</h1>
        </div>
        {!answered ? (
          <div className="grid gap-7">
            <div className="grid gap-1.5">
              <span className="ui-s font-medium text-ink-2">Your answer (optional)</span>
              <div className="field ui-m h-auto min-h-[88px] py-2.5">{typed}</div>
            </div>
            <div className="flex items-center gap-x-3.5">
              <span
                data-anchor="show"
                className={`btn btn-primary btn-lg ${pressed ? 'translate-y-px bg-ink-2' : ''}`}
              >
                Show answer
              </span>
              <p className="ui-s text-ink-3">Answer first. It helps it stick.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6" style={answerFrom}>
            <div className="grid gap-4">
              <dl className="grid gap-1">
                <dt className="ui-s text-ink-3">You wrote</dt>
                <dd className="ui-l text-ink-2">{typed}</dd>
              </dl>
              <p className="reading-l">{question.answer}</p>
            </div>
            <div className="film-sweep grid">
              <Evidence citations={question.citations.slice(0, 1)} />
            </div>
            <div className="relative">
              <RatingButtons picked={picked} columns="grid-cols-4" />
              <span data-anchor="good" className="absolute top-[58px] left-[62.5%] size-0" />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

export function SummaryScreen({
  dates,
  drawn,
  rowFrom,
  pressed,
}: {
  dates: Date[]
  drawn: number
  rowFrom: (index: number) => Shown
  pressed: boolean
}) {
  const stat = (label: string, value: number, tone: string, index: number) => (
    <div className={`grid gap-1 border-t-2 py-4 ${tone}`} style={rowFrom(index)}>
      <span className="display-l">{value}</span>
      <span className="ui-s text-ink-2">{label}</span>
    </div>
  )
  return (
    <main className="mx-auto grid w-[640px] content-start gap-9 pt-14">
      <div className="grid gap-3" style={rowFrom(0)}>
        <p className="mono-label text-ink-3">
          Session complete · {plural(1, 'question')} · {job.title}
        </p>
        <h1 className="display-l">
          <i>Everything held.</i>
        </h1>
      </div>
      <div className="grid grid-cols-4 gap-x-6">
        {stat('Again', 0, 'border-missed text-missed', 1)}
        {stat('Hard', 0, 'border-partly text-partly', 2)}
        {stat('Good', 1, 'border-remembered text-remembered', 3)}
        {stat('Easy', 0, 'border-remembered text-remembered', 4)}
      </div>
      <div style={rowFrom(5)}>
        <DueDates
          title="When they come back"
          dates={[{ date: dates[0]!.toISOString(), caption: plural(1, 'question') }]}
        />
      </div>
      <figure className="m-0 grid gap-4" style={rowFrom(6)}>
        <figcaption className="mono-label text-ink-3">
          The first one back, if you remember it each time
        </figcaption>
        <Journey dates={dates} progress={drawn} />
      </figure>
      <div className="flex gap-2" style={rowFrom(7)}>
        <span
          data-anchor="back-home"
          className={`btn btn-primary ${pressed ? 'translate-y-px bg-ink-2' : ''}`}
        >
          Back to Home
        </span>
        <span className="btn btn-ghost">Go to Quiz</span>
      </div>
    </main>
  )
}
