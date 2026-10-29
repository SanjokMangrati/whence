import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './auth-client'
import { PLANS, type Plan } from './plans'

const { free, pro, demo } = PLANS

export type ErrorAction = 'paste' | 'retry' | 'log_in' | 'add_key'

export interface ErrorCopy {
  heading: string
  body: string
  actions: ErrorAction[]
}

const RETURNED = 'A source that fails does not count.'
const COUNTED_IN_MONTH = `This one counts toward your month. Free gives back ${free.failedSourcesReturnedPerPeriod} failed sources a month. Pro gives back ${pro.failedSourcesReturnedPerPeriod}.`

const COUNTED: Record<Plan, string> = {
  free: COUNTED_IN_MONTH,
  pro: COUNTED_IN_MONTH,
  demo: `This one counts toward the demo's ${demo.sourcesPerPeriod} sources. The demo gives back ${demo.failedSourcesReturnedPerPeriod} failed sources.`,
}

const SAYS_RETURNED = new Set(['extraction_failed', 'generation_failed', 'verifier_request_failed'])

const PROVIDER_FAILURE: ErrorCopy = {
  heading: 'Your notes are not ready.',
  body: 'They stopped before they were finished.',
  actions: ['retry'],
}

const UNSUPPORTED_SOURCE: ErrorCopy = {
  heading: 'This link is not a YouTube video or a readable article.',
  body: 'Paste a YouTube link or a link to an article.',
  actions: ['paste'],
}

const COPY: Record<string, ErrorCopy> = {
  unsupported_source: UNSUPPORTED_SOURCE,
  invalid_request: UNSUPPORTED_SOURCE,
  private_address: {
    heading: 'This link does not go to a public page.',
    body: 'Paste a link that opens for anyone.',
    actions: ['paste'],
  },
  captions_unavailable: {
    heading: 'This video has no full captions.',
    body: 'Paste a video that has captions, or an article.',
    actions: ['paste'],
  },
  extraction_failed: {
    heading: 'This source could not be read.',
    body: 'The page may be blocked or empty. Try again, or paste another link.',
    actions: ['retry', 'paste'],
  },
  generation_failed: PROVIDER_FAILURE,
  verifier_request_failed: PROVIDER_FAILURE,
  verification_failed: {
    heading: 'This source did not give enough clear points to make notes.',
    body: 'Try a longer or more detailed source.',
    actions: ['paste'],
  },
  too_many_claims: {
    heading: 'This source has more points than one set of notes can hold.',
    body: 'Paste a shorter source.',
    actions: ['paste'],
  },
  provider_key_required: {
    heading: 'Add your Anthropic key first.',
    body: 'The demo makes notes with your own key. Add it in Settings, then paste the link again.',
    actions: ['add_key'],
  },
  demo_budget_exhausted: {
    heading: 'The demo budget for this month is used up.',
    body: 'Your notes so far still open. New sources start again next month.',
    actions: [],
  },
  daily_limit_reached: {
    heading: 'Free sources are used up for today.',
    body: 'Paste the link again tomorrow. Pro has no daily limit.',
    actions: [],
  },
  too_many_running: {
    heading: 'Your other sources are still in progress.',
    body: 'Wait for one to finish, then paste the link again.',
    actions: ['paste'],
  },
  rate_limited: {
    heading: 'Too many links at once.',
    body: 'Wait 1 minute, then paste the link again.',
    actions: ['paste'],
  },
  internal_error: {
    heading: 'Your notes did not start.',
    body: 'Paste the link again to start over.',
    actions: ['paste'],
  },
  unauthorized: {
    heading: 'You are logged out.',
    body: 'Log in, then paste the link again.',
    actions: ['log_in'],
  },
}

const SOURCE_TOO_LONG = 'This source is longer than your plan allows.'
const QUOTA_EXCEEDED = 'You used all your sources this month.'

const PLAN_COPY: Record<Plan, Record<string, ErrorCopy>> = {
  free: {
    source_too_long: {
      heading: SOURCE_TOO_LONG,
      body: `Free takes up to ${free.minutesPerSource} minutes. Pro takes up to ${pro.minutesPerSource}.`,
      actions: ['paste'],
    },
    quota_exceeded: {
      heading: QUOTA_EXCEEDED,
      body: `Free has ${free.sourcesPerPeriod} per month. Pro has ${pro.sourcesPerPeriod}.`,
      actions: [],
    },
  },
  pro: {
    source_too_long: {
      heading: SOURCE_TOO_LONG,
      body: `Pro takes up to ${pro.minutesPerSource} minutes.`,
      actions: ['paste'],
    },
    quota_exceeded: {
      heading: QUOTA_EXCEEDED,
      body: `Pro has ${pro.sourcesPerPeriod} per month.`,
      actions: [],
    },
  },
  demo: {
    source_too_long: {
      heading: 'This source is longer than the demo allows.',
      body: `The demo takes up to ${demo.minutesPerSource} minutes.`,
      actions: ['paste'],
    },
    quota_exceeded: {
      heading: 'You used all your demo sources.',
      body: `The demo account takes ${demo.sourcesPerPeriod} sources.`,
      actions: [],
    },
  },
}

const UNKNOWN: ErrorCopy = {
  heading: 'Your notes are not ready.',
  body: 'They stopped before they were finished. Paste the link again to start over.',
  actions: ['paste'],
}

export const PAGE_FAILED = {
  heading: 'This page did not load.',
  body: 'Reload the page, or go to Home.',
}

export function errorCopy(code: string | null, plan: Plan, counted = false): ErrorCopy {
  const copy = (code !== null && (PLAN_COPY[plan][code] ?? COPY[code])) || UNKNOWN
  if (counted) return { ...copy, body: `${copy.body} ${COUNTED[plan]}` }
  if (code !== null && SAYS_RETURNED.has(code)) return { ...copy, body: `${copy.body} ${RETURNED}` }
  return copy
}

const ACTION_FAILED = {
  save: 'That did not go through. Try again.',
  copy: 'Copy failed. Try again.',
  checkout: 'Checkout did not open. Try again.',
  download: 'The file did not download. Try again.',
  answer: 'The answer did not load. Try again.',
  rating: 'Your rating did not save. Try again.',
  remove: 'The question was not removed. Try again.',
  delete: 'The source was not deleted. Try again.',
  dates: 'The dates did not load. Try again.',
  saveKey: 'The key was not saved. Try again.',
  deleteKey: 'The key was not deleted. Try again.',
}

export type Action = keyof typeof ACTION_FAILED

const ACTION_COPY: Record<string, string> = {
  unauthorized: 'You are logged out. Log in, then try again.',
  not_found: 'This no longer exists. Reload the page.',
  invalid_request: 'Check what you entered, then try again.',
  entitlement_required: 'This needs Pro. Your plan is Free.',
  already_subscribed: 'You are on Pro already. Reload the page.',
  no_subscription: 'You have no Pro plan to change. Reload the page.',
  export_unsupported_text:
    'The PDF cannot show some characters in these notes. Download the Word document instead.',
}

export function actionErrorCopy(action: Action, code: string | null = null): string {
  return (code !== null && ACTION_COPY[code]) || ACTION_FAILED[action]
}

const AUTH_FAILED = {
  logIn: 'Log in did not go through. Try again.',
  signUp: 'Your account was not made. Try again.',
  sendLink: 'The link was not sent. Try again.',
  setPassword: 'The password did not change. Try again.',
  startDemo: 'The demo did not start. Try again.',
}

const AUTH_COPY: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'The email or password is not correct. Try again.',
  INVALID_EMAIL: 'This email is not valid. Check it, then try again.',
  USER_ALREADY_EXISTS: 'An account with this email exists. Log in instead.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'An account with this email exists. Log in instead.',
  PASSWORD_TOO_SHORT: `The password is too short. Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  PASSWORD_TOO_LONG: `The password is too long. Use ${MAX_PASSWORD_LENGTH} characters or fewer.`,
  INVALID_TOKEN: 'This link does not work. It may be old or used already.',
  EMAIL_NOT_VERIFIED: 'Confirm your email first. A new link is on its way.',
  MISSING_RESPONSE: 'The check that you are a person did not finish. Try again.',
  VERIFICATION_FAILED: 'The check that you are a person did not finish. Try again.',
  DEMO_ACCOUNT_LIMIT:
    'This network started its demo accounts for today. Sign up, or try again tomorrow.',
  ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
    'You are in a demo account already. Go to Home.',
}

export function authErrorCopy(
  action: keyof typeof AUTH_FAILED,
  error: { code?: string; status: number } | null,
): string {
  const known = error?.code === undefined ? undefined : AUTH_COPY[error.code]
  if (known !== undefined) return known
  if (error?.status === 429) return 'Too many tries. Wait 1 minute, then try again.'
  return AUTH_FAILED[action]
}
