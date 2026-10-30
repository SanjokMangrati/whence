import { getCloudflareContext } from '@opennextjs/cloudflare'
import { readWithin } from '@/lib/bounded-body'
import { withClientAddress } from '@/lib/client-address'

const MAX_BODY_BYTES = 64 * 1024

async function proxy(request: Request) {
  const { env } = getCloudflareContext()
  const body = request.body === null ? undefined : await readWithin(request.body, MAX_BODY_BYTES)
  if (body === null) {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }
  const response = await env.API.fetch(request.url, {
    method: request.method,
    headers: withClientAddress(request.headers),
    body,
    redirect: 'manual',
  })
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
