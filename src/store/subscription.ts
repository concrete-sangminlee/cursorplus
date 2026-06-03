import { create } from 'zustand'
import {
  type PlanId,
  type SubscriptionAccount,
  type SubscriptionStatus,
  type SubscriptionUsage,
} from '@/data/saasOperatingSystem'
import {
  changeAccountPlan,
  createDefaultSubscriptionAccount,
  setSubscriptionStatus,
  updateSubscriptionUsage,
} from '@/utils/entitlements'
import { createCheckoutSessionIntent, type CheckoutSessionIntent } from '@/utils/billingGateway'

export interface BillingEvent {
  id: string
  timestamp: string
  type: 'checkout' | 'plan-change' | 'status-change' | 'usage-change' | 'seat-change'
  message: string
}

interface PersistedSubscriptionState {
  account: SubscriptionAccount
  events: BillingEvent[]
}

interface SubscriptionStore {
  account: SubscriptionAccount
  events: BillingEvent[]
  setPlan: (planId: PlanId) => void
  setSeats: (seats: number) => void
  setStatus: (status: SubscriptionStatus) => void
  setUsage: (usage: Partial<SubscriptionUsage>) => void
  recordCheckoutIntent: (intent?: CheckoutSessionIntent) => void
  resetSubscription: () => void
}

const STORAGE_KEY = 'orion:subscription-state'

function safeParseState(): PersistedSubscriptionState | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedSubscriptionState>
    if (!parsed.account || !Array.isArray(parsed.events)) return null
    return { account: parsed.account, events: parsed.events }
  } catch {
    return null
  }
}

function persist(account: SubscriptionAccount, events: BillingEvent[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ account, events: events.slice(0, 100) }))
  } catch {
    // Ignore quota errors. The app can continue with in-memory state.
  }
}

function event(type: BillingEvent['type'], message: string, now = new Date()): BillingEvent {
  return {
    id: `${type}-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.toISOString(),
    type,
    message,
  }
}

const initialState = safeParseState() ?? {
  account: createDefaultSubscriptionAccount(new Date('2026-06-03T00:00:00.000Z')),
  events: [
    event('checkout', 'Trial workspace created for founder-led Team plan evaluation.', new Date('2026-06-03T00:00:00.000Z')),
  ],
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  account: initialState.account,
  events: initialState.events,

  setPlan: (planId) => {
    const now = new Date()
    const current = get().account
    const account = changeAccountPlan(current, planId, now)
    const events = [
      event('plan-change', `Plan changed from ${current.planId} to ${planId}.`, now),
      ...get().events,
    ]
    persist(account, events)
    set({ account, events })
  },

  setSeats: (seats) => {
    const now = new Date()
    const normalizedSeats = Math.max(1, Math.min(500, Math.round(seats)))
    const account = {
      ...get().account,
      seats: normalizedSeats,
      updatedAt: now.toISOString(),
    }
    const events = [
      event('seat-change', `Seat count set to ${normalizedSeats}.`, now),
      ...get().events,
    ]
    persist(account, events)
    set({ account, events })
  },

  setStatus: (status) => {
    const now = new Date()
    const account = setSubscriptionStatus(get().account, status, now)
    const events = [
      event('status-change', `Subscription status changed to ${status}.`, now),
      ...get().events,
    ]
    persist(account, events)
    set({ account, events })
  },

  setUsage: (usage) => {
    const now = new Date()
    const account = updateSubscriptionUsage(get().account, usage, now)
    const changed = Object.keys(usage).join(', ')
    const events = [
      event('usage-change', `Usage updated: ${changed}.`, now),
      ...get().events,
    ]
    persist(account, events)
    set({ account, events })
  },

  recordCheckoutIntent: (intent) => {
    const now = new Date()
    const checkout = intent ?? createCheckoutSessionIntent(get().account)
    const message = checkout.ready
      ? `Checkout session prepared for ${checkout.planName} at $${checkout.amountMonthly}/mo.`
      : `Manual checkout intent prepared for ${checkout.planName} at $${checkout.amountMonthly}/mo.`
    const events = [
      event('checkout', message, now),
      ...get().events,
    ]
    persist(get().account, events)
    set({ events })
  },

  resetSubscription: () => {
    const now = new Date()
    const account = createDefaultSubscriptionAccount(now)
    const events = [event('checkout', 'Subscription workspace reset to default trial state.', now)]
    persist(account, events)
    set({ account, events })
  },
}))
