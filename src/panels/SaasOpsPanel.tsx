import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Clock,
  CreditCard,
  DollarSign,
  Handshake,
  Layers,
  LineChart,
  Lock,
  Megaphone,
  Minus,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Unlock,
  Users,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  growthExperiments,
  customerLifecycleAccounts,
  launchChecklist,
  launchPositioning,
  operatingCadence,
  pricingPlans,
  saasMetrics,
  sprintPlans,
  teamRoles,
  type ChecklistStatus,
  type CustomerLifecycleAccount,
  type CustomerLifecycleStage,
  type MetricStatus,
  type PlanId,
  type SubscriptionStatus,
  type SaasRoleId,
  type SprintStatus,
} from '@/data/saasOperatingSystem'
import {
  calculateActivationScore,
  calculateCustomerLifecycleSummary,
  getAccountsNeedingAttention,
  getNextLifecycleAction,
  getStageCounts,
  getTargetPlanMix,
} from '@/utils/customerSuccess'
import {
  calculateAnnualRevenue,
  calculatePlanMrr,
  calculateReadinessScore,
  calculateSprintProgress,
  calculateTotalMrr,
  formatSaasMetric,
  getChecklistCounts,
  getCurrentSprint,
} from '@/utils/saasMetrics'
import {
  calculateAccountMrr,
  evaluateEntitlements,
  getPricingPlan,
  getSubscriptionHealth,
  getUpgradeRecommendations,
  type EntitlementEvaluation,
} from '@/utils/entitlements'
import {
  createCheckoutSessionIntent,
  createLicenseSnapshot,
  getBillingProviderStatus,
} from '@/utils/billingGateway'
import { useSubscriptionStore } from '@/store/subscription'

type View = 'overview' | 'billing' | 'customers' | 'sprints' | 'team' | 'revenue'

const tabs: Array<{ id: View; label: string; Icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', Icon: Activity },
  { id: 'billing', label: 'Billing', Icon: CreditCard },
  { id: 'customers', label: 'Customers', Icon: Building2 },
  { id: 'sprints', label: 'Sprints', Icon: CalendarRange },
  { id: 'team', label: 'Team', Icon: Users },
  { id: 'revenue', label: 'Revenue', Icon: DollarSign },
]

const roleById = Object.fromEntries(teamRoles.map((role) => [role.id, role])) as Record<SaasRoleId, typeof teamRoles[number]>

const statusConfig: Record<SprintStatus, { label: string; color: string; Icon: LucideIcon }> = {
  complete: { label: 'Complete', color: '#3fb950', Icon: CheckCircle2 },
  active: { label: 'Active', color: '#e3b341', Icon: Clock },
  planned: { label: 'Planned', color: '#58a6ff', Icon: CircleDot },
}

const metricStatusConfig: Record<MetricStatus, { label: string; color: string; Icon: LucideIcon }> = {
  'on-track': { label: 'On track', color: '#3fb950', Icon: CheckCircle2 },
  watch: { label: 'Watch', color: '#e3b341', Icon: AlertCircle },
  'at-risk': { label: 'At risk', color: '#f85149', Icon: XCircle },
}

const checklistConfig: Record<ChecklistStatus, { label: string; color: string; Icon: LucideIcon }> = {
  done: { label: 'Done', color: '#3fb950', Icon: CheckCircle2 },
  ready: { label: 'Ready', color: '#58a6ff', Icon: ShieldCheck },
  blocked: { label: 'Blocked', color: '#f85149', Icon: XCircle },
}

const subscriptionStatusConfig: Record<SubscriptionStatus, { label: string; color: string }> = {
  trialing: { label: 'Trialing', color: '#e3b341' },
  active: { label: 'Active', color: '#3fb950' },
  past_due: { label: 'Past due', color: '#f85149' },
  expired: { label: 'Expired', color: '#8b949e' },
}

const lifecycleStageConfig: Record<CustomerLifecycleStage, { label: string; color: string }> = {
  lead: { label: 'Lead', color: '#8b949e' },
  trial: { label: 'Trial', color: '#e3b341' },
  activated: { label: 'Activated', color: '#58a6ff' },
  paid: { label: 'Paid', color: '#3fb950' },
  expansion: { label: 'Expansion', color: '#76e3ea' },
  blocked: { label: 'Blocked', color: '#f85149' },
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function roleLabel(roleId: SaasRoleId): string {
  return roleById[roleId]?.title ?? roleId
}

function roleColor(roleId: SaasRoleId): string {
  return roleById[roleId]?.color ?? 'var(--accent)'
}

function PanelHeader() {
  return (
    <div
      style={{
        padding: '11px 12px 10px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(63,185,80,0.18), rgba(88,166,255,0.14))',
            border: '1px solid rgba(118,227,234,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-green)',
            flexShrink: 0,
          }}
        >
          <Rocket size={15} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
            }}
          >
            SaaS Launch Ops
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {launchPositioning.productName} revenue system
          </div>
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, label, Icon, onClick }: {
  active: boolean
  label: string
  Icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '7px 4px',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        background: active ? 'var(--bg-active)' : 'transparent',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        fontSize: 10,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <Icon size={12} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

function SectionTitle({ title, Icon, badge }: { title: string; Icon: LucideIcon; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <Icon size={13} style={{ color: 'var(--text-muted)' }} />
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
        }}
      >
        {title}
      </span>
      {badge && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 9,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  )
}

function ProgressBar({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  return (
    <div style={{ height: 5, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-hover)' }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          borderRadius: 4,
          background: color,
          transition: 'width 0.25s ease',
        }}
      />
    </div>
  )
}

function MetricCard({ label, value, caption, color }: {
  label: string
  value: string
  caption: string
  color: string
}) {
  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '9px 10px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.35 }}>{caption}</div>
    </div>
  )
}

function MetricRow({ metric }: { metric: typeof saasMetrics[number] }) {
  const c = metricStatusConfig[metric.status]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <c.Icon size={13} style={{ color: c.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{metric.label}</span>
          <span style={{ fontSize: 9, color: c.color }}>{c.label}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>{metric.delta}</div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.color, fontFamily: 'var(--font-mono)' }}>
        {formatSaasMetric(metric.value, metric.unit)}
      </div>
    </div>
  )
}

function ChecklistRow({ item }: { item: typeof launchChecklist[number] }) {
  const c = checklistConfig[item.status]
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <c.Icon size={14} style={{ color: c.color, flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>
          {roleLabel(item.owner)} - {item.proof}
        </div>
      </div>
      <span style={{ fontSize: 9, color: c.color, flexShrink: 0 }}>{c.label}</span>
    </div>
  )
}

function SprintStatusPill({ status }: { status: SprintStatus }) {
  const c = statusConfig[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: c.color,
        background: `${c.color}14`,
        border: `1px solid ${c.color}22`,
        borderRadius: 999,
        padding: '1px 6px',
        fontSize: 9,
        fontWeight: 600,
      }}
    >
      <c.Icon size={9} />
      {c.label}
    </span>
  )
}

function SprintListItem({ sprint, active, onClick }: {
  sprint: typeof sprintPlans[number]
  active: boolean
  onClick: () => void
}) {
  const c = statusConfig[sprint.status]
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        gap: 8,
        textAlign: 'left',
        padding: 9,
        borderRadius: 8,
        border: active ? `1px solid ${c.color}66` : '1px solid var(--border)',
        background: active ? `${c.color}10` : 'var(--bg-primary)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          background: `${c.color}16`,
          color: c.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {sprint.number}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {sprint.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.3 }}>
          {sprint.theme}
        </div>
      </div>
    </button>
  )
}

function RoleBadge({ roleId }: { roleId: SaasRoleId }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        color: roleColor(roleId),
        background: `${roleColor(roleId)}12`,
        border: `1px solid ${roleColor(roleId)}20`,
        borderRadius: 999,
        padding: '1px 7px',
        fontSize: 9,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {roleLabel(roleId)}
    </span>
  )
}

function OverviewView({ readiness, sprintProgress, mrr, currentSprintNumber }: {
  readiness: number
  sprintProgress: number
  mrr: number
  currentSprintNumber: number
}) {
  const checklistCounts = getChecklistCounts(launchChecklist)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MetricCard label="Readiness" value={`${readiness}`} caption="launch score" color="var(--accent-green)" />
        <MetricCard label="MRR" value={formatCurrency(mrr)} caption="pricing model" color="var(--accent)" />
        <MetricCard label="Sprint" value={`${currentSprintNumber}/10`} caption={`${sprintProgress}% evolved`} color="#e3b341" />
        <MetricCard label="Blocked" value={`${checklistCounts.blocked}`} caption="launch gates" color="var(--accent-red)" />
      </div>

      <div>
        <SectionTitle title="Commercial Position" Icon={Target} />
        <div
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>
            {launchPositioning.category}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.45 }}>
            {launchPositioning.wedge}
          </div>
          <div style={{ fontSize: 10, color: 'var(--accent-green)', marginTop: 8, lineHeight: 1.4 }}>
            {launchPositioning.revenueHypothesis}
          </div>
        </div>
      </div>

      <div>
        <SectionTitle title="Launch Score" Icon={LineChart} badge={`${readiness}/100`} />
        <ProgressBar value={readiness} color="linear-gradient(90deg, #3fb950, #58a6ff)" />
      </div>

      <div>
        <SectionTitle title="Business Metrics" Icon={BarChart3} />
        <div>{saasMetrics.map((metric) => <MetricRow key={metric.id} metric={metric} />)}</div>
      </div>

      <div>
        <SectionTitle title="Launch Gates" Icon={ShieldCheck} badge={`${checklistCounts.done} done`} />
        <div>{launchChecklist.map((item) => <ChecklistRow key={item.id} item={item} />)}</div>
      </div>
    </div>
  )
}

function CustomerStagePill({ stage }: { stage: CustomerLifecycleStage }) {
  const c = lifecycleStageConfig[stage]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        color: c.color,
        background: `${c.color}14`,
        border: `1px solid ${c.color}26`,
        borderRadius: 999,
        padding: '1px 7px',
        fontSize: 9,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {c.label}
    </span>
  )
}

function ActivationStepRow({ step }: { step: CustomerLifecycleAccount['activationSteps'][number] }) {
  const color = step.complete ? '#3fb950' : '#8b949e'
  return (
    <div style={{ display: 'flex', gap: 6, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      {step.complete ? (
        <CheckCircle2 size={12} style={{ color, flexShrink: 0, marginTop: 1 }} />
      ) : (
        <CircleDot size={12} style={{ color, flexShrink: 0, marginTop: 1 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700 }}>{step.label}</span>
          <RoleBadge roleId={step.owner} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.35 }}>
          {step.impact}
        </div>
      </div>
    </div>
  )
}

function CustomerAccountCard({ account, compact = false }: {
  account: CustomerLifecycleAccount
  compact?: boolean
}) {
  const activation = calculateActivationScore(account)
  const stage = lifecycleStageConfig[account.stage]

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: account.stage === 'blocked' ? '1px solid rgba(248,81,73,0.35)' : '1px solid var(--border)',
        borderRadius: 8,
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 800 }}>{account.companyName}</span>
            <CustomerStagePill stage={account.stage} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.35 }}>
            {getPricingPlan(account.targetPlanId).name} target - {account.seats} seats - {account.daysInStage} days in stage
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 800 }}>
            {formatCurrency(account.dealValueMonthly)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>MRR</div>
        </div>
      </div>

      <div style={{ marginTop: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Activation</span>
          <span style={{ fontSize: 10, color: stage.color, fontFamily: 'var(--font-mono)' }}>{activation}%</span>
        </div>
        <ProgressBar value={activation} color={stage.color} />
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 9, lineHeight: 1.4 }}>
        Signal: {account.lastSignal}
      </div>
      <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 6, lineHeight: 1.4 }}>
        Next: {getNextLifecycleAction(account)}
      </div>

      {account.blockers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {account.blockers.slice(0, compact ? 1 : 3).map((blocker) => (
            <div key={blocker} style={{ display: 'flex', gap: 5, color: '#f85149', fontSize: 10, lineHeight: 1.35 }}>
              <AlertCircle size={10} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{blocker}</span>
            </div>
          ))}
        </div>
      )}

      {!compact && (
        <div style={{ marginTop: 9 }}>
          {account.activationSteps.map((step) => (
            <ActivationStepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  )
}

function CustomersView() {
  const summary = calculateCustomerLifecycleSummary(customerLifecycleAccounts)
  const attention = getAccountsNeedingAttention(customerLifecycleAccounts)
  const stageCounts = getStageCounts(customerLifecycleAccounts).filter((stage) => stage.count > 0)
  const planMix = getTargetPlanMix(customerLifecycleAccounts)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MetricCard label="Weighted Pipe" value={formatCurrency(summary.weightedPipelineMrr)} caption={`${formatCurrency(summary.qualifiedPipelineMrr)} open`} color="var(--accent-green)" />
        <MetricCard label="Activation" value={`${summary.averageActivation}%`} caption="average account score" color="var(--accent)" />
        <MetricCard label="Accounts" value={`${summary.accountCount}`} caption={`${planMix.team + planMix.enterprise} team targets`} color="#e3b341" />
        <MetricCard label="Attention" value={`${summary.attentionCount}`} caption="sales/support queue" color="var(--accent-red)" />
      </div>

      <div>
        <SectionTitle title="Stage Mix" Icon={TrendingUp} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {stageCounts.map((item) => {
            const c = lifecycleStageConfig[item.stage]
            return (
              <div
                key={item.stage}
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 9,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CustomerStagePill stage={item.stage} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.count} account{item.count === 1 ? '' : 's'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: c.color, fontWeight: 800 }}>
                    {formatCurrency(item.valueMonthly)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <SectionTitle title="Attention Queue" Icon={ClipboardCheck} badge={`${attention.length}`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attention.map((account) => (
            <CustomerAccountCard key={`attention-${account.id}`} account={account} compact />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="Trial To Paid Accounts" Icon={Handshake} badge={`${customerLifecycleAccounts.length}`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {customerLifecycleAccounts.map((account) => (
            <CustomerAccountCard key={account.id} account={account} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SprintsView() {
  const currentSprint = getCurrentSprint(sprintPlans)
  const [selectedSprintNumber, setSelectedSprintNumber] = useState(currentSprint?.number ?? 1)
  const sprint = sprintPlans.find((item) => item.number === selectedSprintNumber) ?? sprintPlans[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <SectionTitle title="10 Sprint Evolution" Icon={CalendarRange} badge={`${calculateSprintProgress(sprintPlans)}%`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {sprintPlans.map((item) => (
            <SprintListItem
              key={item.number}
              sprint={item}
              active={item.number === sprint.number}
              onClick={() => setSelectedSprintNumber(item.number)}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SprintStatusPill status={sprint.status} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sprint {sprint.number}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{sprint.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.45 }}>
          {sprint.objective}
        </div>

        <div style={{ marginTop: 12 }}>
          <SectionTitle title="Shipped" Icon={CheckCircle2} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sprint.shipped.map((item) => (
              <div key={item} style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <ArrowRight size={12} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 2 }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <SectionTitle title="Team Decisions" Icon={BriefcaseBusiness} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sprint.conversations.map((conversation, index) => (
              <div
                key={`${conversation.role}-${index}`}
                style={{
                  borderLeft: `2px solid ${roleColor(conversation.role)}`,
                  paddingLeft: 8,
                }}
              >
                <RoleBadge roleId={conversation.role} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.45 }}>
                  {conversation.message}
                </div>
                <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4, lineHeight: 1.4 }}>
                  Decision: {conversation.decision}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <SectionTitle title="Metric Movement" Icon={LineChart} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sprint.metrics.map((item) => (
              <div
                key={item.metric}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 8,
                  fontSize: 10,
                  color: 'var(--text-muted)',
                }}
              >
                <span>{item.metric}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {item.from} to {item.to}
                </span>
              </div>
            ))}
          </div>
        </div>

        {sprint.risks.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <SectionTitle title="Risks" Icon={AlertCircle} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {sprint.risks.map((risk) => (
                <div key={risk} style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {risk}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TeamView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <SectionTitle title="Startup Roles" Icon={Users} badge={`${teamRoles.length} roles`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {teamRoles.map((role) => (
            <div
              key={role.id}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: role.color, boxShadow: `0 0 8px ${role.color}66` }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{role.title}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.45 }}>
                {role.accountability}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, fontSize: 10 }}>
                <span style={{ color: role.color }}>Metric: {role.operatingMetric}</span>
                <span style={{ color: 'var(--text-muted)' }}>Cadence: {role.cadence}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="Operating Cadence" Icon={Layers} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {operatingCadence.map((item) => (
            <div
              key={item.name}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</span>
                <RoleBadge roleId={item.owner} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 6 }}>{item.rhythm}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{item.output}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RevenueView({ mrr, arr }: { mrr: number; arr: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MetricCard label="Modeled MRR" value={formatCurrency(mrr)} caption="plan mix" color="var(--accent-green)" />
        <MetricCard label="Modeled ARR" value={formatCurrency(arr)} caption="before discount" color="var(--accent)" />
      </div>

      <div>
        <SectionTitle title="Subscription Packaging" Icon={DollarSign} badge={`${pricingPlans.length} plans`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pricingPlans.map((plan) => (
            <div
              key={plan.id}
              style={{
                background: plan.highlighted ? 'rgba(88,166,255,0.08)' : 'var(--bg-primary)',
                border: plan.highlighted ? '1px solid rgba(88,166,255,0.28)' : '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{plan.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {plan.billingModel === 'per-seat' ? 'per seat' : 'flat'}
                </span>
              </div>
              <div style={{ fontSize: 18, color: 'var(--accent-green)', fontWeight: 800, marginTop: 5 }}>
                {formatCurrency(plan.priceMonthly)}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}> /mo</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                {plan.targetCustomer}
              </div>
              <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 7 }}>
                Modeled MRR: {formatCurrency(calculatePlanMrr(plan))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {plan.included.slice(0, 3).map((feature) => (
                  <div key={feature} style={{ display: 'flex', gap: 5, fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    <Sparkles size={10} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 1 }} />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: '#e3b341', marginTop: 8, lineHeight: 1.35 }}>
                Motion: {plan.salesMotion}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="Growth Experiments" Icon={Megaphone} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {growthExperiments.map((experiment) => (
            <div
              key={experiment.id}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RoleBadge roleId={experiment.owner} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{experiment.channel}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginTop: 8 }}>{experiment.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.45 }}>
                {experiment.hypothesis}
              </div>
              <div style={{ fontSize: 10, color: 'var(--accent-green)', marginTop: 6, lineHeight: 1.35 }}>
                Success: {experiment.successMetric}
              </div>
              <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 5, lineHeight: 1.35 }}>
                Next: {experiment.nextAction}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function IconButton({ label, Icon, onClick, disabled = false }: {
  label: string
  Icon: LucideIcon
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: disabled ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}
    >
      <Icon size={12} />
    </button>
  )
}

function UsageStepper({ label, value, unit, step, onChange }: {
  label: string
  value: number
  unit: string
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{value} {unit}</div>
      </div>
      <IconButton label={`Decrease ${label}`} Icon={Minus} onClick={() => onChange(Math.max(0, value - step))} />
      <IconButton label={`Increase ${label}`} Icon={Plus} onClick={() => onChange(value + step)} />
    </div>
  )
}

function EntitlementRow({ item, onUpgrade }: {
  item: EntitlementEvaluation
  onUpgrade: (planId: PlanId) => void
}) {
  const color = item.state === 'available'
    ? '#3fb950'
    : item.state === 'near-limit'
      ? '#e3b341'
      : '#f85149'
  const isBoolean = typeof item.used === 'boolean'
  const valueLabel = isBoolean
    ? item.used ? 'Included' : 'Locked'
    : `${item.used}${item.limit === null ? '' : ` / ${item.limit}`} ${item.unit}`

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {item.state === 'available' ? (
          <Unlock size={13} style={{ color, flexShrink: 0 }} />
        ) : (
          <Lock size={13} style={{ color, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          {item.label}
        </span>
        <span style={{ fontSize: 10, color, fontFamily: 'var(--font-mono)' }}>{valueLabel}</span>
      </div>
      {!isBoolean && item.limit !== null && (
        <div style={{ marginTop: 8 }}>
          <ProgressBar value={Math.min(100, item.percentUsed)} color={color} />
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.4 }}>
        {item.reason}
      </div>
      {item.upgradePlanId && (
        <button
          onClick={() => onUpgrade(item.upgradePlanId!)}
          style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 8px',
            borderRadius: 6,
            border: `1px solid ${color}33`,
            background: `${color}12`,
            color,
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Upgrade to {getPricingPlan(item.upgradePlanId).name}
          <ArrowRight size={10} />
        </button>
      )}
    </div>
  )
}

function BillingView() {
  const account = useSubscriptionStore((s) => s.account)
  const events = useSubscriptionStore((s) => s.events)
  const setPlan = useSubscriptionStore((s) => s.setPlan)
  const setSeats = useSubscriptionStore((s) => s.setSeats)
  const setStatus = useSubscriptionStore((s) => s.setStatus)
  const setUsage = useSubscriptionStore((s) => s.setUsage)
  const recordCheckoutIntent = useSubscriptionStore((s) => s.recordCheckoutIntent)
  const resetSubscription = useSubscriptionStore((s) => s.resetSubscription)

  const accountMrr = calculateAccountMrr(account)
  const status = subscriptionStatusConfig[account.status]
  const health = getSubscriptionHealth(account)
  const evaluations = evaluateEntitlements(account)
  const recommendations = getUpgradeRecommendations(account)
  const billingEnv = {
    VITE_ORION_CHECKOUT_URL: import.meta.env.VITE_ORION_CHECKOUT_URL,
    VITE_ORION_BILLING_MODE: import.meta.env.VITE_ORION_BILLING_MODE,
    VITE_ORION_WEBHOOK_CONFIGURED: import.meta.env.VITE_ORION_WEBHOOK_CONFIGURED,
    VITE_ORION_LICENSE_SIGNING_KEY_CONFIGURED: import.meta.env.VITE_ORION_LICENSE_SIGNING_KEY_CONFIGURED,
  }
  const origin = typeof window === 'undefined' ? 'http://localhost:5174' : window.location.origin
  const billingProvider = getBillingProviderStatus(billingEnv)
  const checkoutIntent = createCheckoutSessionIntent(account, origin, billingEnv)
  const licenseSnapshot = createLicenseSnapshot(account, new Date(), billingEnv)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MetricCard label="Account MRR" value={formatCurrency(accountMrr)} caption={`${account.seats} seat${account.seats === 1 ? '' : 's'}`} color="var(--accent-green)" />
        <MetricCard label="Status" value={status.label} caption={health.reason} color={status.color} />
      </div>

      <div>
        <SectionTitle title="Account State" Icon={CreditCard} badge={account.companyName} />
        <div
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{account.companyName}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{account.billingEmail}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
            {(Object.keys(subscriptionStatusConfig) as SubscriptionStatus[]).map((item) => {
              const config = subscriptionStatusConfig[item]
              const active = account.status === item
              return (
                <button
                  key={item}
                  onClick={() => setStatus(item)}
                  style={{
                    padding: '4px 7px',
                    borderRadius: 6,
                    border: active ? `1px solid ${config.color}` : '1px solid var(--border)',
                    background: active ? `${config.color}14` : 'transparent',
                    color: active ? config.color : 'var(--text-muted)',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {config.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div>
        <SectionTitle title="Plan and Seats" Icon={DollarSign} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pricingPlans.map((plan) => {
            const active = account.planId === plan.id
            return (
              <button
                key={plan.id}
                onClick={() => setPlan(plan.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textAlign: 'left',
                  padding: 10,
                  borderRadius: 8,
                  border: active ? '1px solid rgba(88,166,255,0.5)' : '1px solid var(--border)',
                  background: active ? 'rgba(88,166,255,0.1)' : 'var(--bg-primary)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{plan.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{plan.targetCustomer}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {formatCurrency(plan.priceMonthly)}
                </div>
              </button>
            )
          })}
        </div>
        <div
          style={{
            marginTop: 8,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 700 }}>Seats</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Per-seat billing applies to Team.</div>
          </div>
          <IconButton label="Decrease seats" Icon={Minus} disabled={account.planId === 'solo'} onClick={() => setSeats(account.seats - 1)} />
          <span style={{ width: 26, textAlign: 'center', fontSize: 13, color: 'var(--text-primary)', fontWeight: 800 }}>{account.seats}</span>
          <IconButton label="Increase seats" Icon={Plus} disabled={account.planId === 'solo'} onClick={() => setSeats(account.seats + 1)} />
        </div>
      </div>

      <div>
        <SectionTitle title="Usage Simulator" Icon={Activity} />
        <div
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '2px 10px',
          }}
        >
          <UsageStepper label="AI providers" value={account.usage.providerSlots} unit="slots" step={1} onChange={(value) => setUsage({ providerSlots: value })} />
          <UsageStepper label="Workspaces" value={account.usage.workspaces} unit="active" step={1} onChange={(value) => setUsage({ workspaces: value })} />
          <UsageStepper label="Team members" value={account.usage.teamMembers} unit="members" step={1} onChange={(value) => setUsage({ teamMembers: value })} />
          <UsageStepper label="History retention" value={account.usage.historyDays} unit="days" step={7} onChange={(value) => setUsage({ historyDays: value })} />
          <UsageStepper label="AI spend" value={account.usage.aiSpendUsd} unit="USD" step={25} onChange={(value) => setUsage({ aiSpendUsd: value })} />
        </div>
      </div>

      <div>
        <SectionTitle title="Billing Provider" Icon={CreditCard} badge={billingProvider.mode} />
        <div
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Provider</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 800, textTransform: 'capitalize' }}>
                {billingProvider.provider}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Checkout</div>
              <div style={{ fontSize: 12, color: checkoutIntent.ready ? '#3fb950' : '#e3b341', fontWeight: 800 }}>
                {checkoutIntent.ready ? 'Hosted' : 'Manual'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 9, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Webhook</div>
              <div style={{ fontSize: 11, color: billingProvider.webhookConfigured ? '#3fb950' : '#8b949e', fontWeight: 700 }}>
                {billingProvider.webhookConfigured ? 'Configured' : 'Pending'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>License Signing</div>
              <div style={{ fontSize: 11, color: billingProvider.licenseSigningKeyConfigured ? '#3fb950' : '#8b949e', fontWeight: 700 }}>
                {billingProvider.licenseSigningKeyConfigured ? 'Configured' : 'Pending'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 9 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>License fingerprint</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {licenseSnapshot.fingerprint}
            </div>
          </div>
          {billingProvider.warnings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 9 }}>
              {billingProvider.warnings.map((warning) => (
                <div key={warning} style={{ display: 'flex', gap: 5, color: '#e3b341', fontSize: 10, lineHeight: 1.35 }}>
                  <AlertCircle size={10} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <SectionTitle title="Upgrade Recommendations" Icon={Sparkles} badge={`${recommendations.length}`} />
        {recommendations.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>No upgrade pressure detected.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recommendations.slice(0, 3).map((item) => (
              <EntitlementRow key={`rec-${item.id}`} item={item} onUpgrade={setPlan} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle title="Entitlement Matrix" Icon={ShieldCheck} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {evaluations.map((item) => (
            <EntitlementRow key={item.id} item={item} onUpgrade={setPlan} />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="Billing Actions" Icon={CreditCard} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              recordCheckoutIntent(checkoutIntent)
              if (checkoutIntent.url) {
                window.open(checkoutIntent.url, '_blank', 'noopener,noreferrer')
              }
            }}
            style={{
              flex: 1,
              display: 'inline-flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              padding: '7px 8px',
              borderRadius: 8,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <CreditCard size={12} />
            Checkout
          </button>
          <button
            onClick={resetSubscription}
            style={{
              width: 36,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Reset subscription demo state"
            aria-label="Reset subscription demo state"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div>
        <SectionTitle title="Billing Event Log" Icon={Clock} badge={`${events.length}`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {events.slice(0, 6).map((item) => (
            <div
              key={item.id}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 9,
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {new Date(item.timestamp).toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                {item.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SaasOpsPanel() {
  const [view, setView] = useState<View>('overview')

  const summary = useMemo(() => {
    const mrr = calculateTotalMrr(pricingPlans)
    const arr = calculateAnnualRevenue(pricingPlans)
    const readiness = calculateReadinessScore(saasMetrics, launchChecklist)
    const sprintProgress = calculateSprintProgress(sprintPlans)
    const currentSprint = getCurrentSprint(sprintPlans)
    return { mrr, arr, readiness, sprintProgress, currentSprint }
  }, [])

  useEffect(() => {
    const openBilling = () => setView('billing')
    window.addEventListener('orion:saas-billing-tab', openBilling)
    return () => window.removeEventListener('orion:saas-billing-tab', openBilling)
  }, [])

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      <PanelHeader />
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
        }}
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={view === tab.id}
            label={tab.label}
            Icon={tab.Icon}
            onClick={() => setView(tab.id)}
          />
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {view === 'overview' && (
          <OverviewView
            readiness={summary.readiness}
            sprintProgress={summary.sprintProgress}
            mrr={summary.mrr}
            currentSprintNumber={summary.currentSprint?.number ?? 0}
          />
        )}
        {view === 'billing' && <BillingView />}
        {view === 'customers' && <CustomersView />}
        {view === 'sprints' && <SprintsView />}
        {view === 'team' && <TeamView />}
        {view === 'revenue' && <RevenueView mrr={summary.mrr} arr={summary.arr} />}
      </div>
    </div>
  )
}
