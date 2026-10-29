import type { Database } from '../db/client'
import { DomainError } from '../domain/errors'
import {
  deleteProviderKeyForUser,
  findProviderKeyForJob,
  findProviderKeyHintForUser,
  saveProviderKey,
} from '../repositories/provider-keys'

const IV_BYTES = 12

export async function storeProviderKey(
  db: Database,
  secret: string,
  userId: string,
  apiKey: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encode(userId) },
    await importSecret(secret),
    encode(apiKey),
  )
  await saveProviderKey(db, {
    userId,
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
    last4: apiKey.slice(-4),
    createdAt: new Date(),
  })
  return { set: true, last4: apiKey.slice(-4) }
}

export async function providerKeyStatus(db: Database, userId: string) {
  const hint = await findProviderKeyHintForUser(db, userId)
  return { set: hint !== undefined, last4: hint?.last4 ?? null }
}

export async function removeProviderKey(db: Database, userId: string) {
  await deleteProviderKeyForUser(db, userId)
}

export async function providerKeyForJob(db: Database, secret: string, jobId: string) {
  const row = await findProviderKeyForJob(db, jobId)
  if (row === undefined) {
    throw new DomainError('provider_key_required', 'The job owner has no Anthropic key.')
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(row.iv), additionalData: encode(row.userId) },
    await importSecret(secret),
    fromBase64(row.ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

function importSecret(secret: string) {
  return crypto.subtle.importKey('raw', fromBase64(secret), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

function encode(text: string) {
  return new TextEncoder().encode(text)
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}
