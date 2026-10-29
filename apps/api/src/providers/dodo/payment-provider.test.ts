import { describe, expect, it } from 'vitest'
import { InvalidWebhookError } from '../../domain/errors'
import { dodoPayload, signedHeaders, type DodoTestEvent } from '../../test/dodo'
import { stubFetch } from '../../test/fetch'
import { createDodoPaymentProvider } from './payment-provider'

const SECRET = 'whsec_dGVzdC1vbmx5LWRvZG8td2ViaG9vay1zZWNyZXQh'
const OCCURRED_AT = new Date('2026-09-29T10:00:00Z')

function createProvider() {
  return createDodoPaymentProvider({
    apiKey: 'test-key',
    webhookKey: SECRET,
    environment: 'test_mode',
    proProductId: 'pdt_test_pro',
  })
}

const provider = createProvider()

function answer(response: () => Response) {
  return { requests: stubFetch(response), provider: createProvider() }
}

function parse(event: Partial<DodoTestEvent>) {
  const body = dodoPayload({ type: 'subscription.active', occurredAt: OCCURRED_AT, ...event })
  return provider.parseWebhook(body, signedHeaders(SECRET, 'msg_1', body))
}

describe('dodo payment provider', () => {
  it('sends the Pro product and the user id to a test mode checkout session', async () => {
    const { requests, provider } = answer(() =>
      Response.json({ session_id: 'cks_1', checkout_url: 'https://checkout.test/cks_1' }),
    )

    const checkout = await provider.createCheckout({
      userId: 'user-1',
      email: 'user@example.test',
      returnUrl: 'https://app.test/',
    })

    expect(checkout).toEqual({ url: 'https://checkout.test/cks_1' })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.method).toBe('POST')
    expect(requests[0]!.url).toBe('https://test.dodopayments.com/checkouts')
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer test-key')
    expect(await requests[0]!.json()).toEqual({
      product_cart: [{ product_id: 'pdt_test_pro', quantity: 1 }],
      customer: { email: 'user@example.test' },
      return_url: 'https://app.test/',
      metadata: { user_id: 'user-1' },
    })
  })

  it('fails when the checkout session has no URL', async () => {
    const { provider } = answer(() => Response.json({ session_id: 'cks_1', checkout_url: null }))

    await expect(
      provider.createCheckout({
        userId: 'user-1',
        email: 'u@example.test',
        returnUrl: 'https://app.test/',
      }),
    ).rejects.toThrow('Checkout session cks_1 has no checkout URL.')
  })

  it('sends a scheduled cancellation for the subscription', async () => {
    const { requests, provider } = answer(() => Response.json({ subscription_id: 'sub_1' }))

    await provider.setCancelAtPeriodEnd('sub_1', true)

    expect(requests[0]!.method).toBe('PATCH')
    expect(requests[0]!.url).toBe('https://test.dodopayments.com/subscriptions/sub_1')
    expect(await requests[0]!.json()).toEqual({ cancel_at_next_billing_date: true })
  })

  it('fails loudly when the provider refuses a change', async () => {
    const { provider } = answer(() =>
      Response.json({ message: 'Invalid subscription' }, { status: 422 }),
    )

    await expect(provider.setCancelAtPeriodEnd('sub_1', false)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('returns the portal link for the customer', async () => {
    const { requests, provider } = answer(() =>
      Response.json({ link: 'https://portal.test/cus_1' }),
    )

    expect(await provider.createPortalSession('cus_1')).toEqual({
      url: 'https://portal.test/cus_1',
    })
    expect(requests[0]!.method).toBe('POST')
    expect(requests[0]!.url).toBe(
      'https://test.dodopayments.com/customers/cus_1/customer-portal/session',
    )
  })

  it('reads a scheduled cancellation from an event', () => {
    const state = parse({ userId: 'user-1', cancelAtNextBillingDate: true }).subscription
    expect(state).toMatchObject({ status: 'active', cancelAtPeriodEnd: true })
  })

  it('reads the whole subscription state from a signed event', () => {
    expect(parse({ userId: 'user-1' })).toEqual({
      providerEventId: 'msg_1',
      type: 'subscription.active',
      occurredAt: OCCURRED_AT,
      subscription: {
        userId: 'user-1',
        tier: 'pro',
        status: 'active',
        providerCustomerId: 'cus_test',
        providerSubscriptionId: 'sub_test',
        currentPeriodEnd: new Date('2026-10-29T00:00:00Z'),
        cancelAtPeriodEnd: false,
      },
    })
  })

  it('maps each provider status to a subscription status', () => {
    const statusOf = (status: string) => parse({ userId: 'user-1', status }).subscription?.status
    expect(statusOf('past_due')).toBe('past_due')
    expect(statusOf('on_hold')).toBe('past_due')
    expect(statusOf('paused')).toBe('canceled')
    expect(statusOf('cancelled')).toBe('canceled')
    expect(statusOf('expired')).toBe('canceled')
    expect(statusOf('failed')).toBe('canceled')
    expect(parse({ userId: 'user-1', status: 'pending' }).subscription).toBeNull()
  })

  it('reads no subscription from a payment event', () => {
    expect(parse({ type: 'payment.succeeded', userId: 'user-1' }).subscription).toBeNull()
  })

  it('refuses a body that does not match its signature', () => {
    const body = dodoPayload({ type: 'subscription.active', occurredAt: OCCURRED_AT })
    const headers = signedHeaders(SECRET, 'msg_1', body)
    expect(() => provider.parseWebhook(body.replace('active', 'expired'), headers)).toThrow(
      InvalidWebhookError,
    )
  })

  it('refuses an event signed with another secret', () => {
    const body = dodoPayload({ type: 'subscription.active', occurredAt: OCCURRED_AT })
    const headers = signedHeaders('whsec_b3RoZXItc2VjcmV0LXZhbHVlLWZvci10ZXN0cw==', 'msg_1', body)
    expect(() => provider.parseWebhook(body, headers)).toThrow(InvalidWebhookError)
  })

  it('refuses an event with no signature', () => {
    const body = dodoPayload({ type: 'subscription.active', occurredAt: OCCURRED_AT })
    expect(() => provider.parseWebhook(body, new Headers())).toThrow(InvalidWebhookError)
  })

  it('fails loudly on a subscription with no user or another product', () => {
    expect(() => parse({})).toThrow('names no user')
    expect(() => parse({ userId: 'user-1', productId: 'pdt_other' })).toThrow('unknown product')
    expect(() => parse({ userId: 'user-1', status: 'trialing' })).toThrow('unknown status')
  })
})
