'use client'

import { useId, type Ref } from 'react'
import { KeyHint } from './key-hint'

export type Rating = 'again' | 'hard' | 'good' | 'easy'

export const RATINGS: {
  value: Rating
  label: string
  caption: string
  tone: string
  text: string
  mark: string
}[] = [
  {
    value: 'again',
    label: 'Again',
    caption: 'Did not know',
    tone: 'hover:border-missed hover:bg-missed-wash data-picked:border-missed data-picked:bg-missed-wash',
    text: 'group-hover:text-missed group-data-picked:text-missed',
    mark: 'bg-missed',
  },
  {
    value: 'hard',
    label: 'Hard',
    caption: 'With effort',
    tone: 'hover:border-partly hover:bg-partly-wash data-picked:border-partly data-picked:bg-partly-wash',
    text: 'group-hover:text-partly group-data-picked:text-partly',
    mark: 'bg-partly',
  },
  {
    value: 'good',
    label: 'Good',
    caption: 'Knew it',
    tone: 'hover:border-remembered hover:bg-remembered-wash data-picked:border-remembered data-picked:bg-remembered-wash',
    text: 'group-hover:text-remembered group-data-picked:text-remembered',
    mark: 'bg-remembered',
  },
  {
    value: 'easy',
    label: 'Easy',
    caption: 'Instantly',
    tone: 'hover:border-remembered hover:bg-remembered-wash data-picked:border-remembered data-picked:bg-remembered-wash',
    text: 'group-hover:text-remembered group-data-picked:text-remembered',
    mark: 'bg-remembered',
  },
]

export function RatingButtons({
  picked,
  onRate,
  disabled = false,
  goodButton,
  columns = 'grid-cols-2 sm:grid-cols-4',
}: {
  picked: Rating | null
  onRate?: (rating: Rating) => void
  disabled?: boolean
  goodButton?: Ref<HTMLButtonElement>
  columns?: string
}) {
  const labelId = useId()
  return (
    <div className="grid gap-2.5">
      <p id={labelId} className="ui-s text-ink-3">
        How did you do?
      </p>
      <div role="group" aria-labelledby={labelId} className={`grid gap-2 ${columns}`}>
        {RATINGS.map((rating, position) => (
          <button
            key={rating.value}
            ref={rating.value === 'good' ? goodButton : undefined}
            type="button"
            onClick={() => onRate?.(rating.value)}
            disabled={disabled}
            data-picked={picked === rating.value || undefined}
            className={`group grid animate-rise cursor-pointer content-start gap-1.5 rounded-md border border-line bg-card px-4 pt-3 pb-3.5 text-left transition-colors duration-120 ease-out disabled:cursor-default data-picked:translate-y-px ${rating.tone}`}
            style={{ animationDelay: `${position * 40}ms` }}
          >
            <span aria-hidden="true" className={`mb-1 h-0.5 w-6 ${rating.mark}`} />
            <span className="flex items-center justify-between">
              <span className={`ui-m font-medium ${rating.text}`}>{rating.label}</span>
              <KeyHint>{String(position + 1)}</KeyHint>
            </span>
            <span className="ui-s text-ink-3">{rating.caption}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
