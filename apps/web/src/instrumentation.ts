import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Instrumentation } from 'next'
import { createRequestErrorReporter } from './lib/server-errors'

const report = createRequestErrorReporter({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '',
})

export const onRequestError: Instrumentation.onRequestError = (...args) => {
  const sent = report(...args)
  getCloudflareContext().ctx.waitUntil(sent)
  return sent
}
