import type { Database } from '../db/client'
import { PlanError } from '../domain/errors'
import type { CheckoutRequest, PaymentProvider } from '../domain/ports'
import { putText, webhookPayloadKey } from '../repositories/blobs'
import { findSubscriptionForUser, upsertSubscription } from '../repositories/subscriptions'
import {
  findWebhookEvent,
  insertWebhookEvent,
  markWebhookEventProcessed,
} from '../repositories/webhook-events'

export interface WebhookDeps {
  db: Database
  bucket: R2Bucket
  payments: PaymentProvider
}

export async function startCheckout(
  deps: { db: Database; payments: PaymentProvider },
  input: CheckoutRequest,
) {
  const current = await findSubscriptionForUser(deps.db, input.userId)
  if (current !== undefined && current.status !== 'canceled') {
    throw new PlanError('already_subscribed', 'The account already has a subscription.')
  }
  return deps.payments.createCheckout(input)
}

export async function readSubscription(db: Database, userId: string) {
  const row = await findSubscriptionForUser(db, userId)
  if (row === undefined || row.status === 'canceled') return null
  return {
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  }
}

export async function setCancelAtPeriodEnd(
  deps: { db: Database; payments: PaymentProvider },
  userId: string,
  cancel: boolean,
) {
  const row = await findSubscriptionForUser(deps.db, userId)
  if (row?.status !== 'active' || row.providerSubscriptionId === null) {
    throw new PlanError('no_subscription', 'The account has no active subscription.')
  }
  await deps.payments.setCancelAtPeriodEnd(row.providerSubscriptionId, cancel)
  return { status: row.status, currentPeriodEnd: row.currentPeriodEnd, cancelAtPeriodEnd: cancel }
}

export async function openPaymentPortal(
  deps: { db: Database; payments: PaymentProvider },
  userId: string,
) {
  const row = await findSubscriptionForUser(deps.db, userId)
  if (row === undefined || row.status === 'canceled' || row.providerCustomerId === null) {
    throw new PlanError('no_subscription', 'The account has no subscription.')
  }
  return deps.payments.createPortalSession(row.providerCustomerId)
}

export async function receivePaymentEvent(deps: WebhookDeps, rawBody: string, headers: Headers) {
  const event = deps.payments.parseWebhook(rawBody, headers)
  const payloadR2Key = webhookPayloadKey(event.providerEventId)
  const now = new Date()

  await putText(deps.bucket, payloadR2Key, rawBody)
  await insertWebhookEvent(deps.db, {
    id: crypto.randomUUID(),
    providerEventId: event.providerEventId,
    type: event.type,
    occurredAt: event.occurredAt,
    payloadR2Key,
    createdAt: now,
  })
  const row = await findWebhookEvent(deps.db, event.providerEventId)
  if (row === undefined) {
    throw new Error(`Webhook event ${event.providerEventId} is missing after its insert.`)
  }
  if (row.processedAt !== null) return

  if (event.subscription !== null) {
    await upsertSubscription(deps.db, {
      id: crypto.randomUUID(),
      ...event.subscription,
      lastEventAt: event.occurredAt,
      updatedAt: now,
    })
  }
  await markWebhookEventProcessed(deps.db, row.id, now)
}
