import type { LucideIcon } from 'lucide-react'

export function Icon({
  icon: Glyph,
  size = 18,
  strokeWidth = 1.5,
  className = '',
}: {
  icon: LucideIcon
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    />
  )
}
