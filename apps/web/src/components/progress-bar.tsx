export function ProgressBar({
  value,
  total,
  label,
  working = false,
}: {
  value: number
  total: number
  label: string
  working?: boolean
}) {
  return (
    <div className="flex w-full items-center gap-3.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
        aria-label={label}
        className="h-0.5 flex-1 overflow-hidden rounded-[1px] bg-line"
      >
        <div
          className="relative h-full overflow-hidden bg-ink transition-[width] duration-320 ease-out"
          style={{ width: `${Math.min(100, (value / total) * 100)}%` }}
        >
          {working && (
            <span className="absolute inset-y-0 left-0 w-2/5 animate-sweep bg-linear-to-r from-transparent via-paper/55 to-transparent" />
          )}
        </div>
      </div>
      <span className="mono whitespace-nowrap text-ink-2">{label}</span>
    </div>
  )
}
