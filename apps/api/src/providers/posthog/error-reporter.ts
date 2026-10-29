import { PostHog } from 'posthog-node'
import { redact } from 'redact'
import type { ErrorContext, ErrorReporter } from '../../domain/ports'

export interface PostHogConfig {
  apiKey: string
  host: string
}

export function errorReporterFromEnv(env: Env): ErrorReporter {
  return createPostHogErrorReporter({ apiKey: env.POSTHOG_KEY, host: env.POSTHOG_HOST })
}

export function createPostHogErrorReporter(config: PostHogConfig): ErrorReporter {
  return {
    async report(error: unknown, context: ErrorContext) {
      console.error(context.where, error)
      if (config.apiKey === '') return
      const client = new PostHog(config.apiKey, {
        host: config.host,
        flushAt: 1,
        flushInterval: 0,
        fetchRetryCount: 0,
        requestTimeout: 3000,
      })
      try {
        await client.captureExceptionImmediate(redact(error), context.userId, {
          where: context.where,
          ...context.properties,
        })
      } catch (sendError) {
        console.error('error report failed', sendError)
      }
    },
  }
}
