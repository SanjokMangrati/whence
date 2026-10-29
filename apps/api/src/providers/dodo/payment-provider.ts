import DodoPayments from 'dodopayments'
import type {
  Subscription,
  SubscriptionStatus as DodoStatus,
} from 'dodopayments/resources/subscriptions'
import type { UnwrapWebhookEvent } from 'dodopayments/resources/webhooks'
import { InvalidWebhookError } from '../../domain/errors'
import type {
  CheckoutRequest,
  PaymentEvent,
  PaymentProvider,
  SubscriptionState,
  SubscriptionStatus,
} from '../../domain/ports'

export interface DodoConfig {
  apiKey: string
  webhookKey: string
  environment: 'test_mode' | 'live_mode'
  proProductId: string
}

const STATUS: Record<DodoStatus, SubscriptionStatus | null> = {
  pending: null,
  active: 'active',
  past_due: 'past_due',
  on_hold: 'past_due',
  paused: 'canceled',
  cancelled: 'canceled',
  expired: 'canceled',
  failed: 'canceled',
}

type SubscriptionEvent = Extract<UnwrapWebhookEvent, { type: `subscription.${string}` }>

export function createDodoPaymentProvider(config: DodoConfig): PaymentProvider {
  const client = new DodoPayments({
    bearerToken: config.apiKey,
    webhookKey: config.webhookKey,
    environment: config.environment,
  })

  return {
    async createCheckout(request: CheckoutRequest) {
      const session = await client.checkoutSessions.create({
        product_cart: [{ product_id: config.proProductId, quantity: 1 }],
        customer: { email: request.email },
        return_url: request.returnUrl,
        metadata: { user_id: request.userId },
      })
      if (!session.checkout_url) {
        throw new Error(`Checkout session ${session.session_id} has no checkout URL.`)
      }
      return { url: session.checkout_url }
    },

    async setCancelAtPeriodEnd(providerSubscriptionId: string, cancel: boolean) {
      await client.subscriptions.update(providerSubscriptionId, {
        cancel_at_next_billing_date: cancel,
      })
    },

    async createPortalSession(providerCustomerId: string) {
      const { link } = await client.customers.customerPortal.create(providerCustomerId)
      return { url: link }
    },

    parseWebhook(rawBody: string, headers: Headers): PaymentEvent {
      const eventId = headers.get('webhook-id') ?? ''
      let event: UnwrapWebhookEvent
      try {
        event = client.webhooks.unwrap(rawBody, {
          headers: {
            'webhook-id': eventId,
            'webhook-timestamp': headers.get('webhook-timestamp') ?? '',
            'webhook-signature': headers.get('webhook-signature') ?? '',
          },
        })
      } catch (error) {
        throw new InvalidWebhookError(error instanceof Error ? error.message : String(error))
      }

      return {
        providerEventId: eventId,
        type: event.type,
        occurredAt: new Date(event.timestamp),
        subscription: isSubscriptionEvent(event)
          ? toSubscriptionState(event.data, config.proProductId)
          : null,
      }
    },
  }
}

function isSubscriptionEvent(event: UnwrapWebhookEvent): event is SubscriptionEvent {
  return event.type.startsWith('subscription.')
}

function toSubscriptionState(data: Subscription, proProductId: string): SubscriptionState | null {
  const status = STATUS[data.status]
  if (status === undefined) {
    throw new Error(`Subscription ${data.subscription_id} has the unknown status ${data.status}.`)
  }
  if (status === null) return null

  if (data.product_id !== proProductId) {
    throw new Error(
      `Subscription ${data.subscription_id} is for the unknown product ${data.product_id}.`,
    )
  }
  const userId = data.metadata.user_id
  if (typeof userId !== 'string') {
    throw new Error(`Subscription ${data.subscription_id} names no user.`)
  }

  return {
    userId,
    tier: 'pro',
    status,
    providerCustomerId: data.customer.customer_id,
    providerSubscriptionId: data.subscription_id,
    currentPeriodEnd: new Date(data.next_billing_date),
    cancelAtPeriodEnd: data.cancel_at_next_billing_date,
  }
}
