export function SourceChip({
  label,
  description,
  active,
  onClick,
}: {
  label: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={active}
      aria-label={description}
      title={description}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
