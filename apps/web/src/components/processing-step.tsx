import { Check } from 'lucide-react'
import { Icon } from './icon'

export function Step({
  number,
  label,
  state,
}: {
  number: number
  label: string
  state: 'done' | 'now' | 'next'
}) {
  return (
    <li
      className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-line py-3.5"
      aria-current={state === 'now' ? 'step' : undefined}
    >
      <span className="mono text-ink-3">{String(number).padStart(2, '0')}</span>
      <span
        className={`ui-l ${state === 'next' ? 'text-ink-4' : state === 'now' ? 'font-medium text-ink' : 'text-ink-2'}`}
      >
        {label}
        {state === 'done' && <span className="sr-only"> (done)</span>}
      </span>
      {state === 'done' ? (
        <Icon icon={Check} size={16} className="self-center text-ink-2" />
      ) : (
        <span className="mono-label text-ink-3">{state === 'now' ? 'Now' : ''}</span>
      )}
    </li>
  )
}
