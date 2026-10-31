import { DemoLimits } from '@/components/demo-limits'
import { PlanPanel } from '@/components/plan-panel'
import { ProgressBar } from '@/components/progress-bar'
import { ShortDate } from '@/components/short-date'
import { currentUser, serverApi } from '@/lib/api-server'
import { shortDate } from '@/lib/format'

export default async function BillingPage() {
  const api = await serverApi()
  const [me, { subscription }, providerKey] = await Promise.all([
    currentUser(),
    api.billing.subscription.$get().then((response) => response.json()),
    api.me['provider-key'].$get().then((response) => response.json()),
  ])
  const now = new Date()
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const endsAt = subscription?.cancelAtPeriodEnd ? subscription.currentPeriodEnd : null
  const monthly = me.quotaPeriod === 'month'

  return (
    <main className="mx-auto grid w-full max-w-[640px] content-start gap-10 px-4 pt-14 pb-24 sm:px-6">
      <h1 className="display-l">Billing</h1>
      <section aria-labelledby="plan" className="grid gap-4 border-t border-line pt-5">
        <h2 id="plan" className="mono-label text-ink-3">
          Plan
        </h2>
        <PlanPanel plan={me.plan} subscription={subscription} />
      </section>
      {me.plan === 'demo' && (
        <section aria-labelledby="demo" className="grid gap-4 border-t border-line pt-5">
          <h2 id="demo" className="mono-label text-ink-3">
            Demo limits
          </h2>
          <DemoLimits keyRequired={providerKey.required} />
        </section>
      )}
      <section aria-labelledby="usage" className="grid gap-4 border-t border-line pt-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="usage" className="mono-label text-ink-3">
            {monthly ? 'Sources this month' : 'Sources in this account'}
          </h2>
          {monthly && (
            <p className="mono-label text-ink-3">
              {endsAt === null ? (
                <>Resets {shortDate(nextMonth, 'UTC')}</>
              ) : (
                <>
                  Ends <ShortDate value={endsAt} />
                </>
              )}
            </p>
          )}
        </div>
        <ProgressBar
          value={me.sourcesUsed}
          total={me.sourcesPerPeriod}
          label={`${me.sourcesUsed} of ${me.sourcesPerPeriod}`}
        />
      </section>
    </main>
  )
}
