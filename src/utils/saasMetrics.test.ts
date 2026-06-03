import { describe, expect, it } from 'vitest'
import { launchChecklist, pricingPlans, saasMetrics, sprintPlans } from '@/data/saasOperatingSystem'
import {
  calculateAnnualRevenue,
  calculatePlanMrr,
  calculateReadinessScore,
  calculateSprintProgress,
  calculateTotalMrr,
  formatSaasMetric,
  getChecklistCounts,
  getCurrentSprint,
} from './saasMetrics'

describe('saasMetrics', () => {
  it('calculates MRR for flat and per-seat plans', () => {
    const solo = pricingPlans.find((plan) => plan.id === 'solo')
    const team = pricingPlans.find((plan) => plan.id === 'team')

    expect(solo).toBeDefined()
    expect(team).toBeDefined()
    expect(calculatePlanMrr(solo!)).toBe(4180)
    expect(calculatePlanMrr(team!)).toBe(16848)
  })

  it('calculates total MRR and annual revenue from the pricing model', () => {
    expect(calculateTotalMrr(pricingPlans)).toBe(24016)
    expect(calculateAnnualRevenue(pricingPlans)).toBe(288192)
  })

  it('calculates readiness from metric state and launch checklist state', () => {
    expect(calculateReadinessScore(saasMetrics, launchChecklist)).toBe(80)
  })

  it('summarizes sprint progress with active sprint counted as half-complete', () => {
    expect(sprintPlans).toHaveLength(10)
    expect(calculateSprintProgress(sprintPlans)).toBe(35)
    expect(getCurrentSprint(sprintPlans)?.number).toBe(4)
  })

  it('formats SaaS metrics for dashboard display', () => {
    expect(formatSaasMetric(19968, 'usd')).toBe('$19,968')
    expect(formatSaasMetric(42, 'percent')).toBe('42%')
    expect(formatSaasMetric(1.8, 'days')).toBe('1.8d')
    expect(formatSaasMetric(410, 'count')).toBe('410')
  })

  it('counts launch checklist status groups', () => {
    expect(getChecklistCounts(launchChecklist)).toEqual({ done: 1, ready: 5, blocked: 0 })
  })
})
