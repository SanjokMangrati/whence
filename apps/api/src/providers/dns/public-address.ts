import { DomainError } from '../../domain/errors'
import { isIpLiteral, isPrivateAddress } from '../../domain/ip-address'

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query'

const A = 1
const AAAA = 28

const MAX_REDIRECTS = 5

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

interface DohAnswer {
  type: number
  data: string
}

interface DohResponse {
  Answer?: DohAnswer[]
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const addresses = isIpLiteral(hostname) ? [stripBrackets(hostname)] : await resolve(hostname)

  if (addresses.length === 0) {
    throw new DomainError('private_address', `${hostname} does not resolve.`)
  }
  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      throw new DomainError('private_address', `${hostname} resolves to a private address.`)
    }
  }
}

export async function fetchPublicUrl(url: string, signal: AbortSignal): Promise<Response> {
  let current = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new DomainError('private_address', `A redirect reached ${parsed.protocol}.`)
    }
    await assertPublicHost(parsed.hostname)

    const response = await fetch(current, { redirect: 'manual', signal })
    if (!REDIRECT_STATUS.has(response.status)) {
      return response
    }

    const location = response.headers.get('location')
    if (location === null) {
      throw new DomainError('extraction_failed', `${current} redirected without a location.`)
    }
    current = new URL(location, current).toString()
  }

  throw new DomainError('extraction_failed', `${url} exceeded ${MAX_REDIRECTS} redirects.`)
}

async function resolve(hostname: string): Promise<string[]> {
  const responses = await Promise.all(
    ['A', 'AAAA'].map((type) =>
      fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
      }),
    ),
  )

  const addresses: string[] = []
  for (const response of responses) {
    if (!response.ok) {
      throw new DomainError('private_address', `The address of ${hostname} could not be checked.`)
    }
    const body = (await response.json()) as DohResponse
    for (const answer of body.Answer ?? []) {
      if (answer.type === A || answer.type === AAAA) {
        addresses.push(answer.data)
      }
    }
  }
  return addresses
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname
}
