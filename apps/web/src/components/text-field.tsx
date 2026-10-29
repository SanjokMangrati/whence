import type { InputHTMLAttributes } from 'react'

export function TextField({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-1.5">
      <span className="ui-s font-medium text-ink-2">{label}</span>
      <input className="field" {...input} />
      {hint !== undefined && <span className="ui-s text-ink-3">{hint}</span>}
    </label>
  )
}
