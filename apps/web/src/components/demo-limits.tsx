import Link from 'next/link'
import { PLAN_LIMIT } from '@/lib/plans'

export function DemoLimits({ keyRequired }: { keyRequired: boolean }) {
  return (
    <ul className="ui-m grid list-disc gap-1.5 pl-[18px] text-ink-2">
      {keyRequired && (
        <li>
          Notes are made with your own Anthropic key. Add it in{' '}
          <Link href="/settings" className="link">
            Settings
          </Link>
          .
        </li>
      )}
      <li>Videos need captions.</li>
      <li>{PLAN_LIMIT.demo}</li>
      <li>
        All visitors share one budget each month. When it runs out, new sources start again the next
        month.
      </li>
      <li>The demo account is deleted after 7 days.</li>
    </ul>
  )
}
