import type { LaunchChecklistItem, PricingPlan, SaasMetric, SprintPlan } from '@/data/saasOperatingSystem'

const STATUS_WEIGHT = {
  'on-track': 100,
  watch: 70,
  'at-risk': 35,
} as const

const CHECKLIST_WEIGHT = {
  done: 100,
  ready: 75,
  blocked: 20,
} as const

export function calculatePlanMrr(plan: PricingPlan): number {
  const multiplier = plan.billingModel === 'per-seat' ? plan.averageSeats : 1
  return Math.round(plan.priceMonthly * plan.projectedAccounts * multiplier)
}

export function calculateTotalMrr(plans: PricingPlan[]): number {
  return plans.reduce((sum, plan) => sum + calculatePlanMrr(plan), 0)
}

export function calculateAnnualRevenue(plans: PricingPlan[]): number {
  return calculateTotalMrr(plans) * 12
}

export function calculateReadinessScore(metrics: SaasMetric[], checklist: LaunchChecklistItem[]): number {
  const metricScore = metrics.length
    ? metrics.reduce((sum, metric) => sum + STATUS_WEIGHT[metric.status], 0) / metrics.length
    : 0

  const checklistScore = checklist.length
    ? checklist.reduce((sum, item) => sum + CHECKLIST_WEIGHT[item.status], 0) / checklist.length
    : 0

  return Math.round(metricScore * 0.55 + checklistScore * 0.45)
}

export function calculateSprintProgress(sprints: SprintPlan[]): number {
  if (!sprints.length) return 0
  const completed = sprints.filter((sprint) => sprint.status === 'complete').length
  const active = sprints.filter((sprint) => sprint.status === 'active').length
  return Math.round(((completed + active * 0.5) / sprints.length) * 100)
}

export function getCurrentSprint(sprints: SprintPlan[]): SprintPlan | null {
  return sprints.find((sprint) => sprint.status === 'active')
    ?? sprints.find((sprint) => sprint.status === 'planned')
    ?? sprints[sprints.length - 1]
    ?? null
}

export function formatSaasMetric(value: number, unit: SaasMetric['unit']): string {
  if (unit === 'usd') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (unit === 'percent') {
    return `${Math.round(value)}%`
  }

  if (unit === 'days') {
    return `${value.toFixed(value % 1 === 0 ? 0 : 1)}d`
  }

  return new Intl.NumberFormat('en-US').format(value)
}

export function getChecklistCounts(checklist: LaunchChecklistItem[]) {
  return checklist.reduce(
    (counts, item) => {
      counts[item.status] += 1
      return counts
    },
    { done: 0, ready: 0, blocked: 0 },
  )
}
