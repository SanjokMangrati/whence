import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { EMAIL_ACCOUNTS } from '@/lib/accounts'

const SECTIONS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
]

const ACCOUNT_LINKS = EMAIL_ACCOUNTS
  ? [
      { href: '/login', label: 'Log in' },
      { href: '/signup', label: 'Sign up' },
    ]
  : [{ href: '/login', label: 'Try the demo' }]

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper-grain">
        <div className="mx-auto grid h-[60px] w-full max-w-page grid-cols-[1fr_auto] items-center gap-2 px-4 sm:grid-cols-[1fr_auto_1fr] sm:px-8">
          <Wordmark />
          <nav aria-label="Page" className="hidden gap-1 sm:flex">
            {SECTIONS.map((section) => (
              <a key={section.href} href={section.href} className="btn btn-ghost btn-sm text-ink-2">
                {section.label}
              </a>
            ))}
          </nav>
          <div className="flex gap-2 justify-self-end">
            {ACCOUNT_LINKS.map((link, index) => (
              <Link
                key={link.href}
                href={link.href}
                className={`btn btn-sm ${index === ACCOUNT_LINKS.length - 1 ? 'btn-secondary' : 'btn-ghost'}`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-line">
        <div className="mx-auto grid w-full max-w-page grid-cols-2 gap-8 px-4 pt-12 pb-8 sm:px-8 lg:grid-cols-[5fr_2fr_2fr_2fr]">
          <div className="grid content-start gap-2">
            <Wordmark />
            <p className="ui-s max-w-[26em] text-ink-3">
              Notes and quizzes from YouTube videos and articles.
            </p>
          </div>
          <FooterLinks title="Product" links={SECTIONS} />
          <FooterLinks title="Account" links={ACCOUNT_LINKS} />
          <FooterLinks
            title="Legal"
            links={[
              { href: '/privacy', label: 'Privacy' },
              { href: '/terms', label: 'Terms' },
            ]}
          />
        </div>
        <div className="mx-auto w-full max-w-page px-4 pb-10 sm:px-8">
          <p className="mono border-t border-line pt-5 text-xs text-ink-3">&copy; 2026 Whence</p>
        </div>
      </footer>
    </div>
  )
}

function FooterLinks({
  title,
  links,
}: {
  title: string
  links: { href: string; label: string }[]
}) {
  return (
    <nav aria-label={title} className="grid content-start gap-2.5">
      <p className="mono-label pb-1 text-ink-3">{title}</p>
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="ui-s justify-self-start decoration-1 underline-offset-4 hover:underline"
        >
          {link.label}
        </a>
      ))}
    </nav>
  )
}
