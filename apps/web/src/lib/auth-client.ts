import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128
