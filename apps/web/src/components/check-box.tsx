import { Check } from 'lucide-react'
import { Icon } from './icon'

export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-4 shrink-0 place-items-center rounded-xs border text-paper transition-colors duration-120 ${
        checked ? 'border-ink bg-ink' : 'border-line-strong bg-card'
      }`}
    >
      {checked && <Icon icon={Check} size={12} strokeWidth={2} />}
    </span>
  )
}
