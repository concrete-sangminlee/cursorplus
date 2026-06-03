import { describe, expect, it } from 'vitest'
import { demoSubscriptionAccount } from '@/data/saasOperatingSystem'
import {
  createCheckoutSessionIntent,
  createLicenseSnapshot,
  getBillingProviderStatus,
} from './billingGateway'

describe('billing gateway utilities', () => {
  it('falls back to manual checkout when hosted checkout is not configured', () => {
    const status = getBillingProviderStatus()
    const intent = createCheckoutSessionIntent(demoSubscriptionAccount)

    expect(status.provider).toBe('manual')
    expect(status.liveReady).toBe(false)
    expect(intent.ready).toBe(false)
    expect(intent.url).toBeNull()
    expect(intent.warnings[0]).toContain('Hosted checkout URL is not configured')
  })

  it('builds a hosted checkout intent with account and plan metadata', () => {
    const intent = createCheckoutSessionIntent(
      demoSubscriptionAccount,
      'https://orion-ide.dev',
      { VITE_ORION_CHECKOUT_URL: '/checkout/session' },
    )
    const url = new URL(intent.url!)

    expect(intent.ready).toBe(true)
    expect(intent.provider).toBe('stripe')
    expect(intent.amountMonthly).toBe(312)
    expect(url.origin).toBe('https://orion-ide.dev')
    expect(url.pathname).toBe('/checkout/session')
    expect(url.searchParams.get('plan')).toBe('team')
    expect(url.searchParams.get('seats')).toBe('8')
    expect(url.searchParams.get('success_url')).toBe('https://orion-ide.dev/?billing=success')
  })

  it('only marks live billing ready when checkout, webhook, and license signing are configured', () => {
    expect(getBillingProviderStatus({
      VITE_ORION_CHECKOUT_URL: 'https://billing.example/checkout',
      VITE_ORION_BILLING_MODE: 'live',
      VITE_ORION_WEBHOOK_CONFIGURED: 'true',
      VITE_ORION_LICENSE_SIGNING_KEY_CONFIGURED: 'true',
    }).liveReady).toBe(true)

    const incomplete = getBillingProviderStatus({
      VITE_ORION_CHECKOUT_URL: 'https://billing.example/checkout',
      VITE_ORION_BILLING_MODE: 'live',
    })

    expect(incomplete.liveReady).toBe(false)
    expect(incomplete.warnings).toHaveLength(2)
  })

  it('creates a license snapshot with trial expiry and entitlement fingerprint', () => {
    const snapshot = createLicenseSnapshot(
      demoSubscriptionAccount,
      new Date('2026-06-03T00:00:00.000Z'),
    )

    expect(snapshot.accountName).toBe('Northstar Labs')
    expect(snapshot.planId).toBe('team')
    expect(snapshot.expiresAt).toBe('2026-06-17T00:00:00.000Z')
    expect(snapshot.syncRequired).toBe(true)
    expect(snapshot.signatureRequired).toBe(true)
    expect(snapshot.entitlements.providerSlots).toBe(8)
    expect(snapshot.fingerprint).toContain('Northstar Labs|ops@northstar.example|team')
  })
})
