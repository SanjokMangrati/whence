'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Icon } from './icon'
import { TextField } from './text-field'
import { api, readErrorCode } from '@/lib/api-client'
import { actionErrorCopy } from '@/lib/error-copy'
import { submitWith } from '@/lib/forms'

export type CollectionDialogMode = { kind: 'create' } | { kind: 'rename'; id: string; name: string }

const TITLE = { create: 'New collection', rename: 'Rename collection' }
const SUBMIT = { create: 'Make collection', rename: 'Save name' }

const MAX_NAME_LENGTH = 80

export function CollectionDialog({
  mode,
  onOpenChange,
}: {
  mode: CollectionDialogMode | null
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | { failure: string }>('idle')

  async function submit(form: FormData) {
    if (mode === null) return
    setState('working')
    const name = String(form.get('name') ?? '')
    const response = await (
      mode.kind === 'create'
        ? api.collections.$post({ json: { name } })
        : api.collections[':id'].$patch({ param: { id: mode.id }, json: { name } })
    ).catch(() => null)
    if (!response?.ok) {
      setState({ failure: actionErrorCopy('save', await readErrorCode(response)) })
      return
    }
    setState('idle')
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog.Root
      open={mode !== null}
      onOpenChange={(open) => {
        setState('idle')
        onOpenChange(open)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade bg-scrim" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2">
          {mode !== null && (
            <form
              onSubmit={submitWith(submit)}
              className="grid animate-pop gap-5 rounded-lg bg-card p-7 shadow-float"
            >
              <div className="flex items-start justify-between gap-4">
                <Dialog.Title className="display-m">{TITLE[mode.kind]}</Dialog.Title>
                <Dialog.Close
                  type="button"
                  className="btn btn-ghost btn-sm -mt-1 -mr-2 w-8 px-0"
                  aria-label="Close"
                >
                  <Icon icon={X} size={16} />
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">
                Name the collection. Up to {MAX_NAME_LENGTH} characters.
              </Dialog.Description>
              <TextField
                label="Name"
                name="name"
                required
                maxLength={MAX_NAME_LENGTH}
                defaultValue={mode.kind === 'rename' ? mode.name : ''}
                autoComplete="off"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Dialog.Close type="button" className="btn btn-ghost">
                  Not now
                </Dialog.Close>
                <button
                  type="submit"
                  className={`btn btn-primary ${typeof state === 'object' ? 'btn-failed' : ''}`}
                  disabled={state === 'working'}
                  aria-busy={state === 'working'}
                >
                  <span aria-live="polite">
                    {typeof state === 'object' ? state.failure : SUBMIT[mode.kind]}
                  </span>
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
