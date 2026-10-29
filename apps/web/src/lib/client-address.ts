export const CLIENT_ADDRESS_HEADER = 'x-client-ip'

export function withClientAddress(incoming: Headers): Headers {
  const headers = new Headers(incoming)
  const address = incoming.get('cf-connecting-ip')
  if (address === null) headers.delete(CLIENT_ADDRESS_HEADER)
  else headers.set(CLIENT_ADDRESS_HEADER, address)
  return headers
}
