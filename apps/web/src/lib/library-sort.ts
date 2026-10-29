export const LIBRARY_SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'next', label: 'Next review' },
  { id: 'title', label: 'Title A to Z' },
] as const

export type LibrarySort = (typeof LIBRARY_SORTS)[number]['id']

export function librarySort(value: string | string[] | undefined): LibrarySort {
  return LIBRARY_SORTS.find((sort) => sort.id === value)?.id ?? 'newest'
}

export function libraryHref(collection: string | null, sort: LibrarySort): string {
  const params = new URLSearchParams()
  if (collection !== null) params.set('collection', collection)
  if (sort !== 'newest') params.set('sort', sort)
  const query = params.toString()
  return query === '' ? '/' : `/?${query}`
}
