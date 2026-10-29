import posthog from 'posthog-js'
import { scrub } from 'redact'
import type { OutputType } from './api-client'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST

interface Events {
  signed_up: Record<string, never>
  source_submitted: { output_type: OutputType }
  generation_started: { output_type: OutputType }
  artifact_viewed: { artifact_type: 'notes' | 'cheat_sheet' }
  answer_revealed: Record<string, never>
  recall_rated: { rating: 'again' | 'hard' | 'good' | 'easy' }
  question_removed: Record<string, never>
  reminders_enabled: Record<string, never>
  checkout_opened: Record<string, never>
  subscription_changed: { change: 'cancel' | 'resume' }
  landing_link_submitted: Record<string, never>
  specimen_marker_clicked: Record<string, never>
}

export function startAnalytics() {
  if (KEY === undefined) return
  posthog.init(KEY, {
    api_host: HOST,
    defaults: '2026-08-30',
    autocapture: false,
    capture_exceptions: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: ['token', 'link'],
    before_send: (event) => {
      const exceptions: unknown = event?.properties.$exception_list
      if (Array.isArray(exceptions)) {
        for (const exception of exceptions) {
          if (typeof exception?.value === 'string') exception.value = scrub(exception.value)
        }
      }
      return event
    },
  })
}

export function track<E extends keyof Events>(event: E, properties: Events[E]) {
  if (KEY === undefined) return
  posthog.capture(event, properties)
}

export function identify(userId: string) {
  if (KEY === undefined) return
  posthog.identify(userId)
}

export function reportError(error: Error) {
  if (KEY === undefined) return
  posthog.captureException(error)
}

export function forgetUser() {
  if (KEY === undefined) return
  posthog.reset()
}
