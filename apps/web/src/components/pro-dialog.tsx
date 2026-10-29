'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Icon } from './icon'
import { useCheckout } from '@/lib/checkout'
import { PRO_PRICE } from '@/lib/plans'

export function ProDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { checkout, opening, failed, label } = useCheckout()

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade bg-scrim" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2">
          <div className="grid animate-pop gap-5 rounded-lg bg-card p-7 shadow-float">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="display-m">Pro · {PRO_PRICE}</Dialog.Title>
              <Dialog.Close
                className="btn btn-ghost btn-sm -mt-1 -mr-2 w-8 px-0"
                aria-label="Close"
              >
                <Icon icon={X} size={16} />
              </Dialog.Close>
            </div>
            <Dialog.Description asChild>
              <ul className="ui-m grid list-disc gap-1.5 pl-[18px] text-ink-2">
                <li>More sources each month</li>
                <li>Longer sources</li>
                <li>Collections</li>
                <li>Export</li>
              </ul>
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close className="btn btn-ghost">Not now</Dialog.Close>
              <button
                type="button"
                className={`btn btn-primary ${failed ? 'btn-failed' : ''}`}
                onClick={checkout}
                disabled={opening}
                aria-busy={opening}
              >
                <span aria-live="polite">{label}</span>
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
