import 'server-only'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { hc } from 'hono/client'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { AppType } from 'api/src/index'

const API_ORIGIN = 'https://api.internal'

export async function serverApi() {
  const cookie = (await headers()).get('cookie') ?? ''
  const { env } = getCloudflareContext()
  return hc<AppType>(API_ORIGIN, {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await env.API.fetch(input, init)
      if (response.status === 401) redirect('/login')
      if (response.status >= 500) throw new Error(`The API returned ${response.status}.`)
      return response
    },
    headers: { cookie },
  }).api
}

export const currentUser = cache(async () => {
  const api = await serverApi()
  return (await api.me.$get()).json()
})

export const dueQuestions = cache(async () => {
  const api = await serverApi()
  return (await api.study.due.$get()).json()
})
