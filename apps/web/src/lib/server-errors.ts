import type { Instrumentation } from 'next'
import { PostHog } from 'posthog-node'
import { redact } from 'redact'

export interface PostHogConfig {
  apiKey: string
  host: string
}

export function createRequestErrorReporter(
  config: PostHogConfig,
): (...args: Parameters<Instrumentation.onRequestError>) => Promise<void> {
  return async (error, request, context) => {
    if (config.apiKey === '' || config.host === '') return
    const client = new PostHog(config.apiKey, {
      host: config.host,
      flushAt: 1,
      flushInterval: 0,
      fetchRetryCount: 0,
      requestTimeout: 3000,
    })
    const digest =
      typeof error === 'object' && error !== null && 'digest' in error
        ? String(error.digest)
        : undefined
    try {
      await client.captureExceptionImmediate(
        redact(error),
        visitorOf(request.headers.cookie, config.apiKey),
        {
          where: `web/${context.routeType}`,
          route: context.routePath,
          ...(digest === undefined ? {} : { digest }),
        },
      )
    } catch (sendError) {
      console.error('error report failed', sendError)
    }
  }
}

function visitorOf(cookie: string | string[] | undefined, apiKey: string): string | undefined {
  const name = `ph_${apiKey.replace(/\+/g, 'PL').replace(/\//g, 'SL').replace(/=/g, 'EQ')}_posthog=`
  const pair = [cookie ?? []]
    .flat()
    .flatMap((header) => header.split(/;\s*/))
    .find((part) => part.startsWith(name))
  if (pair === undefined) return undefined
  try {
    const value = JSON.parse(decodeURIComponent(pair.slice(name.length))) as {
      distinct_id?: unknown
    }
    return typeof value.distinct_id === 'string' ? value.distinct_id : undefined
  } catch {
    return undefined
  }
}
