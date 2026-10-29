import { Webhook } from 'standardwebhooks'

export interface DodoTestEvent {
  type: string
  occurredAt: Date
  status?: string
  userId?: string
  subscriptionId?: string
  productId?: string
  cancelAtNextBillingDate?: boolean
}

export function dodoPayload(event: DodoTestEvent): string {
  const metadata = event.userId === undefined ? {} : { user_id: event.userId }
  return JSON.stringify({
    business_id: 'bus_test',
    type: event.type,
    timestamp: event.occurredAt.toISOString(),
    data: event.type.startsWith('subscription.')
      ? {
          payload_type: 'Subscription',
          subscription_id: event.subscriptionId ?? 'sub_test',
          product_id: event.productId ?? 'pdt_test_pro',
          status: event.status ?? 'active',
          next_billing_date: '2026-10-29T00:00:00Z',
          cancel_at_next_billing_date: event.cancelAtNextBillingDate ?? false,
          customer: { customer_id: 'cus_test', email: 'user@example.test' },
          metadata,
        }
      : { payload_type: 'Payment', payment_id: 'pay_test', metadata },
  })
}

export function signedHeaders(secret: string, eventId: string, body: string): Headers {
  const now = new Date()
  return new Headers({
    'content-type': 'application/json',
    'webhook-id': eventId,
    'webhook-timestamp': String(Math.floor(now.getTime() / 1000)),
    'webhook-signature': new Webhook(secret).sign(eventId, now, body),
  })
}
