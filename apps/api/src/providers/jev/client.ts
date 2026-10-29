import type { TokenUsage } from '../../domain/types'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const MODEL = 'jev-latest'
const INPUT_USD_PER_MTOK = 0.042

const RETRY_DELAYS_MS = [500, 2000]

export interface JevConfig {
  apiKey: string
}

export interface NoulQuestion {
  type: 'noul'
  instructions: string
  criteria?: { true: string; false: string }
}

interface NoulAnswer {
  type: 'noul'
  noul: number
}

interface SystemOneResponse {
  model: string
  answers: Record<string, NoulAnswer>
  usage: { input_tokens: number; output_tokens: number }
}

export interface NoulResult {
  probabilities: Record<string, number>
  usage: TokenUsage
}

export class JevRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'JevRequestError'
  }
}

function isTransient(status: number) {
  return status === 429 || status >= 500
}

async function post(config: JevConfig, body: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body,
    })
    const delay = RETRY_DELAYS_MS[attempt]
    if (response.ok || !isTransient(response.status) || delay === undefined) {
      return response
    }
    await response.body?.cancel()
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

export async function askNoul(
  config: JevConfig,
  state: unknown,
  questions: Record<string, NoulQuestion>,
): Promise<NoulResult> {
  const response = await post(config, JSON.stringify({ state, model: MODEL, questions }))

  if (!response.ok) {
    throw new JevRequestError(response.status, await response.text())
  }

  const body = (await response.json()) as SystemOneResponse
  const probabilities: Record<string, number> = {}
  for (const key of Object.keys(questions)) {
    const answer = body.answers[key]
    if (answer === undefined) {
      throw new JevRequestError(response.status, `Jev did not answer ${key}.`)
    }
    probabilities[key] = answer.noul
  }

  return {
    probabilities,
    usage: {
      inputTokens: body.usage.input_tokens,
      outputTokens: body.usage.output_tokens,
      costUsd: (body.usage.input_tokens * INPUT_USD_PER_MTOK) / 1_000_000,
    },
  }
}
