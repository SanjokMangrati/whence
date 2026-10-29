import { describe, expect, it, vi } from 'vitest'
import { stubFetch } from '../../test/fetch'
import { createJevClaimVerifier } from './claim-verifier'

const verifier = createJevClaimVerifier({ apiKey: 'test-key' })

interface SentRequest {
  state: { evidence: string[] }
  model: string
  questions: Record<string, { instructions: string }>
}

function systemOneAnswer(noul: number, inputTokens = 296) {
  return Response.json({
    model: 'jev-1.13.0',
    answers: { supported: { type: 'noul', noul } },
    usage: { input_tokens: inputTokens, output_tokens: 20 },
  })
}

function answer(noul: number, inputTokens?: number) {
  return stubFetch(() => systemOneAnswer(noul, inputTokens))
}

async function sent(requests: Request[]): Promise<SentRequest> {
  expect(requests).toHaveLength(1)
  return requests[0]!.json()
}

const CLAIM = { claim: 'The interval grows after each pass.', evidence: ['The interval grows.'] }

describe('jev claim verifier', () => {
  it('sends only the claim evidence as state to the system one endpoint', async () => {
    const requests = answer(0.97)

    await verifier.verify(CLAIM)

    expect(requests[0]!.url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer test-key')
    const body = await sent(requests)
    expect(body.state).toEqual({ evidence: ['The interval grows.'] })
    expect(body.model).toBe('jev-latest')
    expect(Object.keys(body.questions)).toEqual(['supported'])
    expect(body.questions.supported!.instructions).toContain(CLAIM.claim)
  })

  it('asks about the answer and its question together', async () => {
    const requests = answer(0.97)

    await verifier.verify({ ...CLAIM, question: 'What happens to the interval?' })

    const { instructions } = (await sent(requests)).questions.supported!
    expect(instructions).toContain('Question: What happens to the interval?')
    expect(instructions).toContain(`Answer: ${CLAIM.claim}`)
  })

  it('sends the subject in the question, not in the evidence', async () => {
    const requests = answer(0.97)

    await verifier.verify({ ...CLAIM, subject: 'Review timing. Spacing improves recall.' })

    const body = await sent(requests)
    expect(body.state).toEqual({ evidence: ['The interval grows.'] })
    expect(body.questions.supported!.instructions).toContain(
      'Context: Review timing. Spacing improves recall.',
    )
    expect(body.questions.supported!.instructions).toContain(`Statement: ${CLAIM.claim}`)
  })

  it('maps the probability to a verdict at the adapter threshold', async () => {
    const cases: [number, string][] = [
      [0.97, 'supported'],
      [0.75, 'supported'],
      [0.74, 'uncertain'],
      [0.51, 'uncertain'],
      [0.5, 'unsupported'],
      [0.02, 'unsupported'],
    ]

    for (const [noul, verdict] of cases) {
      answer(noul)
      const result = await verifier.verify(CLAIM)
      expect(result.verdict).toBe(verdict)
      expect(result.probability).toBe(noul)
    }
  })

  it('prices the call from the published input rate', async () => {
    answer(0.97, 1_000_000)

    const result = await verifier.verify(CLAIM)

    expect(result.usage.costUsd).toBeCloseTo(0.042, 10)
    expect(result.usage.outputTokens).toBe(20)
  })

  it('reports a rejected request as a request failure, not an unsupported claim', async () => {
    vi.useFakeTimers()
    const requests = stubFetch(() => new Response('overloaded', { status: 529 }))

    const result = verifier.verify(CLAIM)
    const failed = expect(result).rejects.toMatchObject({ code: 'verifier_request_failed' })
    await vi.runAllTimersAsync()
    await failed
    expect(requests).toHaveLength(3)
    vi.useRealTimers()
  })

  it('retries a gateway error and keeps the later answer', async () => {
    vi.useFakeTimers()
    const responses = [new Response('error code: 502', { status: 502 }), systemOneAnswer(0.97)]
    const requests = stubFetch(() => responses.shift()!)

    const result = verifier.verify(CLAIM)
    await vi.runAllTimersAsync()

    await expect(result).resolves.toMatchObject({ verdict: 'supported' })
    expect(requests).toHaveLength(2)
    vi.useRealTimers()
  })

  it('does not retry a refused key', async () => {
    const requests = stubFetch(() => new Response('bad key', { status: 401 }))

    await expect(verifier.verify(CLAIM)).rejects.toMatchObject({
      code: 'verifier_request_failed',
    })
    expect(requests).toHaveLength(1)
  })

  it('fails when Jev leaves the question unanswered', async () => {
    stubFetch(() =>
      Response.json({
        model: 'jev-1.13.0',
        answers: {},
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
    )

    await expect(verifier.verify(CLAIM)).rejects.toMatchObject({
      code: 'verifier_request_failed',
      message: 'Jev did not answer supported.',
    })
  })
})
