# Orion IDE SaaS Operating System

Date: 2026-06-03

This document treats the current Orion IDE repository as a subscription SaaS business that must be sold, operated, supported, and improved by a real startup team. The in-app implementation lives in `src/panels/SaasOpsPanel.tsx` and uses the operating data in `src/data/saasOperatingSystem.ts`.

## Current Product Base

Orion already has a credible developer-product foundation:

- Electron + Vite + React desktop app with Monaco editor, panels, terminal, Git, testing, settings, themes, and AI workflows.
- CLI distribution with many coding commands and provider support.
- Local-first positioning with AI provider switching and optional local model workflows.
- Existing packaging and release assets for desktop distribution.

The missing commercial layer is not another editor feature. The missing layer is a repeatable SaaS operating system: pricing, activation, billing entitlements, launch readiness, support loops, customer feedback, and sprint-by-sprint revenue accountability.

## Paid Positioning

Product category: AI-native desktop IDE and terminal assistant.

Buyer: engineering managers and senior developers in teams that want local-first AI coding workflows.

Commercial wedge: cross-platform IDE plus CLI with provider switching, local model support, agent workflows, and workspace-level automation.

Revenue hypothesis: sell team subscriptions around secure AI orchestration, workspace automation, usage controls, and supportable desktop distribution.

## Team Model

Every function owns one business metric and one product operating responsibility.

| Function | Owns | Metric |
| --- | --- | --- |
| Product Owner | Paid scope, acceptance criteria, buyer pain | Activation to paid conversion |
| Product Planner | Roadmap, release gates, packaging, dependencies | Sprint predictability |
| Frontend Developer | IDE surfaces, onboarding, in-product growth loops | Task completion rate |
| Backend Developer | Licensing, entitlements, billing, audit, AI provider infrastructure | API reliability |
| Designer | Dense workbench usability and activation flow quality | Time to first value |
| Marketer | Positioning, campaign, lifecycle, content, experiments | Qualified trial starts |
| Sales | Paid pilots, objections, expansion path | Pipeline coverage |
| Support | Onboarding friction, incident intake, help content | First response time |
| DevOps | CI, signing, updater, crash visibility, uptime | Release gate pass rate |

## Subscription Packaging

| Plan | Price | Motion | Buyer |
| --- | ---: | --- | --- |
| Solo Pro | $19/month flat | Self-serve trial to card checkout | Independent developers |
| Team | $39/seat/month | Product-led trial plus founder-assisted onboarding | 5-50 developer teams |
| Enterprise | $249/month base | Sales-led annual contract | Security-conscious engineering organizations |

Modeled MRR from the plan mix is $24,016, with $288,192 modeled ARR before annual discounts.

## Launch Gates

| Gate | Status | Owner | Proof |
| --- | --- | --- | --- |
| Subscription plans and upgrade limits | Done | Product Owner | Three plan model with plan limits and sales motion |
| Trial activation journey | Ready | Designer | Workspace, provider, first task, and team invite path defined |
| Billing and entitlement service | Ready | Backend | Local subscription state, checkout intent contract, plan changes, seats, usage limits, and upgrade recommendations are implemented; production provider credentials remain next |
| Signed desktop release pipeline | Ready | DevOps | Electron packaging exists; signing and updater gates remain |
| Paid support operating loop | Ready | Support | SLA tiers, triage rhythm, and knowledge-base ownership defined |
| Launch campaigns and lifecycle emails | Ready | Marketer | Trial, activation, conversion, and referral experiments defined |

## Billing And Entitlements

The product now has a local subscription state that can be operated inside the SaaS Launch Ops panel:

- Plan state: Solo Pro, Team, and Enterprise.
- Subscription state: trialing, active, past due, expired.
- Commercial controls: seat count, account MRR, checkout intent event, billing event log.
- Usage simulation: AI providers, workspaces, team members, history retention, and managed AI spend.
- Entitlement checks: provider slots, workspace limit, member limit, agent history, AI budget, audit logs, SSO, and private updates.
- Upgrade recommendations: when a feature is locked or usage approaches/exceeds a limit, the panel identifies the next viable plan.
- Billing provider contract: when `VITE_ORION_CHECKOUT_URL` is configured, the app builds a hosted checkout intent with plan, seats, amount, success URL, and cancel URL; without it, the app records a founder-led manual checkout intent.
- License snapshot: local entitlement snapshots include plan, status, seats, expiry, and a fingerprint so signed license sync has a concrete contract.

This is implemented as a local-first SaaS control plane. Live selling still requires production payment-provider credentials, webhook verification, and a real license-signing key, but the app now has the typed checkout and license contracts those services must satisfy.

The required environment variables are documented in `.env.example`.

## Customer Lifecycle

The SaaS Launch Ops panel also models the trial-to-paid operating loop that the startup team needs after launch:

- Lead, trial, activated, blocked, paid, and expansion stages.
- Account-level activation steps owned by product, frontend, backend, design, marketing, sales, support, and DevOps.
- Qualified and weighted pipeline MRR.
- Attention queue for blocked accounts, low activation, stalled stages, and unresolved blockers.
- Next lifecycle action per account so sprint work connects to customer conversion instead of generic roadmap activity.

This creates a compact local customer-success cockpit. It is not a replacement for a production CRM, but it gives the product team a coded operating model for paid pilots and founder-led onboarding.

## 10-Sprint Evolution

Sprint 1, Commercial Readiness:
The team turns Orion from an open-source IDE into a sellable subscription product. Product and marketing narrow the message to governed local-first AI workflows. Pricing and launch gates are defined.

Sprint 2, Activation Funnel:
Design and frontend focus on first workspace, first provider, first AI task, and first save. Support documents activation blockers. The product now has a measurable activation definition.

Sprint 3, Team Workspaces:
Backend and sales translate buyer objections into workspace membership, task history, audit visibility, and team permissions. Team value becomes more concrete than generic collaboration.

Sprint 4, Billing and Entitlements:
The active sprint connects subscription state to product behavior. Plan limits gate team/cloud features while local editing remains available. Billing integration is the biggest unresolved dependency.

Sprint 5, Admin and Security:
The team sequences SSO, SCIM, model allowlists, key custody, audit exports, and release-signing evidence for Enterprise readiness.

Sprint 6, Usage Analytics and Unit Economics:
The business adds opt-in analytics, local-only export, AI cost visibility, and gross-margin controls while preserving the local-first trust promise.

Sprint 7, Growth Loops:
Marketing, product, and design create agent recipes, shareable automation workflows, referrals, and workflow-template acquisition assets.

Sprint 8, Reliability and Support Operations:
DevOps and support define canary/stable channels, incident severity, rollback, update success metrics, crash triage, and plan-based response targets.

Sprint 9, Integrations and Ecosystem:
Sales and engineering prioritize GitHub PR, Jira issue handoff, Slack notifications, and plugin quality gates before a broad marketplace push.

Sprint 10, Scale and International Launch:
The startup stabilizes the operating model with localization, partner readiness, compliance sequencing, and annual-contract expansion.

## Operating Cadence

- Daily launch standup: one blocker, one shipped artifact, one customer signal per function.
- Sprint planning: accepted scope with owner, metric, evidence, and release gate.
- Design QA: review activation, density, accessibility, and copy twice per sprint.
- Revenue review: review pipeline, conversion, objections, expansion, and churn weekly.
- Release readiness: check build, tests, package signing, updater, rollback, support, and changelog before release.

## Implementation Notes

The SaaS operating system is now visible inside the product via the SaaS Launch Ops activity-bar item and command palette entry. The source of truth is structured code, not only prose:

- `src/data/saasOperatingSystem.ts`: operating model, roles, pricing, metrics, sprints, checklist, experiments.
- `src/utils/saasMetrics.ts`: MRR, ARR, readiness, sprint progress, and formatting logic.
- `src/utils/entitlements.ts`: subscription account MRR, plan changes, usage checks, health, and upgrade recommendations.
- `src/utils/billingGateway.ts`: checkout intent construction, billing provider readiness, and local license snapshots.
- `src/utils/customerSuccess.ts`: activation scoring, pipeline weighting, lifecycle summaries, and attention queues.
- `src/store/subscription.ts`: local account, status, seats, usage, checkout intent, and billing event history.
- `src/panels/SaasOpsPanel.tsx`: in-app cockpit for team communication and revenue operations.
- `src/utils/saasMetrics.test.ts`, `src/utils/entitlements.test.ts`, `src/utils/billingGateway.test.ts`, and `src/utils/customerSuccess.test.ts`: verification for business, entitlement, billing, and customer lifecycle calculations.
