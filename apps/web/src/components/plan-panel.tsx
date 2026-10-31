'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { PlanCard } from './plan-card'
import { ShortDate } from './short-date'
import { track } from '@/lib/analytics'
import { api, readErrorCode } from '@/lib/api-client'
import { useCheckout } from '@/lib/checkout'
import { actionErrorCopy } from '@/lib/error-copy'
import type { Plan } from '@/lib/plans'

interface Subscription {
  status: 'active' | 'past_due'
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export function PlanPanel({
  plan,
  subscription: initial,
}: {
  plan: Plan
  subscription: Subscription | null
}) {
  const router = useRouter()
  const [subscription, setSubscription] = useState(initial)
  const [state, setState] = useState<
    'idle' | 'working' | { failure: string; on: 'action' | 'portal' }
  >('idle')
  const upgrade = useCheckout()

  async function change(path: 'cancel' | 'resume') {
    setState('working')
    const response = await api.billing[path].$post().catch(() => null)
    if (response?.ok) {
      track('subscription_changed', { change: path })
      setSubscription((await response.json()).subscription)
      setState('idle')
      router.refresh()
    } else {
      setState({ failure: actionErrorCopy('save', await readErrorCode(response)), on: 'action' })
    }
  }

  async function openPortal() {
    setState('working')
    const response = await api.billing.portal.$post().catch(() => null)
    if (response?.ok) {
      window.location.assign((await response.json()).url)
    } else {
      setState({ failure: actionErrorCopy('save', await readErrorCode(response)), on: 'portal' })
    }
  }

  const periodEnd =
    subscription?.currentPeriodEnd == null ? null : (
      <span className="mono">
        <ShortDate value={subscription.currentPeriodEnd} />
      </span>
    )

  let detail: ReactNode
  let action: { label: string; onClick: () => void } | null
  if (subscription?.status === 'past_due') {
    detail = 'Pro payment did not go through'
    action = { label: 'Update payment', onClick: openPortal }
  } else if (subscription?.cancelAtPeriodEnd) {
    detail = null
    action = { label: 'Keep Pro', onClick: () => change('resume') }
  } else if (plan === 'pro') {
    detail = periodEnd === null ? null : <>Renews {periodEnd}</>
    action = { label: 'Cancel Pro', onClick: () => change('cancel') }
  } else {
    detail = 'Your plan'
    action = null
  }

  const working = state === 'working'
  const failure = typeof state === 'object' ? state : null

  return (
    <div className={`grid gap-4 sm:items-start ${subscription === null ? 'sm:grid-cols-2' : ''}`}>
      <PlanCard plan={plan}>
        <div className="grid gap-3">
          {detail !== null && <p className="ui-s text-ink-3">{detail}</p>}
          {action !== null && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`btn btn-secondary btn-sm ${failure?.on === 'action' ? 'btn-failed' : ''}`}
                onClick={action.onClick}
                disabled={working}
                aria-busy={working}
              >
                <span aria-live="polite">
                  {failure?.on === 'action' ? failure.failure : action.label}
                </span>
              </button>
              {subscription?.status === 'active' && (
                <button
                  type="button"
                  className={`btn btn-ghost btn-sm ${failure?.on === 'portal' ? 'btn-failed' : ''}`}
                  onClick={openPortal}
                  disabled={working}
                  aria-busy={working}
                >
                  <span aria-live="polite">
                    {failure?.on === 'portal' ? failure.failure : 'Invoices'}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </PlanCard>
      {subscription === null && (
        <PlanCard plan="pro">
          <button
            type="button"
            className={`btn btn-primary btn-sm justify-self-start ${upgrade.failed ? 'btn-failed' : ''}`}
            onClick={upgrade.checkout}
            disabled={upgrade.opening}
            aria-busy={upgrade.opening}
          >
            <span aria-live="polite">{upgrade.label}</span>
          </button>
        </PlanCard>
      )}
    </div>
  )
}
