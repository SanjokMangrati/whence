'use client'

import { Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CollectionDialog } from './collection-dialog'
import { ConfirmDialog } from './confirm-dialog'
import { Icon } from './icon'
import { Select } from './select'
import { api, readErrorCode } from '@/lib/api-client'
import { actionErrorCopy } from '@/lib/error-copy'
import { LIBRARY_SORTS, libraryHref, librarySort, type LibrarySort } from '@/lib/library-sort'

interface Collection {
  id: string
  name: string
  jobIds: string[]
}

const ALL = 'all'

export function LibraryFilters({
  collections,
  selected,
  sort,
  sortable,
}: {
  collections: Collection[]
  selected: string | null
  sort: LibrarySort
  sortable: boolean
}) {
  const router = useRouter()
  const go = (collection: string | null, nextSort: LibrarySort) =>
    router.push(libraryHref(collection, nextSort), { scroll: false })

  return (
    <div className="flex gap-1">
      {collections.length > 0 && (
        <Select
          label="Filter by collection"
          value={selected ?? ALL}
          options={[
            { value: ALL, label: 'All sources' },
            ...collections.map((collection) => ({
              value: collection.id,
              label: collection.name,
              detail: String(collection.jobIds.length),
            })),
          ]}
          onValueChange={(value) => go(value === ALL ? null : value, sort)}
        />
      )}
      {sortable && (
        <Select
          label="Sort"
          value={sort}
          options={LIBRARY_SORTS.map((option) => ({ value: option.id, label: option.label }))}
          onValueChange={(value) => go(selected, librarySort(value))}
        />
      )}
    </div>
  )
}

export function CollectionActions({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)

  async function deleteCollection() {
    const response = await api.collections[':id'].$delete({ param: { id } }).catch(() => null)
    if (!response?.ok) return actionErrorCopy('save', await readErrorCode(response))
    router.push('/')
    router.refresh()
    return null
  }

  return (
    <div className="flex gap-1">
      <button
        type="button"
        className="btn btn-ghost btn-sm w-8 px-0"
        title="Rename collection"
        aria-label="Rename collection"
        onClick={() => setDialog('rename')}
      >
        <Icon icon={Pencil} size={16} />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm w-8 px-0"
        title="Delete collection"
        aria-label="Delete collection"
        onClick={() => setDialog('delete')}
      >
        <Icon icon={Trash2} size={16} />
      </button>
      <CollectionDialog
        mode={dialog === 'rename' ? { kind: 'rename', id, name } : null}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Delete collection"
        description={`${name} goes. Its sources stay on Home.`}
        confirmLabel="Delete collection"
        onConfirm={deleteCollection}
      />
    </div>
  )
}
