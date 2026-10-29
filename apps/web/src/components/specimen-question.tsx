'use client'

import { useState } from 'react'
import { Evidence } from './evidence'
import { RatingButtons, type Rating } from './rating-buttons'
import { specimen } from '@/app/(site)/specimen'

export function SpecimenQuestion() {
  const [typed, setTyped] = useState('')
  const [shown, setShown] = useState(false)
  const [picked, setPicked] = useState<Rating | null>(null)
  const { question, answer, citations } = specimen.question

  return (
    <div className="grid content-start gap-7 rounded-md bg-card p-5 shadow-float sm:p-8">
      <div className="grid gap-3.5">
        <p className="mono-label text-ink-3">Try one</p>
        <p className="display-m">{question}</p>
      </div>
      {!shown ? (
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="ui-s font-medium text-ink-2">Your answer (optional)</span>
            <textarea
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              rows={3}
              className="field h-auto min-h-[88px] resize-y py-2.5"
            />
          </label>
          <div>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setShown(true)}>
              Show answer
            </button>
          </div>
        </div>
      ) : (
        <div className="grid animate-rise gap-6">
          <div className="grid gap-4">
            {typed.trim() !== '' && (
              <dl className="grid gap-1">
                <dt className="ui-s text-ink-3">You wrote</dt>
                <dd className="ui-l whitespace-pre-wrap text-ink-2">{typed}</dd>
              </dl>
            )}
            <p className="reading-l">{answer}</p>
          </div>
          <Evidence citations={citations} />
          <RatingButtons picked={picked} onRate={setPicked} />
        </div>
      )}
    </div>
  )
}
