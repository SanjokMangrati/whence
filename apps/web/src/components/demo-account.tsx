'use client'

import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'
import { identify, track } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { authErrorCopy } from '@/lib/error-copy'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type WidgetId = string

interface Turnstile {
  render(
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      appearance: 'interaction-only'
      callback: (token: string) => void
      'expired-callback': () => void
    },
  ): WidgetId
  reset(widgetId: WidgetId): void
  remove(widgetId: WidgetId): void
}

declare global {
  interface Window {
    turnstile: Turnstile
  }
}

export function DemoAccount({ className = '' }: { className?: string }) {
  return SITE_KEY === undefined ? null : (
    <DemoAccountButton siteKey={SITE_KEY} className={className} />
  )
}

function DemoAccountButton({ siteKey, className }: { siteKey: string; className: string }) {
  const router = useRouter()
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<WidgetId | null>(null)
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!ready || container.current === null) return
    const id = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action: 'demo_account',
      appearance: 'interaction-only',
      callback: setToken,
      'expired-callback': () => setToken(null),
    })
    widget.current = id
    return () => {
      window.turnstile.remove(id)
      widget.current = null
    }
  }, [ready, siteKey])

  async function start(captcha: string) {
    setPending(true)
    setFailure(null)
    const result = await authClient.signIn
      .anonymous({ fetchOptions: { headers: { 'x-captcha-response': captcha } } })
      .catch(() => null)
    setPending(false)
    if (result === null || result.error) {
      setFailure(authErrorCopy('startDemo', result?.error ?? null))
      setToken(null)
      if (widget.current !== null) window.turnstile.reset(widget.current)
      return
    }
    identify(result.data.user.id)
    track('demo_started', {})
    router.push('/')
    router.refresh()
  }

  return (
    <div className={`grid gap-2 ${className}`}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={container} />
      {failure !== null && (
        <p role="alert" className="ui-s font-medium text-missed">
          {failure}
        </p>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={token === null || pending}
        onClick={() => token !== null && void start(token)}
      >
        Try the demo
      </button>
    </div>
  )
}
