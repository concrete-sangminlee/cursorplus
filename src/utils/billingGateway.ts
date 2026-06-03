import type { PlanEntitlements, SubscriptionAccount } from '@/data/saasOperatingSystem'
import { calculateAccountMrr, getPlanEntitlements, getPricingPlan } from '@/utils/entitlements'

export type BillingProvider = 'manual' | 'stripe'
export type BillingMode = 'test' | 'live'

export interface BillingProviderEnv {
  VITE_ORION_CHECKOUT_URL?: string
  VITE_ORION_BILLING_MODE?: string
  VITE_ORION_WEBHOOK_CONFIGURED?: string
  VITE_ORION_LICENSE_SIGNING_KEY_CONFIGURED?: string
}

export interface BillingProviderStatus {
  provider: BillingProvider
  mode: BillingMode
  checkoutBaseUrl: string | null
  webhookConfigured: boolean
  licenseSigningKeyConfigured: boolean
  liveReady: boolean
  warnings: string[]
}

export interface CheckoutSessionIntent {
  provider: BillingProvider
  mode: BillingMode
  ready: boolean
  url: string | null
  amountMonthly: number
  planName: string
  seats: number
  warnings: string[]
}

export interface LicenseSnapshot {
  accountName: string
  planId: SubscriptionAccount['planId']
  status: SubscriptionAccount['status']
  seats: number
  entitlements: PlanEntitlements
  issuedAt: string
  expiresAt: string
  signatureRequired: boolean
  syncRequired: boolean
  fingerprint: string
}

function isTrue(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes'
}

export function getBillingProviderStatus(env: BillingProviderEnv = {}): BillingProviderStatus {
  const checkoutBaseUrl = env.VITE_ORION_CHECKOUT_URL?.trim() || null
  const mode: BillingMode = env.VITE_ORION_BILLING_MODE === 'live' ? 'live' : 'test'
  const provider: BillingProvider = checkoutBaseUrl ? 'stripe' : 'manual'
  const webhookConfigured = isTrue(env.VITE_ORION_WEBHOOK_CONFIGURED)
  const licenseSigningKeyConfigured = isTrue(env.VITE_ORION_LICENSE_SIGNING_KEY_CONFIGURED)
  const warnings: string[] = []

  if (!checkoutBaseUrl) {
    warnings.push('Hosted checkout URL is not configured; record founder-led checkout intent instead.')
  }

  if (mode === 'live' && !webhookConfigured) {
    warnings.push('Live billing needs webhook verification before payment state can sync.')
  }

  if (mode === 'live' && !licenseSigningKeyConfigured) {
    warnings.push('Live billing needs a license-signing key before paid entitlements can be trusted.')
  }

  return {
    provider,
    mode,
    checkoutBaseUrl,
    webhookConfigured,
    licenseSigningKeyConfigured,
    liveReady: provider !== 'manual' && mode === 'live' && webhookConfigured && licenseSigningKeyConfigured,
    warnings,
  }
}

export function createCheckoutSessionIntent(
  account: SubscriptionAccount,
  origin = 'http://localhost:5174',
  env: BillingProviderEnv = {},
): CheckoutSessionIntent {
  const status = getBillingProviderStatus(env)
  const plan = getPricingPlan(account.planId)
  const amountMonthly = calculateAccountMrr(account)
  let url: string | null = null

  if (status.checkoutBaseUrl) {
    const checkoutUrl = new URL(status.checkoutBaseUrl, origin)
    checkoutUrl.searchParams.set('company', account.companyName)
    checkoutUrl.searchParams.set('email', account.billingEmail)
    checkoutUrl.searchParams.set('plan', account.planId)
    checkoutUrl.searchParams.set('seats', String(account.seats))
    checkoutUrl.searchParams.set('amount_monthly', String(amountMonthly))
    checkoutUrl.searchParams.set('success_url', new URL('/?billing=success', origin).toString())
    checkoutUrl.searchParams.set('cancel_url', new URL('/?billing=cancelled', origin).toString())
    url = checkoutUrl.toString()
  }

  return {
    provider: status.provider,
    mode: status.mode,
    ready: status.provider !== 'manual',
    url,
    amountMonthly,
    planName: plan.name,
    seats: account.seats,
    warnings: status.warnings,
  }
}

export function createLicenseSnapshot(
  account: SubscriptionAccount,
  now = new Date(),
  env: BillingProviderEnv = {},
): LicenseSnapshot {
  const status = getBillingProviderStatus(env)
  const entitlements = getPlanEntitlements(account.planId)
  const issuedAt = now.toISOString()
  const expiresAt = account.status === 'trialing' ? account.trialEndsAt : account.renewalDate
  const fingerprint = [
    account.companyName,
    account.billingEmail,
    account.planId,
    account.status,
    account.seats,
    expiresAt,
  ].join('|')

  return {
    accountName: account.companyName,
    planId: account.planId,
    status: account.status,
    seats: account.seats,
    entitlements,
    issuedAt,
    expiresAt,
    signatureRequired: !status.licenseSigningKeyConfigured,
    syncRequired: account.status === 'trialing' || account.status === 'past_due' || account.status === 'expired',
    fingerprint,
  }
}
