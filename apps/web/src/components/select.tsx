'use client'

import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { MENU_ROW } from './account-menu'
import { Icon } from './icon'

export interface SelectOption {
  value: string
  label: string
  detail?: string
}

export function Select({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string
  value: string
  options: SelectOption[]
  onValueChange: (value: string) => void
}) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange}>
      <RadixSelect.Trigger aria-label={label} title={label} className="btn btn-ghost btn-sm pr-2">
        <span className="max-w-40 truncate">
          <RadixSelect.Value />
        </span>
        <RadixSelect.Icon>
          <Icon icon={ChevronDown} size={14} className="text-ink-3" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          align="end"
          sideOffset={6}
          className="z-40 max-h-(--radix-select-content-available-height) w-max max-w-72 min-w-(--radix-select-trigger-width) animate-pop overflow-hidden rounded-md bg-card p-1 shadow-float"
        >
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className={`${MENU_ROW} outline-none data-highlighted:bg-paper-2 data-highlighted:text-ink`}
              >
                <span className="w-4 shrink-0">
                  <RadixSelect.ItemIndicator>
                    <Icon icon={Check} size={16} />
                  </RadixSelect.ItemIndicator>
                </span>
                <RadixSelect.ItemText className="truncate">{option.label}</RadixSelect.ItemText>
                {option.detail !== undefined && (
                  <span className="mono ml-auto pl-4 text-ink-3">{option.detail}</span>
                )}
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
