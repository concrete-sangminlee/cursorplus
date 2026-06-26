/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSubscriptionStore, type BillingEvent } from './subscription'
import type { SubscriptionAccount } from '@/data/saasOperatingSystem'
import { planEntitlements, pricingPlans } from '@/data/saasOperatingSystem'
import type { CheckoutSessionIntent } from '@/utils/billingGateway'

/**
 * Tests for the subscription Zustand store (module-level singleton).
 *
 * The store manually persists `{ account, events }` to localStorage under
 * STORAGE_KEY = 'orion:subscription-state' (no zustand persist middleware).
 * Because the store touches localStorage we run under jsdom, clear storage,
 * and reset the data fields via setState (NOT replace:true) in beforeEach.
 *
 * These tests pin CURRENT behavior. Suspected bugs are flagged in comments.
 */

const STORAGE_KEY = 'orion:subscription-state'
const store = useSubscriptionStore

// Deterministic fixture so seat/usage math does not depend on demo defaults.
function baseAccount(): SubscriptionAccount {
  return {
    companyName: 'Test Co',
    billingEmail: 'billing@test.example',
    planId: 'team',
    status: 'trialing',
    seats: 8,
    trialEndsAt: '2026-07-01T00:00:00.000Z',
    renewalDate: '2026-08-01T00:00:00.000Z',
    usage: {
      providerSlots: 6,
      workspaces: 18,
      teamMembers: 7,
      historyDays: 42,
      aiSpendUsd: 214,
    },
    updatedAt: '2026-06-03T00:00:00.000Z',
  }
}

function readPersisted(): { account: SubscriptionAccount; events: BillingEvent[] } | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

beforeEach(() => {
  localStorage.clear()
  // Reset data fields only; keep the singleton's action implementations.
  store.setState({ account: baseAccount(), events: [] })
})

afterEach(() => {
  localStorage.clear()
})

describe('initial state shape', () => {
  it('exposes account, events and all action functions', () => {
    const s = store.getState()
    expect(s.account.planId).toBe('team')
    expect(Array.isArray(s.events)).toBe(true)
    expect(typeof s.setPlan).toBe('function')
    expect(typeof s.setSeats).toBe('function')
    expect(typeof s.setStatus).toBe('function')
    expect(typeof s.setUsage).toBe('function')
    expect(typeof s.recordCheckoutIntent).toBe('function')
    expect(typeof s.resetSubscription).toBe('function')
  })
})

describe('setPlan', () => {
  it('changes plan to solo and forces seats to exactly 1', () => {
    store.setState({ account: { ...baseAccount(), seats: 12 } })
    store.getState().setPlan('solo')
    const acc = store.getState().account
    expect(acc.planId).toBe('solo')
    // changeAccountPlan: solo always collapses to a single seat.
    expect(acc.seats).toBe(1)
  })

  it('keeps current seats when upgrading and usage is below entitlement', () => {
    // base: seats 8, usage.teamMembers 7. enterprise teamMembers = 500.
    // seats = max(8, min(7, 500)) = 8
    store.getState().setPlan('enterprise')
    const acc = store.getState().account
    expect(acc.planId).toBe('enterprise')
    expect(acc.seats).toBe(8)
  })

  it('raises seats to the clamped team-member usage when usage exceeds current seats', () => {
    // seats 3, usage.teamMembers 100, team entitlement teamMembers = 50.
    // seats = max(3, min(100, 50)) = 50
    store.setState({
      account: {
        ...baseAccount(),
        seats: 3,
        usage: { ...baseAccount().usage, teamMembers: 100 },
      },
    })
    store.getState().setPlan('team')
    expect(store.getState().account.seats).toBe(50)
  })

  it('reactivates an expired subscription when the plan changes', () => {
    store.setState({ account: { ...baseAccount(), status: 'expired' } })
    store.getState().setPlan('team')
    // changeAccountPlan maps expired -> active on plan change.
    expect(store.getState().account.status).toBe('active')
  })

  it('leaves a non-expired status untouched on plan change', () => {
    store.setState({ account: { ...baseAccount(), status: 'past_due' } })
    store.getState().setPlan('solo')
    expect(store.getState().account.status).toBe('past_due')
  })

  it('prepends a plan-change billing event describing the transition', () => {
    store.getState().setPlan('enterprise')
    const ev = store.getState().events[0]
    expect(ev.type).toBe('plan-change')
    expect(ev.message).toBe('Plan changed from team to enterprise.')
    expect(ev.id.startsWith('plan-change-')).toBe(true)
    expect(typeof ev.timestamp).toBe('string')
  })

  it('refreshes updatedAt to an ISO timestamp', () => {
    const before = store.getState().account.updatedAt
    store.getState().setPlan('solo')
    const after = store.getState().account.updatedAt
    expect(after).not.toBe(before)
    expect(new Date(after).toISOString()).toBe(after)
  })
})

describe('setSeats', () => {
  it('rounds fractional seat counts to the nearest integer', () => {
    store.getState().setSeats(7.6)
    expect(store.getState().account.seats).toBe(8)
  })

  it('clamps seats to a minimum of 1', () => {
    store.getState().setSeats(0)
    expect(store.getState().account.seats).toBe(1)
    store.getState().setSeats(-50)
    expect(store.getState().account.seats).toBe(1)
  })

  it('clamps seats to a maximum of 500', () => {
    store.getState().setSeats(9999)
    expect(store.getState().account.seats).toBe(500)
  })

  it('records a seat-change event with the normalized count', () => {
    store.getState().setSeats(3.2)
    const ev = store.getState().events[0]
    expect(ev.type).toBe('seat-change')
    expect(ev.message).toBe('Seat count set to 3.')
  })
})

describe('setStatus', () => {
  it('updates the subscription status directly', () => {
    store.getState().setStatus('expired')
    expect(store.getState().account.status).toBe('expired')
  })

  it('logs a status-change event', () => {
    store.getState().setStatus('active')
    const ev = store.getState().events[0]
    expect(ev.type).toBe('status-change')
    expect(ev.message).toBe('Subscription status changed to active.')
  })

  it('can set every valid status value', () => {
    for (const status of ['trialing', 'active', 'past_due', 'expired'] as const) {
      store.getState().setStatus(status)
      expect(store.getState().account.status).toBe(status)
    }
  })
})

describe('setUsage', () => {
  it('merges partial usage without clobbering untouched fields', () => {
    store.getState().setUsage({ providerSlots: 30, aiSpendUsd: 999 })
    const usage = store.getState().account.usage
    expect(usage.providerSlots).toBe(30)
    expect(usage.aiSpendUsd).toBe(999)
    // untouched fields retained from base fixture
    expect(usage.workspaces).toBe(18)
    expect(usage.teamMembers).toBe(7)
    expect(usage.historyDays).toBe(42)
  })

  it('lists the changed keys in the usage-change event message', () => {
    store.getState().setUsage({ workspaces: 5, historyDays: 10 })
    const ev = store.getState().events[0]
    expect(ev.type).toBe('usage-change')
    expect(ev.message).toBe('Usage updated: workspaces, historyDays.')
  })

  it('accumulates successive usage updates', () => {
    store.getState().setUsage({ providerSlots: 10 })
    store.getState().setUsage({ workspaces: 2 })
    const usage = store.getState().account.usage
    expect(usage.providerSlots).toBe(10)
    expect(usage.workspaces).toBe(2)
  })
})

describe('recordCheckoutIntent', () => {
  it('derives a manual checkout message (env unconfigured) from the current account', () => {
    // No checkout URL env -> provider 'manual', ready false.
    // team plan priceMonthly 39, per-seat, seats 8 -> MRR 312, planName 'Team'.
    store.getState().recordCheckoutIntent()
    const ev = store.getState().events[0]
    expect(ev.type).toBe('checkout')
    expect(ev.message).toBe('Manual checkout intent prepared for Team at $312/mo.')
  })

  it('uses a "prepared" message when given a ready intent', () => {
    const intent: CheckoutSessionIntent = {
      provider: 'stripe',
      mode: 'live',
      ready: true,
      url: 'https://pay.example/checkout',
      amountMonthly: 199,
      planName: 'Enterprise',
      seats: 35,
      warnings: [],
    }
    store.getState().recordCheckoutIntent(intent)
    expect(store.getState().events[0].message).toBe(
      'Checkout session prepared for Enterprise at $199/mo.',
    )
  })

  it('does not mutate the account, only appends an event', () => {
    const accBefore = store.getState().account
    store.getState().recordCheckoutIntent()
    // recordCheckoutIntent calls set({ events }) only.
    expect(store.getState().account).toBe(accBefore)
    expect(store.getState().events).toHaveLength(1)
  })

  it('computes per-seat MRR from the live account seats', () => {
    store.setState({ account: { ...baseAccount(), seats: 10 } })
    store.getState().recordCheckoutIntent()
    // 39 * 10 = 390
    expect(store.getState().events[0].message).toContain('$390/mo')
  })
})

describe('resetSubscription', () => {
  it('restores a default trial account and a single reset event', () => {
    store.setState({
      account: { ...baseAccount(), planId: 'enterprise', status: 'expired', seats: 99 },
      events: [
        { id: 'x', timestamp: '2020-01-01T00:00:00.000Z', type: 'checkout', message: 'old' },
      ],
    })
    store.getState().resetSubscription()
    const s = store.getState()
    // default account derives from demoSubscriptionAccount (team / trialing).
    expect(s.account.planId).toBe('team')
    expect(s.account.status).toBe('trialing')
    expect(s.events).toHaveLength(1)
    expect(s.events[0].type).toBe('checkout')
    expect(s.events[0].message).toBe('Subscription workspace reset to default trial state.')
  })

  it('sets trial and renewal dates relative to reset time', () => {
    store.getState().resetSubscription()
    const acc = store.getState().account
    const trial = new Date(acc.trialEndsAt).getTime()
    const updated = new Date(acc.updatedAt).getTime()
    // trial ends ~14 days after reset
    const days = (trial - updated) / (1000 * 60 * 60 * 24)
    expect(days).toBeGreaterThan(13)
    expect(days).toBeLessThan(15)
    expect(new Date(acc.renewalDate).getTime()).toBeGreaterThan(updated)
  })
})

describe('persistence', () => {
  it('writes account and events to localStorage after a mutation', () => {
    store.getState().setPlan('enterprise')
    const persisted = readPersisted()
    expect(persisted).not.toBeNull()
    expect(persisted!.account.planId).toBe('enterprise')
    expect(persisted!.events[0].type).toBe('plan-change')
  })

  it('caps the persisted event log at 100 entries while keeping all in memory', () => {
    // Each setStatus prepends one event. Drive past the 100-event cap.
    for (let i = 0; i < 105; i++) {
      store.getState().setStatus(i % 2 === 0 ? 'active' : 'past_due')
    }
    expect(store.getState().events.length).toBe(105)
    const persisted = readPersisted()
    expect(persisted!.events.length).toBe(100)
  })

  it('recordCheckoutIntent persists events but the persisted account is unchanged', () => {
    const accBefore = store.getState().account
    store.getState().recordCheckoutIntent()
    const persisted = readPersisted()
    expect(persisted!.account.planId).toBe(accBefore.planId)
    expect(persisted!.events[0].type).toBe('checkout')
  })
})

describe('store hydration on module load', () => {
  it('hydrates from a valid persisted state', async () => {
    const seeded = {
      account: { ...baseAccount(), companyName: 'Hydrated Inc', planId: 'enterprise' as const },
      events: [
        { id: 'seed', timestamp: '2026-01-01T00:00:00.000Z', type: 'checkout', message: 'seeded' },
      ],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    vi.resetModules()
    const fresh = await import('./subscription')
    expect(fresh.useSubscriptionStore.getState().account.companyName).toBe('Hydrated Inc')
    expect(fresh.useSubscriptionStore.getState().account.planId).toBe('enterprise')
    expect(fresh.useSubscriptionStore.getState().events[0].id).toBe('seed')
  })

  it('falls back to defaults when persisted state is malformed', async () => {
    localStorage.setItem(STORAGE_KEY, '{ not valid json')
    vi.resetModules()
    const fresh = await import('./subscription')
    // safeParseState returns null -> default account + single seeded event.
    expect(fresh.useSubscriptionStore.getState().account.planId).toBe('team')
    expect(fresh.useSubscriptionStore.getState().events).toHaveLength(1)
  })

  it('falls back to defaults when persisted state is missing required fields', async () => {
    // events not an array -> safeParseState rejects it.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ account: baseAccount(), events: 'nope' }))
    vi.resetModules()
    const fresh = await import('./subscription')
    expect(fresh.useSubscriptionStore.getState().account.planId).toBe('team')
    expect(fresh.useSubscriptionStore.getState().events).toHaveLength(1)
  })
})

describe('entitlement data sanity (pins limit model the store relies on)', () => {
  it('confirms solo collapses seats and enterprise has the widest member ceiling', () => {
    expect(planEntitlements.solo.teamMembers).toBe(1)
    expect(planEntitlements.team.teamMembers).toBe(50)
    expect(planEntitlements.enterprise.teamMembers).toBe(500)
  })

  it('confirms team is per-seat priced at $39 (basis for checkout MRR)', () => {
    const team = pricingPlans.find((p) => p.id === 'team')!
    expect(team.billingModel).toBe('per-seat')
    expect(team.priceMonthly).toBe(39)
  })
})
