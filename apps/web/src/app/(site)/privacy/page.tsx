import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { DEMO_ACCOUNT_DAYS } from '@/lib/plans'

export const metadata: Metadata = { title: 'Privacy · Whence' }

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      lede="What Whence keeps about you, who else handles it, and what you can change."
      updated="OCT 30, 2026"
      sections={[
        {
          heading: 'What this page covers',
          paragraphs: [
            'This page covers the Whence website and app: your account, the links you paste, and the notes, cheat sheets, and questions made from them.',
          ],
        },
        {
          heading: 'What Whence keeps',
          paragraphs: ['To run your account and your study material, Whence keeps:'],
          list: [
            'Your email address and a hash of your password.',
            'Each link you paste, and the transcript or article text read from it.',
            'Your notes, cheat sheets, and questions, with the timestamps that link them to the source.',
            'Your ratings and the date each question comes back.',
            'Your plan, your sources used this month, and your settings, such as reminder emails.',
            'If you add an Anthropic key, the key, encrypted. Whence uses it only to make your notes.',
          ],
        },
        {
          heading: 'Who else handles it',
          paragraphs: ['Whence uses these services to run. Each one gets only what its job needs.'],
          list: [
            'Cloudflare hosts the app and stores your data.',
            'Anthropic receives the text of your source to write your notes and questions.',
            'Jev receives the text of your source to check each point against it.',
            'Supadata reads the captions of a YouTube video.',
            'Dodo Payments takes your payment for Pro. Your card details go to Dodo Payments and never reach Whence.',
            'Resend sends account emails and, when you turn them on, reminder emails.',
            'PostHog records how the app is used and reports errors.',
            'YouTube plays videos in the reader, through youtube-nocookie.com.',
          ],
        },
        {
          heading: 'How long it stays',
          paragraphs: [
            `When you delete a source, you stop seeing it. Whence keeps the notes, cheat sheet, and questions made from it, because the next person who adds the same source gets a copy of them. Your account stays until you ask for it to be deleted. A demo account is deleted after ${DEMO_ACCOUNT_DAYS} days. [RETENTION PERIOD NEEDED]`,
          ],
        },
        {
          heading: 'What you can change',
          list: [
            'Turn reminder emails on or off in Settings.',
            'Delete your Anthropic key in Settings.',
            'Download your notes and cheat sheets as PDF, Word, or Markdown, on Pro.',
            'Delete a source. Your sources this month still count it.',
            'Ask for your account and its data to be deleted. [THE APP HAS NO DELETE FOR AN ACCOUNT YET]',
          ],
        },
        {
          heading: 'Contact',
          paragraphs: ['Questions about this page: [CONTACT EMAIL NEEDED]'],
        },
      ]}
    />
  )
}
