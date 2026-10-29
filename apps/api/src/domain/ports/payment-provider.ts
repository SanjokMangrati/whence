import type { PaidPlan } from 'entitlements'

export interface CheckoutRequest {
  userId: string
  email: string
  returnUrl: string
}

export type SubscriptionStatus = 'active' | 'canceled' | 'past_due'

export interface SubscriptionState {
  userId: string
  tier: PaidPlan
  status: SubscriptionStatus
  providerCustomerId: string
  providerSubscriptionId: string
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export interface PaymentEvent {
  providerEventId: string
  type: string
  occurredAt: Date
  subscription: SubscriptionState | null
}

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<{ url: string }>
  setCancelAtPeriodEnd(providerSubscriptionId: string, cancel: boolean): Promise<void>
  createPortalSession(providerCustomerId: string): Promise<{ url: string }>
  parseWebhook(rawBody: string, headers: Headers): PaymentEvent
}
