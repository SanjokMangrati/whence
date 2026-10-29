'use client'

import * as Popover from '@radix-ui/react-popover'
import { ChevronDown, CreditCard, LogOut, Settings } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Icon } from './icon'
import { LogOutButton } from './log-out-button'
import { ProDialog } from './pro-dialog'
import { ProgressBar } from './progress-bar'
import { PLANS, type Plan } from '@/lib/plans'

const ROW =
  'ui-m flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-sm px-2 text-left transition-colors duration-120'

export const MENU_ROW = `${ROW} text-ink-2 hover:bg-paper-2 hover:text-ink`

const LOG_OUT_ROW = `${ROW} text-missed hover:bg-missed-wash`

export function AccountMenu({
  email,
  plan,
  used,
  limit,
}: {
  email: string
  plan: Plan
  used: number
  limit: number
}) {
  const [open, setOpen] = useState(false)
  const [proOpen, setProOpen] = useState(false)

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label="Account and plan"
          title="Account and plan"
          className="btn btn-ghost btn-sm gap-2 pr-2 pl-1.5"
        >
          <span
            aria-hidden="true"
            className="reading-m grid size-7 place-items-center rounded-sm bg-ink leading-none text-paper uppercase"
          >
            {email.charAt(0)}
          </span>
          <Icon icon={ChevronDown} size={14} className="text-ink-3" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            className="z-40 w-[288px] animate-pop rounded-md bg-card p-2 shadow-float"
          >
            <div className="grid gap-4 px-2 pt-2 pb-3">
              <p className="ui-s truncate text-ink-3">{email}</p>
              <div className="grid gap-2">
                <p className="mono-label text-ink-3">{PLANS[plan].name} plan</p>
                <ProgressBar value={used} total={limit} label={`${used} of ${limit}`} />
              </div>
              {plan !== 'pro' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm w-full"
                  onClick={() => {
                    setOpen(false)
                    setProOpen(true)
                  }}
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
            <div className="grid gap-0.5 border-t border-line pt-2">
              <Link href="/settings" className={MENU_ROW} onClick={() => setOpen(false)}>
                <Icon icon={Settings} size={16} />
                Settings
              </Link>
              <Link href="/billing" className={MENU_ROW} onClick={() => setOpen(false)}>
                <Icon icon={CreditCard} size={16} />
                Billing
              </Link>
              <LogOutButton className={LOG_OUT_ROW}>
                <Icon icon={LogOut} size={16} />
                Log out
              </LogOutButton>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <ProDialog open={proOpen} onOpenChange={setProOpen} />
    </>
  )
}
