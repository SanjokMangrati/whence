import { CheckBox } from './check-box'

export function OutputOption({
  label,
  detail,
  checked,
  blockedReason,
  onChange,
}: {
  label: string
  detail: string
  checked: boolean
  blockedReason?: string
  onChange: (checked: boolean) => void
}) {
  const blocked = blockedReason !== undefined
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-disabled={blocked || undefined}
      title={blockedReason ?? detail}
      onClick={() => !blocked && onChange(!checked)}
      className={`flex h-10 items-center gap-2 rounded-sm border px-3 transition-colors duration-120 ease-out ${
        checked
          ? `border-ink text-ink ${blocked ? 'cursor-default' : 'cursor-pointer'}`
          : 'cursor-pointer border-line text-ink-3 hover:border-line-strong'
      }`}
    >
      <CheckBox checked={checked} />
      <span className="ui-m font-medium whitespace-nowrap">{label}</span>
    </button>
  )
}
