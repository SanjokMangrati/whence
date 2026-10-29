'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Icon } from './icon'
import { actionErrorCopy } from '@/lib/error-copy'

const RESET_MS = 2000

async function writeClipboard({ text, html }: { text: string; html: string }) {
  if (typeof ClipboardItem === 'undefined') {
    await navigator.clipboard.writeText(text)
    return
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    }),
  ])
}

export function CopyButton({
  label,
  content,
}: {
  label: string
  content: () => { text: string; html: string }
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), RESET_MS)
    return () => clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      await writeClipboard(content())
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  const text = { idle: label, copied: 'Copied', failed: actionErrorCopy('copy') }[state]
  const tone = {
    idle: 'text-ink-3 hover:text-ink',
    copied: 'text-remembered',
    failed: 'text-missed',
  }[state]

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={state === 'idle' ? label : undefined}
      title={label}
      className={`btn btn-ghost btn-sm px-2 ${tone}`}
    >
      <Icon icon={state === 'copied' ? Check : Copy} size={15} />
      {state !== 'idle' && <span aria-live="polite">{text}</span>}
    </button>
  )
}
