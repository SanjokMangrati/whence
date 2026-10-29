import { normalizeSourceUrl, type NormalizedSource } from '../../domain/source-url'
import { assertPublicHost } from '../../providers/dns/public-address'

export async function validateSource(requestedUrl: string): Promise<NormalizedSource> {
  const normalized = normalizeSourceUrl(requestedUrl)
  await assertPublicHost(new URL(normalized.url).hostname)
  return normalized
}
