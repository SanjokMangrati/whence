'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import { ArrowRight, Download, FolderPlus, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { MENU_ROW } from './account-menu'
import { CheckBox } from './check-box'
import { CollectionDialog, type CollectionDialogMode } from './collection-dialog'
import { ConfirmDialog } from './confirm-dialog'
import { Icon } from './icon'
import { ProDialog } from './pro-dialog'
import { api, readErrorCode } from '@/lib/api-client'
import { actionErrorCopy } from '@/lib/error-copy'
import { PLANS, type Plan } from '@/lib/plans'

interface Collection {
  id: string
  name: string
  jobIds: string[]
}

interface ExportTarget {
  id: string
  label: string
}

const FORMATS = [
  { format: 'pdf', label: 'PDF', file: 'PDF' },
  { format: 'docx', label: 'Word', file: 'Word file' },
  { format: 'md', label: 'Markdown', file: 'Markdown file' },
] as const

type Format = (typeof FORMATS)[number]['format']

const MENU_CARD = 'z-40 grid w-max animate-pop gap-1 rounded-md bg-card p-2 shadow-float'

const MENU_ITEM = `${MENU_ROW} outline-none focus-visible:shadow-none data-highlighted:bg-paper-2 data-highlighted:text-ink`

function iconTrigger(label: string, icon: typeof Download, onClick?: () => void) {
  return (
    <button
      type="button"
      className="btn btn-ghost w-10 px-0"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon icon={icon} size={18} />
    </button>
  )
}

function UpgradeTrigger({ label, icon }: { label: string; icon: typeof Download }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {iconTrigger(label, icon, () => setOpen(true))}
      <ProDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function MenuButton({
  plan,
  label,
  icon,
  children,
}: {
  plan: Plan
  label: string
  icon: typeof Download
  children: ReactNode
}) {
  if (!PLANS[plan].collections) return <UpgradeTrigger label={label} icon={icon} />
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{iconTrigger(label, icon)}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-40 grid w-[288px] animate-pop gap-1 rounded-md bg-card p-2 shadow-float"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function CollectionsMenu({
  plan,
  jobId,
  collections,
}: {
  plan: Plan
  jobId: string
  collections: Collection[]
}) {
  const router = useRouter()
  const [changed, setChanged] = useState<Record<string, boolean>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [dialog, setDialog] = useState<CollectionDialogMode | null>(null)

  async function toggle(collection: Collection, add: boolean) {
    setFailure(null)
    setChanged((current) => ({ ...current, [collection.id]: add }))
    const param = { id: collection.id, jobId }
    const response = await (
      add
        ? api.collections[':id'].sources[':jobId'].$put({ param })
        : api.collections[':id'].sources[':jobId'].$delete({ param })
    ).catch(() => null)
    if (!response?.ok) {
      setChanged((current) => ({ ...current, [collection.id]: !add }))
      setFailure(actionErrorCopy('save', await readErrorCode(response)))
      return
    }
    router.refresh()
  }

  return (
    <>
      <MenuButton plan={plan} label="Add to a collection" icon={FolderPlus}>
        <p className="mono-label px-2 pt-2 pb-1 text-ink-3">Collections</p>
        {collections.map((collection) => {
          const checked = changed[collection.id] ?? collection.jobIds.includes(jobId)
          return (
            <button
              key={collection.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              className={MENU_ROW}
              onClick={() => toggle(collection, !checked)}
            >
              <CheckBox checked={checked} />
              <span className="truncate">{collection.name}</span>
            </button>
          )
        })}
        {failure !== null && (
          <p role="alert" className="ui-s px-2 py-1 text-missed">
            {failure}
          </p>
        )}
        <div className="mt-1 border-t border-line pt-1">
          <button type="button" className={MENU_ROW} onClick={() => setDialog({ kind: 'create' })}>
            <Icon icon={Plus} size={16} />
            New collection
          </button>
        </div>
      </MenuButton>
      <CollectionDialog mode={dialog} onOpenChange={(open) => !open && setDialog(null)} />
    </>
  )
}

export function ExportMenu({ plan, targets }: { plan: Plan; targets: ExportTarget[] }) {
  const [state, setState] = useState<{ working: string } | { error: string } | null>(null)
  const working = state !== null && 'working' in state

  if (!PLANS[plan].export) return <UpgradeTrigger label="Download" icon={Download} />

  async function download(target: ExportTarget, format: Format, file: string) {
    setState({ working: `Preparing the ${file}` })
    const response = await api.artifacts[':id'].export[':format{pdf|docx|md}']
      .$get({ param: { id: target.id, format } })
      .catch(() => null)
    if (!response?.ok) {
      setState({ error: actionErrorCopy('download', await readErrorCode(response)) })
      return
    }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(await response.blob())
    link.download = fileName(response.headers.get('content-disposition'), `notes.${format}`)
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000)
    setState(null)
  }

  const formats = (target: ExportTarget) =>
    FORMATS.map(({ format, label, file }) => (
      <DropdownMenu.Item
        key={format}
        className={MENU_ITEM}
        disabled={working}
        onSelect={(event) => {
          event.preventDefault()
          void download(target, format, file)
        }}
      >
        {label}
      </DropdownMenu.Item>
    ))

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (open && !working) setState(null)
      }}
    >
      <DropdownMenu.Trigger asChild>{iconTrigger('Download', Download)}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={MENU_CARD}>
          {targets.length === 1 && targets[0] !== undefined ? (
            <>
              <DropdownMenu.Label className="mono-label px-2 pt-2 pb-1 text-ink-3">
                {targets[0].label}
              </DropdownMenu.Label>
              {formats(targets[0])}
            </>
          ) : (
            <>
              <DropdownMenu.Label className="mono-label px-2 pt-2 pb-1 text-ink-3">
                Download
              </DropdownMenu.Label>
              {targets.map((target) => (
                <DropdownMenu.Sub key={target.id}>
                  <DropdownMenu.SubTrigger
                    className={`${MENU_ITEM} data-[state=open]:bg-paper-2 data-[state=open]:text-ink`}
                  >
                    <span className="flex-1 pr-6">{target.label}</span>
                    <Icon icon={ArrowRight} size={16} className="text-ink-3" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent sideOffset={8} alignOffset={-8} className={MENU_CARD}>
                      {formats(target)}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              ))}
            </>
          )}
          <p
            role={state !== null && 'error' in state ? 'alert' : 'status'}
            className={`ui-s w-0 min-w-full px-2 py-1 empty:hidden ${state !== null && 'error' in state ? 'text-missed' : 'text-ink-2'}`}
          >
            {state === null ? '' : 'error' in state ? state.error : state.working}
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function DeleteSourceButton({
  jobId,
  title,
  outputs,
  onDeleted,
}: {
  jobId: string
  title: string
  outputs: string[]
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)

  async function remove() {
    const response = await api.generations[':id']
      .$delete({ param: { id: jobId } })
      .catch(() => null)
    if (!response?.ok) return actionErrorCopy('delete', await readErrorCode(response))
    onDeleted()
    return null
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost w-10 px-0"
        title="Delete source"
        aria-label="Delete source"
        onClick={() => setOpen(true)}
      >
        <Icon icon={Trash2} size={18} />
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this source"
        description={
          <>
            <span className="font-medium text-ink">{title}</span> is deleted
            {outputs.length > 0 && `, with its ${listOf(outputs)}`}.
          </>
        }
        confirmLabel="Delete source"
        onConfirm={remove}
      />
    </>
  )
}

function listOf(items: string[]): string {
  if (items.length < 3) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

function fileName(disposition: string | null, fallback: string): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/)?.[1]
  return encoded === undefined ? fallback : decodeURIComponent(encoded)
}
