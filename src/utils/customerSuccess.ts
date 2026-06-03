import type {
  CustomerLifecycleAccount,
  CustomerLifecycleStage,
  PlanId,
} from '@/data/saasOperatingSystem'

export interface CustomerLifecycleSummary {
  accountCount: number
  qualifiedPipelineMrr: number
  weightedPipelineMrr: number
  averageActivation: number
  attentionCount: number
  paidMrr: number
}

export interface StageCount {
  stage: CustomerLifecycleStage
  count: number
  valueMonthly: number
}

export const lifecycleStageWeight: Record<CustomerLifecycleStage, number> = {
  lead: 0.1,
  trial: 0.35,
  activated: 0.65,
  paid: 1,
  expansion: 0.75,
  blocked: 0.15,
}

export function calculateActivationScore(account: CustomerLifecycleAccount): number {
  if (!account.activationSteps.length) return 0
  const completed = account.activationSteps.filter((step) => step.complete).length
  return Math.round((completed / account.activationSteps.length) * 100)
}

export function calculateQualifiedPipelineMrr(accounts: CustomerLifecycleAccount[]): number {
  return accounts
    .filter((account) => account.stage !== 'paid')
    .reduce((sum, account) => sum + account.dealValueMonthly, 0)
}

export function calculateWeightedPipelineMrr(accounts: CustomerLifecycleAccount[]): number {
  return Math.round(accounts.reduce((sum, account) => {
    if (account.stage === 'paid') return sum
    return sum + account.dealValueMonthly * lifecycleStageWeight[account.stage]
  }, 0))
}

export function calculatePaidMrr(accounts: CustomerLifecycleAccount[]): number {
  return accounts
    .filter((account) => account.stage === 'paid')
    .reduce((sum, account) => sum + account.dealValueMonthly, 0)
}

export function getStageCounts(accounts: CustomerLifecycleAccount[]): StageCount[] {
  const stages: CustomerLifecycleStage[] = ['lead', 'trial', 'activated', 'paid', 'expansion', 'blocked']
  return stages.map((stage) => {
    const matches = accounts.filter((account) => account.stage === stage)
    return {
      stage,
      count: matches.length,
      valueMonthly: matches.reduce((sum, account) => sum + account.dealValueMonthly, 0),
    }
  })
}

export function getAccountsNeedingAttention(accounts: CustomerLifecycleAccount[]): CustomerLifecycleAccount[] {
  return [...accounts]
    .filter((account) => {
      if (account.stage === 'blocked') return true
      if (account.blockers.length > 0) return true
      if (calculateActivationScore(account) < 50) return true
      return account.daysInStage >= 10
    })
    .sort((a, b) => {
      const blockedDelta = Number(b.stage === 'blocked') - Number(a.stage === 'blocked')
      if (blockedDelta !== 0) return blockedDelta
      const blockerDelta = b.blockers.length - a.blockers.length
      if (blockerDelta !== 0) return blockerDelta
      return b.daysInStage - a.daysInStage
    })
}

export function calculateCustomerLifecycleSummary(accounts: CustomerLifecycleAccount[]): CustomerLifecycleSummary {
  const averageActivation = accounts.length
    ? Math.round(accounts.reduce((sum, account) => sum + calculateActivationScore(account), 0) / accounts.length)
    : 0

  return {
    accountCount: accounts.length,
    qualifiedPipelineMrr: calculateQualifiedPipelineMrr(accounts),
    weightedPipelineMrr: calculateWeightedPipelineMrr(accounts),
    averageActivation,
    attentionCount: getAccountsNeedingAttention(accounts).length,
    paidMrr: calculatePaidMrr(accounts),
  }
}

export function getNextLifecycleAction(account: CustomerLifecycleAccount): string {
  const activationScore = calculateActivationScore(account)

  if (account.stage === 'blocked' && account.blockers.length > 0) {
    return `Resolve blocker: ${account.blockers[0]}. ${account.nextAction}`
  }

  if (activationScore < 50) {
    const nextStep = account.activationSteps.find((step) => !step.complete)
    return nextStep ? `Drive activation step: ${nextStep.label}. ${account.nextAction}` : account.nextAction
  }

  if (account.stage === 'activated') {
    return `Convert activated account to ${account.targetPlanId} checkout. ${account.nextAction}`
  }

  if (account.stage === 'expansion') {
    return `Build expansion proposal for ${account.seats} seats. ${account.nextAction}`
  }

  return account.nextAction
}

export function getTargetPlanMix(accounts: CustomerLifecycleAccount[]): Record<PlanId, number> {
  return accounts.reduce(
    (mix, account) => {
      mix[account.targetPlanId] += 1
      return mix
    },
    { solo: 0, team: 0, enterprise: 0 },
  )
}
