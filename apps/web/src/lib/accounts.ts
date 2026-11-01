export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export const EMAIL_ACCOUNTS = TURNSTILE_SITE_KEY === undefined

export const EMAIL_ONLY_PATHS = ['/signup', '/forgot-password', '/reset-password', '/verify-email']
