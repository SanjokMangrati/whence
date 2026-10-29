'use client'

import type { InferResponseType } from 'hono/client'
import { Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from './confirm-dialog'
import { DueDates } from './due-dates'
import { Evidence } from './evidence'
import { Journey } from './journey'
import { Icon } from './icon'
import { KeyHint } from './key-hint'
import { InlineText } from './note-entry'
import { ProgressBar } from './progress-bar'
import { RATINGS, RatingButtons, type Rating } from './rating-buttons'
import { ReminderSwitch } from './reminder-switch'
import { StatePanel } from './state-panel'
import { track } from '@/lib/analytics'
import { api, readErrorCode } from '@/lib/api-client'
import { actionErrorCopy } from '@/lib/error-copy'
import { daysFromToday, plural, shortDate } from '@/lib/format'

type Answer = InferResponseType<(typeof api.study.questions)[':id']['answer']['$get'], 200>
type Result = { rating: Rating; dueAt: string; projectedDueAts: string[] }

const HOLD_MS = 260

const pad = (value: number) => String(value).padStart(2, '0')

export function StudySession({
  questions,
  source,
  exitHref,
  exitLabel,
  remindersEnabled,
}: {
  questions: { id: string; question: string }[]
  source: string | null
  exitHref: string
  exitLabel: string
  remindersEnabled: boolean
}) {
  const [queue, setQueue] = useState(questions)
  const [removing, setRemoving] = useState(false)
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [preloaded, setPreloaded] = useState<{ id: string; answer: Answer } | null>(null)
  const [pending, setPending] = useState(false)
  const [picked, setPicked] = useState<Rating | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const heading = useRef<HTMLHeadingElement>(null)
  const goodButton = useRef<HTMLButtonElement>(null)
  const current = queue[index]
  const currentId = current?.id

  useEffect(() => {
    if (currentId === undefined) return
    let live = true
    void api.study.questions[':id'].answer
      .$get({ param: { id: currentId } })
      .then(async (response) => {
        if (response.status !== 200) return
        const loaded = await response.json()
        if (live) setPreloaded({ id: currentId, answer: loaded })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [currentId])

  async function showAnswer() {
    if (current === undefined || answer !== null || pending) return
    if (preloaded?.id === current.id) {
      setAnswer(preloaded.answer)
      track('answer_revealed', {})
      return
    }
    setPending(true)
    setFailure(null)
    const response = await api.study.questions[':id'].answer
      .$get({ param: { id: current.id } })
      .catch(() => null)
    setPending(false)
    if (response?.status !== 200) {
      setFailure(actionErrorCopy('answer', await readErrorCode(response)))
      return
    }
    setAnswer(await response.json())
    track('answer_revealed', {})
  }

  async function rate(rating: Rating) {
    if (current === undefined || answer === null || pending) return
    setPending(true)
    setPicked(rating)
    setFailure(null)
    const [response] = await Promise.all([
      api.study.questions[':id'].rating
        .$post({ param: { id: current.id }, json: { rating } })
        .catch(() => null),
      new Promise((resolve) => setTimeout(resolve, HOLD_MS)),
    ])
    setPending(false)
    setPicked(null)
    if (response?.status !== 200) {
      setFailure(actionErrorCopy('rating', await readErrorCode(response)))
      return
    }
    track('recall_rated', { rating })
    const { dueAt, projectedDueAts } = await response.json()
    setResults((done) => [...done, { rating, dueAt, projectedDueAts }])
    setAnswer(null)
    setTyped('')
    setIndex(index + 1)
  }

  async function removeCurrent(): Promise<string | null> {
    if (current === undefined) return null
    const response = await api.study.questions[':id']
      .$delete({ param: { id: current.id } })
      .catch(() => null)
    if (!response?.ok) return actionErrorCopy('remove', await readErrorCode(response))
    track('question_removed', {})
    setQueue((left) => left.filter((question) => question.id !== current.id))
    setAnswer(null)
    setTyped('')
    setFailure(null)
    return null
  }

  useEffect(() => {
    if (answer !== null) goodButton.current?.focus()
  }, [answer])

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [currentId])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (removing || event.target instanceof HTMLTextAreaElement) return
      if (answer === null && event.key === ' ') {
        event.preventDefault()
        void showAnswer()
      }
      const rating = RATINGS[Number(event.key) - 1]
      if (answer !== null && rating !== undefined) {
        void rate(rating.value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (current === undefined && results.length === 0) {
    return (
      <StatePanel
        heading="You removed every question in this session."
        action={{ href: exitHref, label: exitLabel }}
      >
        They do not come back in review.
      </StatePanel>
    )
  }
  if (current === undefined) {
    return <Summary results={results} source={source} remindersEnabled={remindersEnabled} />
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[640px] items-center gap-4 px-4 pt-6 sm:px-6">
        <ProgressBar
          value={index + 1}
          total={queue.length}
          label={`${pad(index + 1)} / ${pad(queue.length)}`}
        />
        <div className="flex">
          <button
            type="button"
            className="btn btn-ghost w-10 px-0 text-ink-2"
            aria-label="Remove this question from review"
            title="Remove this question from review"
            onClick={() => setRemoving(true)}
          >
            <Icon icon={Trash2} />
          </button>
          <Link
            href={exitHref}
            aria-label="End session"
            title="End session"
            className="btn btn-ghost w-10 px-0 text-ink-2"
          >
            <Icon icon={X} />
          </Link>
        </div>
      </div>

      <div
        key={current.id}
        className="mx-auto grid w-full max-w-[640px] animate-rise content-start gap-7 px-4 pt-14 pb-24 sm:px-6 sm:pt-[72px]"
      >
        <div className="grid gap-3.5">
          <p className="mono-label text-ink-3">
            <span className="sr-only">
              Question {index + 1} of {queue.length}.{' '}
            </span>
            {source ?? 'Quiz'}
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="display-m sm:display-l outline-none focus-visible:shadow-none"
          >
            <InlineText text={current.question} />
          </h1>
        </div>

        {answer === null ? (
          <>
            <label className="grid gap-1.5">
              <span className="ui-s font-medium text-ink-2">Your answer (optional)</span>
              <textarea
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                rows={3}
                className="field h-auto min-h-[88px] resize-y py-2.5"
              />
            </label>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={showAnswer}
                disabled={pending}
              >
                Show answer
              </button>
              <KeyHint>SPACE</KeyHint>
              <p className="ui-s text-ink-3">Answer first. It helps it stick.</p>
            </div>
          </>
        ) : (
          <div className="grid animate-rise gap-6">
            <div className="grid gap-4">
              {typed.trim() !== '' && (
                <dl className="grid gap-1">
                  <dt className="ui-s text-ink-3">You wrote</dt>
                  <dd className="ui-l whitespace-pre-wrap text-ink-2">{typed}</dd>
                </dl>
              )}
              <p className="reading-l">
                <InlineText text={answer.answer} />
              </p>
            </div>
            <Evidence citations={answer.citations} />
            <RatingButtons
              picked={picked}
              onRate={(rating) => void rate(rating)}
              disabled={pending}
              goodButton={goodButton}
            />
          </div>
        )}

        {failure !== null && (
          <p role="alert" className="ui-m font-medium text-missed">
            {failure}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove this question"
        description="It stops coming back in review, and later sessions on this source leave it out."
        confirmLabel="Remove question"
        onConfirm={removeCurrent}
      />
    </main>
  )
}

function Summary({
  results,
  source,
  remindersEnabled,
}: {
  results: Result[]
  source: string | null
  remindersEnabled: boolean
}) {
  const count = (ratings: Rating[]) =>
    results.filter((result) => ratings.includes(result.rating)).length
  const missed = results.filter((result) => result.rating === 'again')
  const firstBack = missed
    .map((result) => new Date(result.dueAt))
    .sort((left, right) => left.getTime() - right.getTime())[0]

  const nextBack = [...results].sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0]!

  const byDay = new Map<string, { date: string; count: number }>()
  for (const { dueAt } of [...results].sort((left, right) =>
    left.dueAt.localeCompare(right.dueAt),
  )) {
    const day = new Date(dueAt).toDateString()
    const entry = byDay.get(day)
    if (entry === undefined) byDay.set(day, { date: dueAt, count: 1 })
    else entry.count += 1
  }

  const stat = (label: string, value: number, tone: string, delay: number) => (
    <div
      className={`grid animate-rise gap-1 border-t-2 py-4 ${tone}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="display-l">{value}</span>
      <span className="ui-s text-ink-2">{label}</span>
    </div>
  )

  return (
    <main className="mx-auto grid w-full max-w-[640px] content-start gap-10 px-4 py-16 sm:px-6 sm:py-24">
      <div className="grid gap-3">
        <p className="mono-label text-ink-3">
          Session complete · {plural(results.length, 'question')}
          {source !== null && ` · ${source}`}
        </p>
        <h1 className="display-m sm:display-l">
          {firstBack === undefined ? (
            <i>Everything held.</i>
          ) : (
            <>
              You missed {missed.length}.{' '}
              <i>
                {missed.length === 1 ? 'It comes back' : 'They come back'}{' '}
                {daysFromToday(firstBack) === 1 ? 'tomorrow' : `on ${shortDate(firstBack)}`}.
              </i>
            </>
          )}
        </h1>
      </div>
      <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
        {stat('Again', count(['again']), 'border-missed text-missed', 120)}
        {stat('Hard', count(['hard']), 'border-partly text-partly', 160)}
        {stat('Good', count(['good']), 'border-remembered text-remembered', 200)}
        {stat('Easy', count(['easy']), 'border-remembered text-remembered', 240)}
      </div>
      <div className="animate-rise [animation-delay:260ms]">
        <DueDates
          title="When they come back"
          dates={[...byDay.values()].map(({ date, count }) => ({
            date,
            caption: plural(count, 'question'),
          }))}
        />
      </div>
      <figure className="m-0 grid animate-rise gap-4 [animation-delay:300ms]">
        <figcaption className="mono-label text-ink-3">
          The first one back, if you remember it each time
        </figcaption>
        <Journey dates={nextBack.projectedDueAts.map((date) => new Date(date))} />
      </figure>
      {!remindersEnabled && (
        <section
          aria-labelledby="reminders"
          className="grid animate-rise gap-3 border-t border-line pt-5 [animation-delay:340ms]"
        >
          <h2 id="reminders" className="mono-label text-ink-3">
            Reminders
          </h2>
          <ReminderSwitch enabled={false} />
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary">
          Back to Home
        </Link>
        <Link href="/quiz" className="btn btn-ghost">
          Go to Quiz
        </Link>
      </div>
    </main>
  )
}
