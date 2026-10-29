import { getCloudflareContext } from '@opennextjs/cloudflare'
import { withClientAddress } from '@/lib/client-address'

async function proxy(request: Request) {
  const { env } = getCloudflareContext()
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
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

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
