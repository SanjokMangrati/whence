import type { Database } from '../db/client'
import type { Generator } from '../domain/ports'
import { createAnthropicGenerator } from '../providers/anthropic/generator'
import { providerKeyForJob } from '../services/provider-keys'

export async function generatorForJob(env: Env, db: Database, jobId: string): Promise<Generator> {
  return createAnthropicGenerator({
    apiKey:
      env.ANTHROPIC_API_KEY ?? (await providerKeyForJob(db, env.KEY_ENCRYPTION_SECRET, jobId)),
    modelId: env.GENERATOR_MODEL_ID,
    inputUsdPerMTok: env.GENERATOR_INPUT_USD_PER_MTOK,
    outputUsdPerMTok: env.GENERATOR_OUTPUT_USD_PER_MTOK,
  })
}
