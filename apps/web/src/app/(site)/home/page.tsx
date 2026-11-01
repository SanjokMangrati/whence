import type { Metadata } from 'next'
import Link from 'next/link'
import { CLOSING, FAQ, FEATURES, HERO, PRICING, PROBLEM, type Feature } from './content'
import { DemoAccount } from '@/components/demo-account'
import { FilmPanel } from '@/components/film-panel'
import { LandingComposer } from '@/components/landing-composer'
import { PlanCard } from '@/components/plan-card'
import { RevealGroup } from '@/components/reveal-group'
import { SourceMargin } from '@/components/source-margin'
import { SpecimenStrip } from '@/components/specimen-strip'
import { EMAIL_ACCOUNTS } from '@/lib/accounts'
import { PLANS, type Plan } from '@/lib/plans'

export const metadata: Metadata = {
  title: 'Whence: notes and quizzes from YouTube videos and articles',
  description: `Paste a YouTube video or an article. Get notes, a cheat sheet, and quizzes, so you don’t have to watch it again. Free for ${PLANS.free.sourcesPerPeriod} links per month.`,
  openGraph: {
    title: 'Whence',
    description: 'Study notes for the YouTube videos you learn from.',
  },
}

const PLAN_ORDER: Plan[] = ['free', 'pro']

const SECTION = 'mx-auto w-full max-w-page scroll-mt-15 px-4 pt-24 sm:px-8 sm:pt-32'
const SPLIT = 'grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16'

export default function LandingPage() {
  return (
    <main id="top" className="flex flex-col">
      <section className="mx-auto w-full max-w-page px-4 pt-16 sm:px-8 sm:pt-28">
        <div className="mx-auto grid max-w-[680px] justify-items-center gap-7 text-center">
          <h1 className="display-l sm:display-xl animate-reveal text-balance">{HERO.title}</h1>
          <p className="reading-l max-w-[34em] animate-reveal text-ink-2 [animation-delay:80ms]">
            {HERO.body}
          </p>
          <div className="w-full animate-reveal [animation-delay:160ms]">
            <LandingComposer />
          </div>
          <DemoAccount className="animate-reveal [animation-delay:200ms]" />
        </div>

        <div className="mx-auto mt-14 max-w-[1120px] animate-reveal [animation-delay:240ms] sm:mt-20">
          <SpecimenStrip />
        </div>
      </section>

      <section className={SECTION}>
        <RevealGroup className="grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-end lg:gap-16">
          <div className="reveal">
            <h2 className="display-l sm:display-xl text-balance">{PROBLEM.title}</h2>
          </div>
          <div className="reveal">
            <p className="reading-l text-ink-2">{PROBLEM.body}</p>
          </div>
        </RevealGroup>
      </section>

      <div className="pt-24 sm:pt-32">
        <FilmPanel />
      </div>

      {FEATURES.map((feature) => (
        <section key={feature.id} id={feature.id} className={SECTION}>
          {feature.wide ? <WideFeature feature={feature} /> : <SplitFeature feature={feature} />}
        </section>
      ))}

      <section id="pricing" className={SECTION}>
        <RevealGroup className={`${SPLIT} border-t border-line pt-5`}>
          <div className="reveal grid content-start gap-4">
            <h2 className="display-m sm:display-l text-balance">{PRICING.title}</h2>
            <p className="ui-m max-w-[30em] pt-2 text-ink-2">{PRICING.body}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            {PLAN_ORDER.map((id) => (
              <PlanCard key={id} plan={id} className={id === 'free' ? 'reveal sm:mt-12' : 'reveal'}>
                {id === 'free' ? (
                  <a href="#top" className="btn btn-primary justify-self-start">
                    Make notes
                  </a>
                ) : (
                  <Link
                    href={EMAIL_ACCOUNTS ? '/signup' : '/login'}
                    className="btn btn-secondary justify-self-start"
                  >
                    {EMAIL_ACCOUNTS ? 'Sign up' : 'Try the demo'}
                  </Link>
                )}
              </PlanCard>
            ))}
          </div>
        </RevealGroup>
      </section>

      <section id="faq" className={SECTION}>
        <RevealGroup stagger={40} className={`${SPLIT} border-t border-line`}>
          <div className="reveal pt-5">
            <h2 className="display-m sm:display-l">FAQ</h2>
          </div>
          <dl className="border-b border-line lg:[&>:first-child]:border-t-0">
            {FAQ.map((item) => (
              <div
                key={item.q}
                className="reveal grid gap-1.5 border-t border-line py-5 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] sm:gap-8"
              >
                <dt className="ui-l font-medium">{item.q}</dt>
                <dd className="ui-m text-ink-2">{item.a}</dd>
              </div>
            ))}
          </dl>
        </RevealGroup>
      </section>

      <section className="relative mx-auto w-full max-w-page">
        <SourceMargin />
        <RevealGroup className="relative mx-auto grid max-w-[680px] justify-items-center gap-8 px-4 pt-36 pb-36 text-center">
          <div className="reveal">
            <h2 className="display-l sm:display-xl text-balance">{CLOSING.title}</h2>
          </div>
          <div className="reveal w-full">
            <LandingComposer />
          </div>
        </RevealGroup>
      </section>
    </main>
  )
}

function SplitFeature({ feature }: { feature: Feature }) {
  const { title, body, demo } = feature
  return (
    <RevealGroup className={`${SPLIT} border-t border-line pt-5 lg:items-start`}>
      <div className="grid content-start gap-4 lg:sticky lg:top-24">
        <div className="reveal">
          <h2 className="display-m sm:display-l text-balance">{title}</h2>
        </div>
        <div className="reveal">
          <p className="reading-l max-w-[30em] text-ink-2">{body}</p>
        </div>
      </div>
      <div className="reveal">{demo}</div>
    </RevealGroup>
  )
}

function WideFeature({ feature }: { feature: Feature }) {
  return (
    <RevealGroup className="grid gap-10">
      <div className={`${SPLIT} border-t border-line pt-5`}>
        <div className="reveal">
          <h2 className="display-m sm:display-l text-balance">{feature.title}</h2>
        </div>
        <div className="reveal lg:pt-2">
          <p className="reading-l max-w-[30em] text-ink-2">{feature.body}</p>
        </div>
      </div>
      <div className="reveal">{feature.demo}</div>
    </RevealGroup>
  )
}
