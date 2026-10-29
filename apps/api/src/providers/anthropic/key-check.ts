import Anthropic from '@anthropic-ai/sdk'

export async function anthropicKeyWorks(apiKey: string): Promise<boolean> {
  try {
    await new Anthropic({ apiKey }).models.list({ limit: 1 })
    return true
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return false
    throw error
  }
}
