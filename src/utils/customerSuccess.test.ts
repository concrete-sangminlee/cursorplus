import { describe, expect, it } from 'vitest'
import { customerLifecycleAccounts } from '@/data/saasOperatingSystem'
import {
  calculateActivationScore,
  calculateCustomerLifecycleSummary,
  calculateWeightedPipelineMrr,
  getAccountsNeedingAttention,
  getNextLifecycleAction,
  getStageCounts,
  getTargetPlanMix,
} from './customerSuccess'

describe('customer success utilities', () => {
  it('calculates activation from completed lifecycle steps', () => {
    const northstar = customerLifecycleAccounts.find((account) => account.id === 'northstar-labs')!

    expect(calculateActivationScore(northstar)).toBe(75)
  })

  it('calculates weighted pipeline without counting paid accounts as open pipeline', () => {
    expect(calculateWeightedPipelineMrr(customerLifecycleAccounts)).toBe(5695)
  })

  it('summarizes lifecycle health across active accounts', () => {
    expect(calculateCustomerLifecycleSummary(customerLifecycleAccounts)).toEqual({
      accountCount: 5,
      qualifiedPipelineMrr: 10399,
      weightedPipelineMrr: 5695,
      averageActivation: 60,
      attentionCount: 4,
      paidMrr: 0,
    })
  })

  it('orders blocked and blocker-heavy accounts first in the attention queue', () => {
    const attention = getAccountsNeedingAttention(customerLifecycleAccounts)

    expect(attention.map((account) => account.id)).toEqual([
      'lambdabank',
      'arclight-systems',
      'northstar-labs',
      'cloudsmith-studio',
    ])
  })

  it('returns the correct next lifecycle action for blocked and activated accounts', () => {
    const blocked = customerLifecycleAccounts.find((account) => account.id === 'lambdabank')!
    const activated = customerLifecycleAccounts.find((account) => account.id === 'hexaforge')!

    expect(getNextLifecycleAction(blocked)).toContain('Resolve blocker: SSO not implemented')
    expect(getNextLifecycleAction(activated)).toContain('Convert activated account to team checkout')
  })

  it('counts stage and target plan mix', () => {
    expect(getStageCounts(customerLifecycleAccounts).map((stage) => [stage.stage, stage.count])).toEqual([
      ['lead', 1],
      ['trial', 1],
      ['activated', 1],
      ['paid', 0],
      ['expansion', 1],
      ['blocked', 1],
    ])
    expect(getTargetPlanMix(customerLifecycleAccounts)).toEqual({ solo: 1, team: 2, enterprise: 2 })
  })
})
