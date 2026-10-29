'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Icon } from './icon'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => Promise<string | null>
}) {
  const [state, setState] = useState<'idle' | 'working' | { failure: string }>('idle')

  async function confirm() {
    setState('working')
    const failure = await onConfirm()
    if (failure !== null) {
      setState({ failure })
      return
    }
    setState('idle')
    onOpenChange(false)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setState('idle')
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade bg-scrim" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2">
          <div className="grid animate-pop gap-5 rounded-lg bg-card p-7 shadow-float">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="display-m">{title}</Dialog.Title>
              <Dialog.Close
                className="btn btn-ghost btn-sm -mt-1 -mr-2 w-8 px-0"
                aria-label="Close"
              >
                <Icon icon={X} size={16} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="ui-m text-ink-2">{description}</Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close className="btn btn-ghost">Not now</Dialog.Close>
              <button
                type="button"
                className={`btn btn-primary ${typeof state === 'object' ? 'btn-failed' : ''}`}
                onClick={confirm}
                disabled={state === 'working'}
                aria-busy={state === 'working'}
              >
                <span aria-live="polite">
                  {typeof state === 'object' ? state.failure : confirmLabel}
                </span>
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
