import { Play } from 'lucide-react'
import { sourceLabel } from 'notes-format'
import { AppHeader } from './home'
import { job } from './job'
import { Icon } from '@/components/icon'
import { Step } from '@/components/processing-step'
import { ProgressBar } from '@/components/progress-bar'
import { Tag } from '@/components/tag'

const STEPS = [
  'Watching the video',
  'Writing your notes and cheat sheet',
  'Getting your questions ready',
]

export function MakingScreen({ step }: { step: number }) {
  return (
    <>
      <AppHeader due={0} />
      <main className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-16 px-8 pt-14">
        <section className="grid content-start gap-4">
          <div className="grid aspect-video place-items-center rounded-lg bg-ink text-paper">
            <Icon icon={Play} />
          </div>
          <div className="grid gap-2">
            <span>
              <Tag tone="outline">video</Tag>
            </span>
            <p className="display-s">{job.specimen.source.title}</p>
            <p className="mono text-xs text-ink-3 uppercase">
              {sourceLabel('video', job.specimen.source.url)}
            </p>
          </div>
        </section>
        <div className="grid content-start gap-7">
          <h1 className="display-l">
            Making your <i>notes and cheat sheet</i>
          </h1>
          <ProgressBar
            working
            value={step + 1}
            total={STEPS.length + 1}
            label={`${String(Math.min(step + 1, STEPS.length)).padStart(2, '0')} / 03`}
          />
          <ol>
            {STEPS.map((label, index) => (
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
        </div>
      </main>
    </>
  )
}
