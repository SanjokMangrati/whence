'use client'

import { ArrowRight, Link as LinkIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { ErrorPanel } from './error-panel'
import { Icon } from './icon'
import { OutputOption } from './output-option'
import { UsageRing } from './usage-ring'
import type { OutputType } from '@/lib/api-client'
import { submitWith } from '@/lib/forms'
import { PLANS, type Plan } from '@/lib/plans'
import { startGeneration } from '@/lib/start-generation'

const KEEP_ONE = 'Keep notes or a cheat sheet'

export function PasteForm({
  plan,
  used,
  limit,
  initialUrl,
}: {
  plan: Plan
  used: number
  limit: number
  initialUrl?: string
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [notes, setNotes] = useState(true)
  const [sheet, setSheet] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const outputType: OutputType =
    notes && sheet ? 'notes_and_cheat_sheet' : notes ? 'notes' : 'cheat_sheet'

  async function submit(form: FormData) {
    setPending(true)
    setErrorCode(null)
    const result = await startGeneration(String(form.get('url')), outputType)
    if ('jobId' in result) {
      router.push(`/generations/${result.jobId}`)
      return
    }
    setPending(false)
    setErrorCode(result.errorCode)
  }

  function pasteAnother() {
    setErrorCode(null)
    if (input.current !== null) {
      input.current.value = ''
      input.current.focus()
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={submitWith(submit)}>
        <div className="field-box grid rounded-md border border-line-strong bg-card transition-[border-color,box-shadow] duration-120 ease-out">
          <label className="flex h-[60px] items-center gap-3 px-[18px] text-ink-3">
            <Icon icon={LinkIcon} />
            <input
              ref={input}
              defaultValue={initialUrl}
              name="url"
              type="url"
              placeholder="Paste a YouTube or article link"
              aria-label="Link to a YouTube video or an article"
              autoComplete="off"
              required
              className="ui-l min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-ink-4"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 border-t border-line p-2.5">
            <div className="flex gap-2">
              <OutputOption
                label="Notes"
                detail="For detailed comprehension"
                checked={notes}
                blockedReason={notes && !sheet ? KEEP_ONE : undefined}
                onChange={setNotes}
              />
              <OutputOption
                label="Cheat sheet"
                detail="For quick revision"
                checked={sheet}
                blockedReason={sheet && !notes ? KEEP_ONE : undefined}
                onChange={setSheet}
              />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <UsageRing used={used} limit={limit} period={PLANS[plan].quotaPeriod} />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={pending}
                aria-busy={pending}
              >
                <span key={outputType} className="animate-fade">
                  {
                    {
                      notes: 'Make notes',
                      cheat_sheet: 'Make cheat sheet',
                      notes_and_cheat_sheet: 'Make notes and cheat sheet',
                    }[outputType]
                  }
                </span>
                <Icon icon={ArrowRight} size={17} />
              </button>
            </div>
          </div>
        </div>
      </form>
      {errorCode !== null && (
        <div className="rounded-md border border-line bg-card p-6 sm:p-8">
          <ErrorPanel code={errorCode} plan={plan} onPasteAnother={pasteAnother} />
        </div>
      )}
    </div>
  )
}
