'use client'

import { ArrowRight, Link as LinkIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Icon } from './icon'
import { track } from '@/lib/analytics'
import { submitWith, withLink } from '@/lib/forms'

export function LandingComposer() {
  const router = useRouter()

  async function submit(form: FormData) {
    track('landing_link_submitted', {})
    router.push(withLink('/signup', String(form.get('url'))))
  }

  return (
    <form onSubmit={submitWith(submit)} className="w-full">
      <div className="field-box grid rounded-md border border-line-strong bg-card text-left transition-[border-color,box-shadow] duration-120 ease-out sm:flex sm:items-center">
        <label className="flex h-[60px] items-center gap-3 px-[18px] text-ink-3 sm:flex-1">
          <Icon icon={LinkIcon} />
          <input
            name="url"
            type="url"
            placeholder="Paste a YouTube or article link"
            aria-label="Link to a YouTube video or an article"
            autoComplete="off"
            required
            className="ui-l min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-ink-4"
          />
        </label>
        <div className="flex justify-end border-t border-line p-3 sm:border-t-0 sm:py-0 sm:pr-2.5 sm:pl-0">
          <button type="submit" className="btn btn-primary">
            Make notes
            <Icon icon={ArrowRight} size={17} />
          </button>
        </div>
      </div>
      <p className="ui-s mt-3 text-ink-3">Start for free. No card needed.</p>
    </form>
  )
}
