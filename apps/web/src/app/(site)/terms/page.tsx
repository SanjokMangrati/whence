import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { PLAN_LIMIT, PLANS, PRO_PRICE } from '@/lib/plans'

export const metadata: Metadata = { title: 'Terms · Whence' }

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      lede="The rules for using Whence, for the Free plan and for Pro."
      updated="OCT 03, 2026"
      sections={[
        {
          heading: 'The service',
          paragraphs: [
            'Whence makes notes, a cheat sheet, and questions from a YouTube video or an article you paste. Each line links to the moment in the source it comes from. Questions come back on dates you can see.',
          ],
        },
        {
          heading: 'Your account',
          paragraphs: [
            'You need an account to make notes. Keep your password private. You are responsible for what happens in your account.',
          ],
        },
        {
          heading: 'What you paste',
          paragraphs: [
            'Paste only links you have the right to use for your own study. Whence reads public pages only. Your notes are for you and are not shared with other users.',
          ],
        },
        {
          heading: 'Plans and payment',
          list: [
            PLAN_LIMIT.free,
            `Pro is ${PRO_PRICE}, tax included. ${PLAN_LIMIT.pro}`,
            'Pro renews each month until you cancel. Cancel any time; Pro stays until the end of the month you paid for.',
            'A refund within 14 days of your first payment, on request.',
            `A source that fails does not count toward your plan, up to ${PLANS.free.failedSourcesReturnedPerPeriod} failed sources a month on Free and ${PLANS.pro.failedSourcesReturnedPerPeriod} on Pro.`,
          ],
        },
        {
          heading: 'Your notes are a study aid',
          paragraphs: [
            'Notes and questions come from the source, and each line links to the moment it comes from. Check a line against the source before you rely on it. Whence does not promise that a source is correct.',
          ],
        },
        {
          heading: 'Ending',
          paragraphs: [
            'You can stop using Whence at any time. When Pro ends, your notes and questions stay on Free. Whence can close an account that breaks these terms. [NOTICE PERIOD NEEDED]',
          ],
        },
        {
          heading: 'Changes',
          paragraphs: [
            'When these terms change, the date at the top changes. A change that affects what you pay is sent to your email first. [NOTICE PERIOD NEEDED]',
          ],
        },
        {
          heading: 'Contact',
          paragraphs: [
            'Questions about these terms: [CONTACT EMAIL NEEDED]. Governing law: [JURISDICTION NEEDED]',
          ],
        },
      ]}
    />
  )
}
