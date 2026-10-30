import { getCloudflareContext } from '@opennextjs/cloudflare'
import { withClientAddress } from '@/lib/client-address'

const MAX_BODY_BYTES = 64 * 1024

async function proxy(request: Request) {
  const { env } = getCloudflareContext()
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  if (hasBody && bodyTooLarge(request)) {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }
  const response = await env.API.fetch(request.url, {
    method: request.method,
    headers: withClientAddress(request.headers),
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
  })
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  })
}

function bodyTooLarge(request: Request) {
  const length = request.headers.get('content-length')
  if (length === null) return request.body !== null
  return Number(length) > MAX_BODY_BYTES
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
