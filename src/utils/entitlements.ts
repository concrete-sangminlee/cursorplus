import {
  demoSubscriptionAccount,
  planEntitlements,
  pricingPlans,
  type FeatureGateId,
  type PlanEntitlements,
  type PlanId,
  type PricingPlan,
  type SubscriptionAccount,
  type SubscriptionStatus,
  type SubscriptionUsage,
} from '@/data/saasOperatingSystem'

export type EntitlementState = 'available' | 'near-limit' | 'blocked'
export type SubscriptionHealth = 'healthy' | 'watch' | 'blocked'

export interface EntitlementEvaluation {
  id: FeatureGateId
  label: string
  used: number | boolean
  limit: number | boolean | null
  unit: string
  state: EntitlementState
  percentUsed: number
  upgradePlanId: PlanId | null
  reason: string
}

export interface SubscriptionHealthSummary {
  health: SubscriptionHealth
  label: string
  reason: string
}

const featureLabels: Record<FeatureGateId, string> = {
  'provider-slots': 'AI providers',
  workspaces: 'Workspaces',
  'team-members': 'Team members',
  'agent-history': 'Agent history',
  'ai-budget': 'AI budget',
  'audit-logs': 'Audit logs',
  sso: 'SSO',
  'private-updates': 'Private updates',
}

const allPlanIds: PlanId[] = ['solo', 'team', 'enterprise']

export function getPricingPlan(planId: PlanId): PricingPlan {
  const plan = pricingPlans.find((item) => item.id === planId)
  if (!plan) throw new Error(`Unknown plan: ${planId}`)
  return plan
}

export function getPlanEntitlements(planId: PlanId): PlanEntitlements {
  return planEntitlements[planId]
}

export function createDefaultSubscriptionAccount(now = new Date()): SubscriptionAccount {
  const trialEndsAt = new Date(now)
  trialEndsAt.setDate(trialEndsAt.getDate() + 14)

  const renewalDate = new Date(now)
  renewalDate.setMonth(renewalDate.getMonth() + 1)

  return {
    ...demoSubscriptionAccount,
    trialEndsAt: trialEndsAt.toISOString(),
    renewalDate: renewalDate.toISOString(),
    updatedAt: now.toISOString(),
  }
}

export function calculateAccountMrr(account: SubscriptionAccount): number {
  const plan = getPricingPlan(account.planId)
  const multiplier = plan.billingModel === 'per-seat' ? account.seats : 1
  return Math.round(plan.priceMonthly * multiplier)
}

export function changeAccountPlan(account: SubscriptionAccount, planId: PlanId, now = new Date()): SubscriptionAccount {
  const entitlements = getPlanEntitlements(planId)
  const seats = planId === 'solo'
    ? 1
    : Math.max(account.seats, Math.min(account.usage.teamMembers, entitlements.teamMembers))

  return {
    ...account,
    planId,
    seats,
    status: account.status === 'expired' ? 'active' : account.status,
    updatedAt: now.toISOString(),
  }
}

export function setSubscriptionStatus(
  account: SubscriptionAccount,
  status: SubscriptionStatus,
  now = new Date(),
): SubscriptionAccount {
  return {
    ...account,
    status,
    updatedAt: now.toISOString(),
  }
}

export function updateSubscriptionUsage(
  account: SubscriptionAccount,
  usage: Partial<SubscriptionUsage>,
  now = new Date(),
): SubscriptionAccount {
  return {
    ...account,
    usage: { ...account.usage, ...usage },
    updatedAt: now.toISOString(),
  }
}

function numericState(used: number, limit: number | null): { state: EntitlementState; percentUsed: number } {
  if (limit === null) return { state: 'available', percentUsed: 0 }
  const percentUsed = limit <= 0 ? 100 : Math.round((used / limit) * 100)
  if (used > limit) return { state: 'blocked', percentUsed }
  if (percentUsed >= 80) return { state: 'near-limit', percentUsed }
  return { state: 'available', percentUsed }
}

function booleanState(available: boolean): { state: EntitlementState; percentUsed: number } {
  return {
    state: available ? 'available' : 'blocked',
    percentUsed: available ? 0 : 100,
  }
}

function findUpgradePlan(account: SubscriptionAccount, feature: FeatureGateId, used: number | boolean): PlanId | null {
  const currentIndex = allPlanIds.indexOf(account.planId)
  const candidates = allPlanIds.slice(currentIndex + 1)

  for (const planId of candidates) {
    const entitlements = getPlanEntitlements(planId)
    if (feature === 'provider-slots' && typeof used === 'number' && used <= entitlements.providerSlots) return planId
    if (feature === 'workspaces' && typeof used === 'number' && (entitlements.workspaceLimit === null || used <= entitlements.workspaceLimit)) return planId
    if (feature === 'team-members' && typeof used === 'number' && used <= entitlements.teamMembers) return planId
    if (feature === 'agent-history' && typeof used === 'number' && used <= entitlements.historyDays) return planId
    if (feature === 'ai-budget' && typeof used === 'number' && used <= entitlements.aiBudgetUsd) return planId
    if (feature === 'audit-logs' && entitlements.auditLogs) return planId
    if (feature === 'sso' && entitlements.sso) return planId
    if (feature === 'private-updates' && entitlements.privateUpdateChannel) return planId
  }

  return null
}

function evaluation(
  account: SubscriptionAccount,
  id: FeatureGateId,
  used: number | boolean,
  limit: number | boolean | null,
  unit: string,
  state: EntitlementState,
  percentUsed: number,
  reason: string,
): EntitlementEvaluation {
  return {
    id,
    label: featureLabels[id],
    used,
    limit,
    unit,
    state,
    percentUsed,
    upgradePlanId: state === 'available' ? null : findUpgradePlan(account, id, used),
    reason,
  }
}

export function evaluateEntitlements(account: SubscriptionAccount): EntitlementEvaluation[] {
  const entitlements = getPlanEntitlements(account.planId)
  const usage = account.usage
  const providerState = numericState(usage.providerSlots, entitlements.providerSlots)
  const workspaceState = numericState(usage.workspaces, entitlements.workspaceLimit)
  const memberState = numericState(usage.teamMembers, entitlements.teamMembers)
  const historyState = numericState(usage.historyDays, entitlements.historyDays)
  const budgetState = numericState(usage.aiSpendUsd, entitlements.aiBudgetUsd)
  const auditState = booleanState(entitlements.auditLogs)
  const ssoState = booleanState(entitlements.sso)
  const updateState = booleanState(entitlements.privateUpdateChannel)

  return [
    evaluation(account, 'provider-slots', usage.providerSlots, entitlements.providerSlots, 'slots', providerState.state, providerState.percentUsed, 'Configured AI provider connections.'),
    evaluation(account, 'workspaces', usage.workspaces, entitlements.workspaceLimit, 'workspaces', workspaceState.state, workspaceState.percentUsed, entitlements.workspaceLimit === null ? 'Unlimited workspaces on this plan.' : 'Active shared workspaces.'),
    evaluation(account, 'team-members', usage.teamMembers, entitlements.teamMembers, 'members', memberState.state, memberState.percentUsed, 'Team members with workspace access.'),
    evaluation(account, 'agent-history', usage.historyDays, entitlements.historyDays, 'days', historyState.state, historyState.percentUsed, 'Retained agent task history.'),
    evaluation(account, 'ai-budget', usage.aiSpendUsd, entitlements.aiBudgetUsd, 'USD', budgetState.state, budgetState.percentUsed, 'Monthly managed AI spend guardrail.'),
    evaluation(account, 'audit-logs', entitlements.auditLogs, true, '', auditState.state, auditState.percentUsed, 'Required for governed team adoption.'),
    evaluation(account, 'sso', entitlements.sso, true, '', ssoState.state, ssoState.percentUsed, 'Enterprise identity control.'),
    evaluation(account, 'private-updates', entitlements.privateUpdateChannel, true, '', updateState.state, updateState.percentUsed, 'Private release channel and update control.'),
  ]
}

export function getSubscriptionHealth(account: SubscriptionAccount): SubscriptionHealthSummary {
  if (account.status === 'expired') {
    return { health: 'blocked', label: 'Expired', reason: 'Paid cloud and team features should be disabled until renewal.' }
  }

  if (account.status === 'past_due') {
    return { health: 'blocked', label: 'Past due', reason: 'Local editing remains available; team and cloud features should be gated.' }
  }

  const evaluations = evaluateEntitlements(account)
  const blocked = evaluations.filter((item) => item.state === 'blocked' && typeof item.used === 'number')
  if (blocked.length > 0) {
    return { health: 'blocked', label: 'Blocked limits', reason: `${blocked.length} entitlement limit(s) require an upgrade or usage reduction.` }
  }

  const nearLimit = evaluations.filter((item) => item.state === 'near-limit' && typeof item.used === 'number')
  if (nearLimit.length > 0 || account.status === 'trialing') {
    return { health: 'watch', label: account.status === 'trialing' ? 'Trialing' : 'Near limits', reason: nearLimit.length > 0 ? `${nearLimit.length} entitlement limit(s) are near capacity.` : 'Trial conversion path should stay visible.' }
  }

  return { health: 'healthy', label: 'Active', reason: 'Subscription is active and within plan limits.' }
}

export function getUpgradeRecommendations(account: SubscriptionAccount): EntitlementEvaluation[] {
  return evaluateEntitlements(account)
    .filter((item) => item.state !== 'available' && item.upgradePlanId !== null)
    .sort((a, b) => {
      const order: Record<EntitlementState, number> = { blocked: 0, 'near-limit': 1, available: 2 }
      return order[a.state] - order[b.state] || b.percentUsed - a.percentUsed
    })
}
