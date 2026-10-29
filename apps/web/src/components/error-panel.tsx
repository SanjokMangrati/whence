'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Outcome } from './outcome'
import { errorCopy } from '@/lib/error-copy'
import type { OutputType } from '@/lib/api-client'
import type { Plan } from '@/lib/plans'
import { startGeneration } from '@/lib/start-generation'

interface Props {
  code: string | null
  plan: Plan
  counted?: boolean
  retry?: { url: string; outputType: OutputType }
  onPasteAnother?: () => void
}

export function ErrorPanel({ code, plan, counted = false, retry, onPasteAnother }: Props) {
  const router = useRouter()
  const [shown, setShown] = useState(code)
  const [pending, setPending] = useState(false)
  const copy = errorCopy(shown, plan, shown === code && counted)
  const canRetry = copy.actions.includes('retry') && retry !== undefined
  const canPaste = copy.actions.includes('paste')
  const canLogIn = copy.actions.includes('log_in')

  async function tryAgain(request: NonNullable<Props['retry']>) {
    setPending(true)
    const result = await startGeneration(request.url, request.outputType)
    setPending(false)
    if ('jobId' in result) {
      router.push(`/generations/${result.jobId}`)
    } else {
      setShown(result.errorCode)
    }
  }

  const pasteClass = canRetry || onPasteAnother ? 'btn btn-secondary' : 'btn btn-primary'

  return (
    <section role="alert" className="grid animate-rise gap-3">
      <Outcome tone="failed">
        <h2 className="display-m">{copy.heading}</h2>
        <p className="ui-m max-w-[62ch] text-ink-2">{copy.body}</p>
      </Outcome>
      {(canRetry || canPaste || canLogIn) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {canRetry && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => tryAgain(retry)}
              disabled={pending}
            >
              Try again
            </button>
          )}
          {canPaste &&
            (onPasteAnother === undefined ? (
              <Link href="/" className={pasteClass}>
                Paste another link
              </Link>
            ) : (
              <button type="button" className={pasteClass} onClick={onPasteAnother}>
                Paste another link
              </button>
            ))}
          {canLogIn && (
            <Link href="/login" className="btn btn-primary">
              Log in
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
