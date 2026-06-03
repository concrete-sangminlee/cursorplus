import { describe, expect, it } from 'vitest'
import { demoSubscriptionAccount } from '@/data/saasOperatingSystem'
import {
  calculateAccountMrr,
  changeAccountPlan,
  createDefaultSubscriptionAccount,
  evaluateEntitlements,
  getSubscriptionHealth,
  getUpgradeRecommendations,
  updateSubscriptionUsage,
} from './entitlements'

describe('entitlements', () => {
  it('creates a default trial account with deterministic dates when a clock is supplied', () => {
    const account = createDefaultSubscriptionAccount(new Date('2026-06-03T00:00:00.000Z'))

    expect(account.status).toBe('trialing')
    expect(account.planId).toBe('team')
    expect(account.trialEndsAt).toBe('2026-06-17T00:00:00.000Z')
    expect(account.renewalDate).toBe('2026-07-03T00:00:00.000Z')
  })

  it('calculates per-seat and flat account MRR', () => {
    expect(calculateAccountMrr(demoSubscriptionAccount)).toBe(312)

    const enterprise = changeAccountPlan(demoSubscriptionAccount, 'enterprise', new Date('2026-06-03T00:00:00.000Z'))
    expect(calculateAccountMrr(enterprise)).toBe(249)
  })

  it('evaluates entitlement usage and locked higher-plan features', () => {
    const evaluations = evaluateEntitlements(demoSubscriptionAccount)
    const providerSlots = evaluations.find((item) => item.id === 'provider-slots')
    const sso = evaluations.find((item) => item.id === 'sso')

    expect(providerSlots?.state).toBe('available')
    expect(providerSlots?.percentUsed).toBe(75)
    expect(sso?.state).toBe('blocked')
    expect(sso?.upgradePlanId).toBe('enterprise')
  })

  it('keeps subscription health on watch for trials even when enterprise-only features are locked', () => {
    const health = getSubscriptionHealth(demoSubscriptionAccount)

    expect(health.health).toBe('watch')
    expect(health.label).toBe('Trialing')
  })

  it('blocks health when numeric usage exceeds the current plan', () => {
    const overLimit = updateSubscriptionUsage(
      demoSubscriptionAccount,
      { aiSpendUsd: 400 },
      new Date('2026-06-03T00:00:00.000Z'),
    )
    const health = getSubscriptionHealth(overLimit)

    expect(health.health).toBe('blocked')
    expect(getUpgradeRecommendations(overLimit).some((item) => item.id === 'ai-budget')).toBe(true)
  })
})
