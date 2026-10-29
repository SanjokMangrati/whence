import { describe, expect, it } from 'vitest'
import { DomainError } from '../../domain/errors'
import { stubFetch } from '../../test/fetch'
import { createAnthropicGenerator } from './generator'

const CONFIG = {
  apiKey: 'test-key',
  modelId: 'claude-haiku-4-5',
  inputUsdPerMTok: 1,
  outputUsdPerMTok: 5,
}

function stubStream(
  text: string,
  stopReason: string,
  usage: Record<string, number> = { input_tokens: 20_000, output_tokens: 0 },
) {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5',
        content: [],
        stop_reason: null,
        usage,
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason },
      usage: { output_tokens: 10_000 },
    },
    { type: 'message_stop' },
  ]
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')
  return stubFetch(() => new Response(body, { headers: { 'content-type': 'text/event-stream' } }))
}

interface MessagesRequest {
  model: string
  stream: boolean
  max_tokens: number
  system: string
  messages: { role: string; content: unknown }[]
}

async function sent(requests: Request[]): Promise<MessagesRequest> {
  expect(requests).toHaveLength(1)
  return requests[0]!.json()
}

describe('anthropic generator', () => {
  it('returns text, the model that answered, and the call cost', async () => {
    const requests = stubStream('concept one', 'end_turn')

    const result = await createAnthropicGenerator(CONFIG).generate({
      system: 'Extract concepts.',
      prompt: 'transcript',
      maxOutputTokens: 4096,
    })

    expect(requests[0]!.url).toBe('https://api.anthropic.com/v1/messages')
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer test-key')
    expect(await sent(requests)).toMatchObject({
      model: 'claude-haiku-4-5',
      system: 'Extract concepts.',
      messages: [{ role: 'user', content: 'transcript' }],
    })
    expect(result.text).toBe('concept one')
    expect(result.modelId).toBe('claude-haiku-4-5')
    expect(result.usage.costUsd).toBeCloseTo(0.07, 10)
  })

  it('marks the shared prefix for the cache and prices cache tokens', async () => {
    const requests = stubStream('notes', 'end_turn', {
      input_tokens: 1_000,
      cache_creation_input_tokens: 8_000,
      cache_read_input_tokens: 40_000,
      output_tokens: 0,
    })

    const result = await createAnthropicGenerator(CONFIG).generate({
      system: 's',
      sharedPrefix: 'source',
      prompt: 'instructions',
      maxOutputTokens: 4096,
    })

    expect((await sent(requests)).messages[0]!.content).toEqual([
      { type: 'text', text: 'source', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'instructions' },
    ])
    expect(result.usage.inputTokens).toBe(49_000)
    expect(result.usage.costUsd).toBeCloseTo(0.065, 10)
  })

  it('accepts an output bound above what the SDK allows without streaming', async () => {
    const requests = stubStream('notes', 'end_turn')

    await createAnthropicGenerator(CONFIG).generate({
      system: 's',
      prompt: 'p',
      maxOutputTokens: 64_000,
    })

    expect(await sent(requests)).toMatchObject({ stream: true, max_tokens: 64_000 })
  })

  it('fails when the model hits the output limit', async () => {
    stubStream('cut', 'max_tokens')

    await expect(
      createAnthropicGenerator(CONFIG).generate({ system: 's', prompt: 'p', maxOutputTokens: 16 }),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('fails when the model refuses after writing some text', async () => {
    stubStream('partial', 'refusal')

    await expect(
      createAnthropicGenerator(CONFIG).generate({ system: 's', prompt: 'p', maxOutputTokens: 16 }),
    ).rejects.toThrow('The model refused the request.')
  })
})
