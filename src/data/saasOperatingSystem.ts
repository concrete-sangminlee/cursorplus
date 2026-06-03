export type SaasRoleId =
  | 'product-owner'
  | 'planner'
  | 'frontend'
  | 'backend'
  | 'designer'
  | 'marketer'
  | 'sales'
  | 'support'
  | 'devops'

export type SprintStatus = 'complete' | 'active' | 'planned'
export type MetricStatus = 'on-track' | 'watch' | 'at-risk'
export type ChecklistStatus = 'done' | 'ready' | 'blocked'
export type BillingModel = 'flat' | 'per-seat'
export type PlanId = 'solo' | 'team' | 'enterprise'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'expired'
export type SupportTier = 'community' | 'priority' | 'dedicated'
export type FeatureGateId =
  | 'provider-slots'
  | 'workspaces'
  | 'team-members'
  | 'agent-history'
  | 'ai-budget'
  | 'audit-logs'
  | 'sso'
  | 'private-updates'
export type CustomerLifecycleStage = 'lead' | 'trial' | 'activated' | 'paid' | 'expansion' | 'blocked'

export interface TeamRole {
  id: SaasRoleId
  title: string
  accountability: string
  operatingMetric: string
  cadence: string
  color: string
}

export interface PricingPlan {
  id: PlanId
  name: string
  priceMonthly: number
  billingModel: BillingModel
  targetCustomer: string
  projectedAccounts: number
  averageSeats: number
  included: string[]
  limits: string[]
  salesMotion: string
  highlighted?: boolean
}

export interface PlanEntitlements {
  planId: PlanId
  providerSlots: number
  workspaceLimit: number | null
  teamMembers: number
  historyDays: number
  aiBudgetUsd: number
  auditLogs: boolean
  sso: boolean
  privateUpdateChannel: boolean
  supportTier: SupportTier
}

export interface SubscriptionUsage {
  providerSlots: number
  workspaces: number
  teamMembers: number
  historyDays: number
  aiSpendUsd: number
}

export interface SubscriptionAccount {
  companyName: string
  billingEmail: string
  planId: PlanId
  status: SubscriptionStatus
  seats: number
  trialEndsAt: string
  renewalDate: string
  usage: SubscriptionUsage
  updatedAt: string
}

export interface CustomerActivationStep {
  id: string
  label: string
  owner: SaasRoleId
  complete: boolean
  impact: string
}

export interface CustomerLifecycleAccount {
  id: string
  companyName: string
  targetPlanId: PlanId
  stage: CustomerLifecycleStage
  owner: SaasRoleId
  seats: number
  dealValueMonthly: number
  daysInStage: number
  lastSignal: string
  nextAction: string
  blockers: string[]
  activationSteps: CustomerActivationStep[]
}

export interface SaasMetric {
  id: string
  label: string
  value: number
  target: number
  unit: 'usd' | 'percent' | 'count' | 'days'
  delta: string
  owner: SaasRoleId
  status: MetricStatus
}

export interface SprintMetricChange {
  metric: string
  from: string
  to: string
}

export interface SprintConversation {
  role: SaasRoleId
  message: string
  decision: string
}

export interface SprintPlan {
  number: number
  name: string
  status: SprintStatus
  theme: string
  objective: string
  shipped: string[]
  conversations: SprintConversation[]
  metrics: SprintMetricChange[]
  risks: string[]
}

export interface OperatingCadence {
  name: string
  owner: SaasRoleId
  rhythm: string
  output: string
}

export interface LaunchChecklistItem {
  id: string
  label: string
  owner: SaasRoleId
  status: ChecklistStatus
  proof: string
}

export interface GrowthExperiment {
  id: string
  name: string
  channel: string
  owner: SaasRoleId
  hypothesis: string
  successMetric: string
  nextAction: string
}

export const launchPositioning = {
  generatedAt: '2026-06-03',
  productName: 'Orion IDE',
  category: 'AI-native desktop IDE and terminal assistant',
  buyer: 'Engineering managers and senior developers in teams that want local-first AI coding workflows.',
  wedge: 'A cross-platform IDE plus CLI with provider switching, local model support, agent workflows, and workspace-level automation.',
  revenueHypothesis:
    'Sell team subscriptions around secure AI orchestration, workspace automation, usage controls, and supportable desktop distribution.',
}

export const teamRoles: TeamRole[] = [
  {
    id: 'product-owner',
    title: 'Product Owner',
    accountability: 'Turns buyer pain into paid scope and sprint acceptance criteria.',
    operatingMetric: 'Activation to paid conversion',
    cadence: 'Daily scope review, weekly roadmap tradeoff',
    color: '#58a6ff',
  },
  {
    id: 'planner',
    title: 'Product Planner',
    accountability: 'Maintains roadmap, dependencies, release gates, and pricing packaging.',
    operatingMetric: 'Sprint predictability',
    cadence: 'Sprint planning, mid-sprint dependency review',
    color: '#e3b341',
  },
  {
    id: 'frontend',
    title: 'Frontend Developer',
    accountability: 'Builds IDE surfaces, onboarding flows, and measurable product usage loops.',
    operatingMetric: 'Task completion rate',
    cadence: 'Daily implementation sync, design review twice weekly',
    color: '#76e3ea',
  },
  {
    id: 'backend',
    title: 'Backend Developer',
    accountability: 'Builds licensing, entitlement, sync, billing, audit, and AI provider infrastructure.',
    operatingMetric: 'API reliability',
    cadence: 'Daily API contract sync, weekly security review',
    color: '#3fb950',
  },
  {
    id: 'designer',
    title: 'Designer',
    accountability: 'Keeps dense IDE workflows usable, consistent, and ready for repeated daily use.',
    operatingMetric: 'Time to first value',
    cadence: 'Prototype review, usability review, design QA',
    color: '#bc8cff',
  },
  {
    id: 'marketer',
    title: 'Marketer',
    accountability: 'Owns positioning, launch pages, messaging, lifecycle campaigns, and experiments.',
    operatingMetric: 'Qualified trial starts',
    cadence: 'Weekly funnel review, campaign retro',
    color: '#f78166',
  },
  {
    id: 'sales',
    title: 'Sales',
    accountability: 'Qualifies teams, closes paid pilots, and feeds objections into product.',
    operatingMetric: 'Pipeline coverage',
    cadence: 'Deal review, customer objection review',
    color: '#f85149',
  },
  {
    id: 'support',
    title: 'Support',
    accountability: 'Turns onboarding friction and incidents into product feedback and help content.',
    operatingMetric: 'First response time',
    cadence: 'Daily support triage, weekly knowledge-base update',
    color: '#79c0ff',
  },
  {
    id: 'devops',
    title: 'DevOps',
    accountability: 'Owns CI, release signing, crash visibility, updater health, and service uptime.',
    operatingMetric: 'Release gate pass rate',
    cadence: 'Release readiness review, incident retro',
    color: '#8b949e',
  },
]

export const pricingPlans: PricingPlan[] = [
  {
    id: 'solo',
    name: 'Solo Pro',
    priceMonthly: 19,
    billingModel: 'flat',
    targetCustomer: 'Independent developers and consultants',
    projectedAccounts: 220,
    averageSeats: 1,
    salesMotion: 'Self-serve trial to card checkout',
    included: ['Desktop IDE', 'CLI commands', '2 AI providers', 'Local model mode'],
    limits: ['1 workspace', '7-day activity history', 'Community support'],
  },
  {
    id: 'team',
    name: 'Team',
    priceMonthly: 39,
    billingModel: 'per-seat',
    targetCustomer: '5-50 developer teams',
    projectedAccounts: 54,
    averageSeats: 8,
    salesMotion: 'Product-led trial with founder-assisted onboarding',
    included: ['Shared workspaces', 'Agent task history', 'Team policy controls', 'Priority support'],
    limits: ['50 workspaces', '90-day activity history', 'Standard SLA'],
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 249,
    billingModel: 'flat',
    targetCustomer: 'Security-conscious engineering organizations',
    projectedAccounts: 12,
    averageSeats: 35,
    salesMotion: 'Sales-led annual contract',
    included: ['SSO', 'Audit logs', 'Private update channel', 'Admin reporting'],
    limits: ['Custom workspaces', '1-year activity history', 'Dedicated support'],
  },
]

export const planEntitlements: Record<PlanId, PlanEntitlements> = {
  solo: {
    planId: 'solo',
    providerSlots: 2,
    workspaceLimit: 1,
    teamMembers: 1,
    historyDays: 7,
    aiBudgetUsd: 25,
    auditLogs: false,
    sso: false,
    privateUpdateChannel: false,
    supportTier: 'community',
  },
  team: {
    planId: 'team',
    providerSlots: 8,
    workspaceLimit: 50,
    teamMembers: 50,
    historyDays: 90,
    aiBudgetUsd: 350,
    auditLogs: true,
    sso: false,
    privateUpdateChannel: false,
    supportTier: 'priority',
  },
  enterprise: {
    planId: 'enterprise',
    providerSlots: 25,
    workspaceLimit: null,
    teamMembers: 500,
    historyDays: 365,
    aiBudgetUsd: 2500,
    auditLogs: true,
    sso: true,
    privateUpdateChannel: true,
    supportTier: 'dedicated',
  },
}

export const demoSubscriptionAccount: SubscriptionAccount = {
  companyName: 'Northstar Labs',
  billingEmail: 'ops@northstar.example',
  planId: 'team',
  status: 'trialing',
  seats: 8,
  trialEndsAt: '2026-06-17T00:00:00.000Z',
  renewalDate: '2026-07-03T00:00:00.000Z',
  usage: {
    providerSlots: 6,
    workspaces: 18,
    teamMembers: 7,
    historyDays: 42,
    aiSpendUsd: 214,
  },
  updatedAt: '2026-06-03T00:00:00.000Z',
}

export const customerLifecycleAccounts: CustomerLifecycleAccount[] = [
  {
    id: 'northstar-labs',
    companyName: 'Northstar Labs',
    targetPlanId: 'team',
    stage: 'trial',
    owner: 'sales',
    seats: 8,
    dealValueMonthly: 312,
    daysInStage: 5,
    lastSignal: 'Engineering manager asked for provider budgets before inviting the full team.',
    nextAction: 'Run a founder-assisted onboarding call focused on AI budget guardrails and audit logs.',
    blockers: ['Needs approval for managed AI spend cap'],
    activationSteps: [
      { id: 'workspace', label: 'Workspace created', owner: 'frontend', complete: true, impact: 'Confirms basic team setup.' },
      { id: 'provider', label: 'AI provider connected', owner: 'backend', complete: true, impact: 'Unlocks first useful task.' },
      { id: 'task', label: 'First AI task completed', owner: 'designer', complete: true, impact: 'Demonstrates time to value.' },
      { id: 'invite', label: 'Team invited', owner: 'sales', complete: false, impact: 'Creates Team-plan conversion evidence.' },
    ],
  },
  {
    id: 'hexaforge',
    companyName: 'HexaForge',
    targetPlanId: 'team',
    stage: 'activated',
    owner: 'product-owner',
    seats: 12,
    dealValueMonthly: 468,
    daysInStage: 3,
    lastSignal: 'Two senior developers used agent history during a migration review.',
    nextAction: 'Send Team checkout link with migration workflow recap and 12-seat quote.',
    blockers: [],
    activationSteps: [
      { id: 'workspace', label: 'Workspace created', owner: 'frontend', complete: true, impact: 'Confirms team setup.' },
      { id: 'provider', label: 'AI provider connected', owner: 'backend', complete: true, impact: 'Connects product to existing AI workflow.' },
      { id: 'task', label: 'First AI task completed', owner: 'designer', complete: true, impact: 'Shows developer value.' },
      { id: 'team-review', label: 'Team review completed', owner: 'sales', complete: true, impact: 'Creates conversion proof.' },
    ],
  },
  {
    id: 'lambdabank',
    companyName: 'LambdaBank',
    targetPlanId: 'enterprise',
    stage: 'blocked',
    owner: 'support',
    seats: 45,
    dealValueMonthly: 3200,
    daysInStage: 12,
    lastSignal: 'Security team requested SSO, private updates, and signed release evidence.',
    nextAction: 'Package enterprise security response with release-signing evidence and SSO scope.',
    blockers: ['SSO not implemented', 'Release signing evidence incomplete', 'Security FAQ missing procurement-ready language'],
    activationSteps: [
      { id: 'workspace', label: 'Workspace created', owner: 'frontend', complete: true, impact: 'Confirms local evaluation.' },
      { id: 'provider', label: 'Local model connected', owner: 'backend', complete: true, impact: 'Supports privacy promise.' },
      { id: 'security', label: 'Security review answered', owner: 'devops', complete: false, impact: 'Required for procurement.' },
      { id: 'pilot', label: 'Paid pilot approved', owner: 'sales', complete: false, impact: 'Moves Enterprise deal to contract.' },
    ],
  },
  {
    id: 'cloudsmith-studio',
    companyName: 'Cloudsmith Studio',
    targetPlanId: 'solo',
    stage: 'lead',
    owner: 'marketer',
    seats: 1,
    dealValueMonthly: 19,
    daysInStage: 2,
    lastSignal: 'Consultant downloaded the app after reading a local-model workflow article.',
    nextAction: 'Send Solo Pro trial email with local model setup and first automation recipe.',
    blockers: [],
    activationSteps: [
      { id: 'download', label: 'App downloaded', owner: 'marketer', complete: true, impact: 'Creates self-serve entry point.' },
      { id: 'workspace', label: 'Workspace created', owner: 'frontend', complete: false, impact: 'Starts activation.' },
      { id: 'provider', label: 'AI provider connected', owner: 'backend', complete: false, impact: 'Unlocks workflow value.' },
      { id: 'checkout', label: 'Checkout opened', owner: 'product-owner', complete: false, impact: 'Creates paid conversion.' },
    ],
  },
  {
    id: 'arclight-systems',
    companyName: 'Arclight Systems',
    targetPlanId: 'enterprise',
    stage: 'expansion',
    owner: 'sales',
    seats: 80,
    dealValueMonthly: 6400,
    daysInStage: 8,
    lastSignal: 'Platform team wants private update channel before rolling out to all developers.',
    nextAction: 'Turn private updates and admin reporting into annual expansion proposal.',
    blockers: ['Private update channel needs implementation plan'],
    activationSteps: [
      { id: 'pilot', label: 'Paid pilot active', owner: 'sales', complete: true, impact: 'Confirms budget owner.' },
      { id: 'audit', label: 'Audit workflow validated', owner: 'backend', complete: true, impact: 'Supports Enterprise value.' },
      { id: 'admin', label: 'Admin reporting reviewed', owner: 'product-owner', complete: false, impact: 'Expands to platform team.' },
      { id: 'rollout', label: 'Rollout plan agreed', owner: 'planner', complete: false, impact: 'Moves pilot to annual deal.' },
    ],
  },
]

export const saasMetrics: SaasMetric[] = [
  {
    id: 'mrr',
    label: 'MRR model',
    value: 24016,
    target: 25000,
    unit: 'usd',
    delta: '+28% from paid pilot plan',
    owner: 'product-owner',
    status: 'watch',
  },
  {
    id: 'trial-starts',
    label: 'Qualified trials',
    value: 410,
    target: 500,
    unit: 'count',
    delta: '+76 from launch experiments',
    owner: 'marketer',
    status: 'watch',
  },
  {
    id: 'activation',
    label: 'Activation',
    value: 42,
    target: 50,
    unit: 'percent',
    delta: 'First workspace plus first AI task',
    owner: 'designer',
    status: 'watch',
  },
  {
    id: 'retention',
    label: 'Week-4 retention',
    value: 31,
    target: 35,
    unit: 'percent',
    delta: 'Improved by team templates',
    owner: 'frontend',
    status: 'on-track',
  },
  {
    id: 'sla',
    label: 'Release gate pass',
    value: 92,
    target: 95,
    unit: 'percent',
    delta: 'Blocked by packaging signing gaps',
    owner: 'devops',
    status: 'watch',
  },
  {
    id: 'support',
    label: 'First response',
    value: 1.8,
    target: 2,
    unit: 'days',
    delta: 'Founder-assisted support rotation',
    owner: 'support',
    status: 'on-track',
  },
]

export const sprintPlans: SprintPlan[] = [
  {
    number: 1,
    name: 'Commercial Readiness',
    status: 'complete',
    theme: 'Turn the open-source IDE into a sellable product surface.',
    objective: 'Make packaging, pricing, onboarding, and success criteria explicit enough to start paid pilots.',
    shipped: [
      'Defined Solo Pro, Team, and Enterprise subscription tiers.',
      'Added launch readiness gates for billing, support, release signing, and analytics.',
      'Mapped existing IDE/CLI strengths to paid buyer value.',
    ],
    conversations: [
      {
        role: 'product-owner',
        message: 'The buyer is not paying for another editor; they pay for governed AI workflows their team can actually adopt.',
        decision: 'Prioritize team policy, provider controls, and activation over cosmetic editor work.',
      },
      {
        role: 'marketer',
        message: 'The launch message needs a narrower promise than "AI IDE".',
        decision: 'Use "local-first AI coding workspace for teams" as the paid-positioning anchor.',
      },
    ],
    metrics: [
      { metric: 'Paid pilot readiness', from: '0%', to: '65%' },
      { metric: 'Pricing clarity', from: 'unpriced', to: '3 tiers' },
    ],
    risks: ['No live billing integration yet', 'Telemetry remains local-first and needs explicit consent copy'],
  },
  {
    number: 2,
    name: 'Activation Funnel',
    status: 'complete',
    theme: 'Reduce time to first value for a new paying team.',
    objective: 'Guide a trial user from first install to first workspace, first AI task, and first team invite.',
    shipped: [
      'Activation checklist for workspace, provider, AI task, terminal, and Git setup.',
      'Lifecycle events for trial start, first task, and invite intent.',
      'Support playbook for activation blockers.',
    ],
    conversations: [
      {
        role: 'designer',
        message: 'The IDE must feel operational, not like a marketing page.',
        decision: 'Keep onboarding inside the existing workbench and avoid full-screen sales surfaces.',
      },
      {
        role: 'frontend',
        message: 'We can use the existing welcome and command palette patterns without introducing new navigation.',
        decision: 'Expose activation in the left activity bar and command palette.',
      },
    ],
    metrics: [
      { metric: 'Time to first AI task', from: 'unknown', to: '< 12 minutes target' },
      { metric: 'Activation definition', from: 'missing', to: 'workspace + AI task + save' },
    ],
    risks: ['Provider setup friction can still stop activation', 'No hosted account system yet'],
  },
  {
    number: 3,
    name: 'Team Workspaces',
    status: 'complete',
    theme: 'Make the product credible for small engineering teams.',
    objective: 'Specify collaboration, entitlement, and task-history needs for a Team subscription.',
    shipped: [
      'Team workspace entitlement model.',
      'Shared agent task history requirement.',
      'Role-based permissions backlog for owner, maintainer, and member.',
    ],
    conversations: [
      {
        role: 'backend',
        message: 'Team value needs identity, entitlement, and audit records before cloud sync.',
        decision: 'Build the contract around workspace membership and action logs first.',
      },
      {
        role: 'sales',
        message: 'Managers ask who changed what and which model touched the code.',
        decision: 'Make audit history a Team feature and admin reporting an Enterprise feature.',
      },
    ],
    metrics: [
      { metric: 'Team buyer objections answered', from: '2/8', to: '6/8' },
      { metric: 'Account expansion path', from: 'none', to: 'Solo to Team' },
    ],
    risks: ['Cloud sync scope can expand quickly', 'Permissions need security review before release'],
  },
  {
    number: 4,
    name: 'Billing and Entitlements',
    status: 'active',
    theme: 'Connect subscription state to the product experience.',
    objective: 'Implement account state, license checks, plan limits, and in-app upgrade moments.',
    shipped: [
      'Entitlement map for provider count, workspace count, history retention, and support tier.',
      'Billing state UX states for trialing, active, past due, and expired.',
      'Upgrade triggers tied to team invite, audit history, and policy controls.',
    ],
    conversations: [
      {
        role: 'backend',
        message: 'License checks need to fail closed for paid-only admin features, but not lock users out of local editing.',
        decision: 'Gate team and cloud features while preserving local editor access.',
      },
      {
        role: 'product-owner',
        message: 'Upgrade prompts must come from real usage limits, not random banners.',
        decision: 'Attach paid prompts only to plan-limit boundaries.',
      },
    ],
    metrics: [
      { metric: 'Entitlement coverage', from: '0%', to: '80% designed' },
      { metric: 'Self-serve checkout scope', from: 'missing', to: 'defined' },
    ],
    risks: ['Live payment provider credentials and webhook verification still need production setup', 'Offline license cache policy needs legal/security review'],
  },
  {
    number: 5,
    name: 'Admin and Security',
    status: 'planned',
    theme: 'Make Enterprise procurement plausible.',
    objective: 'Add the controls that let teams approve AI usage without bypassing security.',
    shipped: [
      'SSO and SCIM requirements.',
      'Model allowlist and API-key custody policy.',
      'Audit export and data retention requirements.',
    ],
    conversations: [
      {
        role: 'devops',
        message: 'Enterprise buyers will ask for signed releases, update channels, and incident evidence.',
        decision: 'Make release signing and update integrity part of the Enterprise readiness gate.',
      },
      {
        role: 'support',
        message: 'Security questions repeat across pilots.',
        decision: 'Create a security FAQ and map every answer to product controls.',
      },
    ],
    metrics: [
      { metric: 'Security questionnaire coverage', from: '20%', to: '75% target' },
      { metric: 'Enterprise pilot blockers', from: '7', to: '< 3 target' },
    ],
    risks: ['SSO can dominate sprint capacity', 'Audit retention needs storage cost modeling'],
  },
  {
    number: 6,
    name: 'Usage Analytics and Unit Economics',
    status: 'planned',
    theme: 'Operate the subscription business from product evidence.',
    objective: 'Track activation, retention, AI usage cost, support load, and plan expansion without violating local-first trust.',
    shipped: [
      'Consent-based telemetry model.',
      'Local analytics export for privacy-sensitive teams.',
      'Gross margin model by plan and AI provider behavior.',
    ],
    conversations: [
      {
        role: 'marketer',
        message: 'We need funnel data, but trust is the brand promise.',
        decision: 'Make analytics opt-in, explain each event class, and keep local-only mode first-class.',
      },
      {
        role: 'backend',
        message: 'AI cost can erase subscription margin if team usage is uncapped.',
        decision: 'Expose provider budget controls and plan-level usage alerts.',
      },
    ],
    metrics: [
      { metric: 'Gross margin visibility', from: 'manual estimate', to: 'dashboard target' },
      { metric: 'Event consent clarity', from: 'not present', to: 'explicit opt-in' },
    ],
    risks: ['Analytics copy must not imply surveillance', 'Cost controls need clear user education'],
  },
  {
    number: 7,
    name: 'Growth Loops',
    status: 'planned',
    theme: 'Turn satisfied developers into qualified team leads.',
    objective: 'Ship referral, template, and content loops that create trial starts from actual IDE usage.',
    shipped: [
      'Workspace template gallery tied to engineering workflows.',
      'Shareable automation recipes.',
      'Referral trigger after repeated successful AI task completion.',
    ],
    conversations: [
      {
        role: 'marketer',
        message: 'The best growth asset is a workflow that saves a team time and can be shared.',
        decision: 'Use agent recipes and project templates as acquisition assets.',
      },
      {
        role: 'designer',
        message: 'Growth prompts inside an IDE can become noisy fast.',
        decision: 'Only show referral/share actions after a successful task outcome.',
      },
    ],
    metrics: [
      { metric: 'Organic trial starts', from: '0', to: '120/month target' },
      { metric: 'Recipe shares', from: '0', to: '300/month target' },
    ],
    risks: ['Recipes must feel useful before promotional', 'Template quality needs ownership'],
  },
  {
    number: 8,
    name: 'Reliability and Support Operations',
    status: 'planned',
    theme: 'Make releases and support repeatable.',
    objective: 'Codify incident response, crash triage, release gates, rollback, and support SLAs.',
    shipped: [
      'Release train with canary and stable channels.',
      'Incident severity matrix.',
      'Support macros for licensing, provider setup, update failures, and terminal issues.',
    ],
    conversations: [
      {
        role: 'support',
        message: 'Every paid plan needs a response expectation the team can actually meet.',
        decision: 'Tie support SLA to plan tier and weekly staffing capacity.',
      },
      {
        role: 'devops',
        message: 'Desktop updater failures can become churn drivers.',
        decision: 'Measure update success rate and add rollback instructions to release QA.',
      },
    ],
    metrics: [
      { metric: 'Update success rate', from: 'unknown', to: '98% target' },
      { metric: 'P1 response', from: 'ad hoc', to: '< 4h target' },
    ],
    risks: ['Crash reporting needs privacy review', 'Canary channel needs enough active testers'],
  },
  {
    number: 9,
    name: 'Integrations and Ecosystem',
    status: 'planned',
    theme: 'Fit into engineering systems teams already use.',
    objective: 'Prioritize GitHub, GitLab, Slack, Jira, and model-provider integrations that support team adoption.',
    shipped: [
      'Integration priority matrix.',
      'Webhook contract for agent task completion.',
      'Plugin marketplace quality bar.',
    ],
    conversations: [
      {
        role: 'sales',
        message: 'Teams ask how this fits into PR review, ticket planning, and incident workflows.',
        decision: 'Start with GitHub PR and Jira issue handoff before broad marketplace scope.',
      },
      {
        role: 'frontend',
        message: 'Integrations need a quiet configuration UI, not a marketplace landing page.',
        decision: 'Expose integrations through settings and workspace-level status panels.',
      },
    ],
    metrics: [
      { metric: 'Integration-assisted activations', from: '0%', to: '25% target' },
      { metric: 'Paid pilot integration blockers', from: '5', to: '< 2 target' },
    ],
    risks: ['Integration maintenance can outpace team size', 'OAuth and token storage need audits'],
  },
  {
    number: 10,
    name: 'Scale and International Launch',
    status: 'planned',
    theme: 'Prepare the startup for broader paid distribution.',
    objective: 'Turn the product into a repeatable business with localization, partner channels, compliance, and expansion motions.',
    shipped: [
      'Localization priorities for Korean, Japanese, Chinese, and English customers.',
      'Partner onboarding checklist for consultancies and developer-tool resellers.',
      'Compliance roadmap for enterprise procurement.',
    ],
    conversations: [
      {
        role: 'product-owner',
        message: 'The product must keep its local-first promise while becoming operationally scalable.',
        decision: 'Keep local mode as the default and make cloud/team features explicit upgrades.',
      },
      {
        role: 'planner',
        message: 'Sprint 10 should not add random enterprise features; it should stabilize the operating model.',
        decision: 'Close the loop with roadmap governance, compliance sequencing, and expansion playbooks.',
      },
    ],
    metrics: [
      { metric: 'International-ready surfaces', from: 'partial i18n', to: 'top 4 locales target' },
      { metric: 'Annual contract pipeline', from: '$0', to: '$250k target' },
    ],
    risks: ['Localization adds support burden', 'Compliance sequence must match actual buyer demand'],
  },
]

export const operatingCadence: OperatingCadence[] = [
  {
    name: 'Daily launch standup',
    owner: 'product-owner',
    rhythm: 'Every workday',
    output: 'One blocker, one shipped artifact, one customer signal per function.',
  },
  {
    name: 'Sprint planning',
    owner: 'planner',
    rhythm: 'Every two weeks',
    output: 'Accepted sprint scope with owner, metric, evidence, and release gate.',
  },
  {
    name: 'Design and usability QA',
    owner: 'designer',
    rhythm: 'Twice per sprint',
    output: 'Workflow review against activation, density, accessibility, and copy quality.',
  },
  {
    name: 'Revenue review',
    owner: 'sales',
    rhythm: 'Weekly',
    output: 'Pipeline, conversion, objections, expansion signals, and churn risk.',
  },
  {
    name: 'Release readiness',
    owner: 'devops',
    rhythm: 'Before every release',
    output: 'Build, tests, package signing, updater, rollback, support, and changelog pass.',
  },
]

export const launchChecklist: LaunchChecklistItem[] = [
  {
    id: 'pricing',
    label: 'Subscription plans and upgrade limits',
    owner: 'product-owner',
    status: 'done',
    proof: 'Three plan model with plan limits and sales motion.',
  },
  {
    id: 'activation',
    label: 'Trial activation journey',
    owner: 'designer',
    status: 'ready',
    proof: 'Workspace, AI provider, first task, and team invite path defined.',
  },
  {
    id: 'billing',
    label: 'Billing and entitlement service',
    owner: 'backend',
    status: 'ready',
    proof: 'Local subscription state, checkout intent contract, plan changes, seats, usage limits, and upgrade recommendations are implemented.',
  },
  {
    id: 'release',
    label: 'Signed desktop release pipeline',
    owner: 'devops',
    status: 'ready',
    proof: 'Electron packaging exists; signing and updater gates remain.',
  },
  {
    id: 'support',
    label: 'Paid support operating loop',
    owner: 'support',
    status: 'ready',
    proof: 'SLA tiers, triage rhythm, and knowledge-base ownership defined.',
  },
  {
    id: 'gtm',
    label: 'Launch campaigns and lifecycle emails',
    owner: 'marketer',
    status: 'ready',
    proof: 'Trial, activation, conversion, and referral experiments defined.',
  },
]

export const growthExperiments: GrowthExperiment[] = [
  {
    id: 'recipe-share',
    name: 'Agent recipe sharing',
    channel: 'Product-led',
    owner: 'marketer',
    hypothesis: 'Developers who complete three useful AI tasks will share a workflow recipe with their team.',
    successMetric: '15% of activated trials share at least one recipe.',
    nextAction: 'Instrument recipe completion and create a share surface after successful task runs.',
  },
  {
    id: 'paid-pilot',
    name: 'Founder-led paid pilot',
    channel: 'Outbound and community',
    owner: 'sales',
    hypothesis: 'Small teams will pay for governed provider switching and audit visibility before full cloud sync.',
    successMetric: '10 paid pilots at $500+ within the first launch month.',
    nextAction: 'Recruit teams using local model, security, and cross-platform workflow pain.',
  },
  {
    id: 'template-gallery',
    name: 'Engineering workflow templates',
    channel: 'Content and SEO',
    owner: 'planner',
    hypothesis: 'Templates for PR review, migration, and test generation create qualified organic trials.',
    successMetric: '120 qualified monthly trials from template pages.',
    nextAction: 'Ship the first five workflow templates with short before/after examples.',
  },
]
