'use client'

import { useRouter } from 'next/navigation'
import { sourceLabel } from 'notes-format'
import { useEffect, useState } from 'react'
import { ErrorPanel } from './error-panel'
import { Step } from './processing-step'
import { ProgressBar } from './progress-bar'
import { SourceThumb } from './source-thumb'
import { Tag } from './tag'
import { api } from '@/lib/api-client'
import type { Plan } from '@/lib/plans'
import { currentStep, stepLabels, type GenerationStatus } from '@/lib/processing-steps'

const POLL_MS = 2000

const MAKING = {
  notes: 'notes',
  cheat_sheet: 'cheat sheet',
  notes_and_cheat_sheet: 'notes and cheat sheet',
} as const

export function Processing({ initial, plan }: { initial: GenerationStatus; plan: Plan }) {
  const router = useRouter()
  const [status, setStatus] = useState(initial)
  const finished = status.status === 'completed' || status.status === 'failed'

  useEffect(() => {
    if (finished) return
    const timer = setInterval(async () => {
      if (document.visibilityState === 'hidden') return
      const response = await api.generations[':id']
        .$get({ param: { id: initial.id } })
        .catch(() => null)
      if (response?.status !== 200) return
      const next = await response.json()
      setStatus(next)
      if (next.status === 'completed') router.refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [finished, initial.id, router])

  const step = currentStep(status.stage)
  const labels = stepLabels(status)

  return (
    <main className="mx-auto grid w-full max-w-page content-start gap-10 px-4 pt-10 pb-24 sm:px-8 sm:pt-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      <section aria-label="Source" className="grid content-start gap-4">
        <SourceThumb
          url={status.requestedUrl}
          sourceType={status.sourceType}
          className="rounded-lg"
        />
        <div className="grid gap-2">
          <span>
            <Tag tone="outline">{status.sourceType}</Tag>
          </span>
          <p className="display-s break-words">{status.title ?? status.requestedUrl}</p>
          <p className="mono text-xs text-ink-3 uppercase">
            {sourceLabel(status.sourceType, status.requestedUrl)}
          </p>
        </div>
      </section>

      <div className="grid content-start gap-7">
        {status.status === 'failed' ? (
          <ErrorPanel
            code={status.errorCode}
            plan={plan}
            counted={status.countsTowardQuota}
            retry={{ url: status.requestedUrl, outputType: status.outputType }}
          />
        ) : (
          <>
            <h1 className="display-m sm:display-l">
              Making your <i>{MAKING[status.outputType]}</i>
            </h1>
            <ProgressBar
              working
              value={step + 1}
              total={labels.length + 1}
              label={`${String(step + 1).padStart(2, '0')} / ${String(labels.length).padStart(2, '0')}`}
            />
            <ol>
              {labels.map((label, index) => (
                <Step
                  key={label}
                  number={index + 1}
                  label={label}
                  state={index < step ? 'done' : index === step ? 'now' : 'next'}
                />
              ))}
            </ol>
            <p className="ui-s text-ink-3">
              You can close this page. The notes appear on Home when they are ready.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
