import { vi } from 'vitest'

export function stubFetch(handler: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    requests.push(request.clone())
    return handler(request)
  })
  return requests
}
