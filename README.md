<p align="center">
  <img src="https://raw.githubusercontent.com/Yesterday-AI/paperclip-plugin-company-wizard/main/public/favicon.svg" alt="Company Wizard" width="48" height="48">
  <h1 align="center">Company Wizard</h1>
  <p align="center">
    <strong>Bootstrap AI agent teams from modular templates.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/starlein/paperclip-plugin-company-wizard/pkgs/npm/paperclip-plugin-company-wizard"><img src="https://img.shields.io/badge/GitHub%20Packages-@starlein%2Fpaperclip--plugin--company--wizard-blue" alt="GitHub Packages"></a>
    <a href="https://github.com/Yesterday-AI/paperclip-plugin-company-wizard/actions/workflows/ci.yml"><img src="https://github.com/Yesterday-AI/paperclip-plugin-company-wizard/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node.js"></a>
  </p>
</p>

---

**Company Wizard** is a [Paperclip](https://github.com/paperclipai/paperclip) plugin that bootstraps an AI agent company for your project — roles, workflows, skills, and tasks — in a few clicks. Open it from the sidebar, answer a few questions (or just describe your project), and it assembles the workspace files and creates the company + CEO in Paperclip. The CEO then hires the team and sets up the backlog on its first heartbeat.

<br>

**npm package installation (Paperclip > Settings > Plugins > Install Plugin):**

```bash
@starlein/paperclip-plugin-company-wizard
```

<br>

## Table of Contents

- [Two Ways to Start](#two-ways-to-start)
- [How Roles Work](#how-roles-work)
- [Presets](#presets)
- [Modules](#modules)
- [Roles](#roles)
- [Configuration](#configuration)
- [Development](#development)
- [Extending](#extending)
- [How It Works](#how-it-works)
- [Changelog](#changelog)
- [Contributing](#contributing)

<br>

## Two Ways to Start

### AI mode

Describe your project in plain language. The wizard analyzes it and picks the right preset, modules, and roles automatically.

> *"A fintech startup building a payment API, security is critical"*
> → selects `secure` preset, Security Engineer + Product Owner roles, provisions everything

Great for getting started fast when you're not sure which template fits.

### Manual mode

Walk through the steps yourself: name your company, set a goal, pick a preset, add modules, choose roles. Each step shows descriptions and hover-card previews so you know what you're getting.

Before provisioning, you can **open any generated file and edit it inline** — tweak a persona, adjust a workflow, or add role-specific context.

<br>

## How Roles Work

Every company starts with just the **CEO** — and that's already a functional team. Add roles and responsibilities shift automatically:

- Add an **Engineer** → they take over implementation, git workflow, and technical decisions
- Add a **Product Owner** → they take over backlog management and auto-assignment from the CEO
- Add a **UX Researcher** → they become the primary market analyst
- Add **DevOps** → they own CI/CD and monitoring (instead of Engineer or CEO)

No role is ever truly missing. When a specialist isn't present, the next best available person steps in. The CEO is always the final fallback.

<details>
<summary><strong>Full capability ownership table</strong></summary>

Start with just a CEO. Everything works. Add roles and responsibilities shift automatically:

| Capability | Primary Owner | Fallback | Module |
| :--------- | :------------ | :------- | :----- |
| `market-analysis` | UX Researcher → CMO → Product Owner | CEO | market-analysis |
| `hiring-review` | Product Owner | CEO | hiring-review |
| `backlog-health` | Product Owner | CEO | backlog |
| `auto-assign` | Product Owner | CEO | auto-assign |
| `user-testing` | QA → UX Researcher → Product Owner | CEO | user-testing |
| `brand-identity` | UI Designer → CMO | CEO | brand-identity |
| `ci-cd` | DevOps | Engineer | ci-cd |
| `monitoring` | DevOps | Engineer | monitoring |
| `tech-stack` | Engineer | CEO | tech-stack |
| `architecture-plan` | Engineer | CEO | architecture-plan |
| `design-system` | UI Designer | Engineer | architecture-plan |
| `pr-review` | Code Reviewer / Product Owner / UI Designer / UX Researcher / QA / DevOps | — | pr-review |
| `threat-model` | Security Engineer → DevOps | Engineer | security-audit |
| `security-review` | Security Engineer → DevOps | Engineer | security-audit |
| `project-docs` | Technical Writer → Engineer | CEO | documentation |
| `competitive-tracking` | Customer Success → CMO → Product Owner | CEO | competitive-intel |
| `accessibility-audit` | QA → UI Designer | Engineer | accessibility |
| `codebase-audit` | Engineer | CEO | codebase-onboarding |
| `issue-triage` | Product Owner → Engineer | CEO | triage |
| `dependency-audit` | DevOps → Security Engineer | Engineer | dependency-management |
| `release-process` | DevOps → Engineer | CEO | release-management |
| `game-design` | Game Designer → Engineer | CEO | game-design |
| `stall-detection` | CEO (always) | — | stall-detection |
| `vision-workshop` | CEO (always) | — | vision-workshop |

**How it works:** Primary owners get the full skill. Fallback owners get a safety-net variant that only activates when the primary is absent or stalled.

> **Example:** CEO only? They handle everything — strategy, backlog, auto-assign. Add an Engineer and they take over implementation. Add a Product Owner and they take over backlog management, with the CEO as fallback.

</details>

<br>

## Presets

Presets are curated starting points that bundle a set of modules and optional roles for a specific use case. Pick one in the wizard and you're ready to go — or use it as a base and add modules on top.

| Preset | Modules | Best for |
| :----- | :------ | :------- |
| **`fast`** | github-repo, backlog, auto-assign, stall-detection | Solo engineer, prototypes, MVPs |
| **`quality`** | + pr-review, + Product Owner, + Code Reviewer | Teams, production systems |
| **`rad`** | + tech-stack, + hiring-review | Rapid prototyping, formalize later |
| **`startup`** | + vision, market, hiring, tech, architecture | Strategy-first, grow organically |
| **`research`** | vision, market, tech, hiring (no repo/code) | Planning phase only |
| **`full`** | All modules + Product Owner + Code Reviewer | Full planning + quality engineering |
| **`secure`** | + security-audit, + Security Engineer + Code Reviewer + PO | Regulated industries, fintech, healthtech |
| **`gtm`** | + competitive-intel, brand-identity, + CMO + Customer Success + PO | Market-facing products, competitive positioning |
| **`content`** | + documentation, accessibility, + Technical Writer + PO | Dev tools, documentation-heavy projects |
| **`launch-mvp`** | launch-mvp, github-repo, backlog, auto-assign, stall-detection | Ship a first version end-to-end |
| **`build-api`** | build-api, github-repo, backlog, auto-assign, ci-cd, stall-detection | Build a REST/GraphQL API from scratch |
| **`website-relaunch`** | website-relaunch, github-repo, pr-review, backlog, auto-assign, stall-detection + UI Designer + PO | Relaunch a website with external design assets |
| **`repo-maintenance`** | triage, codebase-onboarding, dependency-management, release-management, github-repo, pr-review, backlog, auto-assign, stall-detection + Code Reviewer + PO | Maintain an existing repository |
| **`build-game`** | game-design, tech-stack, github-repo, backlog, auto-assign, stall-detection + Game Designer + Game Artist + Audio Designer | Build a game from idea to release |
| **`launch-pack`** | vision-workshop, market-analysis, competitive-intel, brand-identity, tech-stack, architecture-plan, launch-mvp, github-repo, backlog, auto-assign, stall-detection + CTO + CMO | Full executive team launch: strategy, tech, and marketing from day one |

> **`fast`** is for a single engineer — multiple engineers without review will cause conflicts.
>
> **`research`** has no code workflow. Add `github-repo` and `backlog` when ready to build.

<details>
<summary><strong>Preset details</strong></summary>

**fast** — Solo engineer, direct-to-main, automated backlog. No review, no planning phase.

**quality** — Full review pipeline. Product Owner manages backlog and product alignment, Code Reviewer gates code quality. Feature branches with PR workflow.

**rad** — Rapid Application Development. Pick a tech stack, start building, hire when you hit bottlenecks. No upfront market research or architecture formalization — prototype first, learn from what you build, formalize later.

**startup** — Strategy-first. Starts with vision, market analysis, tech evaluation, and hiring review before any code. Grow the team through board approvals.

**research** — Planning only. Vision, market research, tech evaluation, and team assessment. No repo, no code workflow. Upgrade to `startup` or `full` when ready to build.

**full** — Everything. Full strategic planning, quality engineering with PR review, team growth via hiring review. Product Owner and Code Reviewer included. Best for serious projects that need both strategy and engineering rigor.

**secure** — Security-first. Threat modeling, security reviews, and quality gates on top of full planning and PR review. Security Engineer, Code Reviewer, and Product Owner included. Best for regulated industries, fintech, healthtech, or any project where security is a hard requirement.

**gtm** — Go-to-market focused. Competitive intelligence, market analysis, and brand identity. CMO for marketing strategy, Customer Success for competitive tracking, Product Owner for backlog. Best for products entering or competing in established markets.

**content** — Content and documentation focused. Technical Writer for developer docs and guides, accessibility for inclusive design, market analysis for positioning. Best for developer tools, documentation-heavy projects, or content-driven products.

**website-relaunch** — Relaunch an existing website with external design assets. Site audit, design ingestion, implementation, content migration, QA, and go-live. UI Designer for design analysis, Product Owner for backlog management. Includes a user-assigned "Provide design assets" issue as the entry point — upload your agency's designs, the team handles the rest.

**repo-maintenance** — Custodial maintenance for existing repositories. Agents review and merge open PRs, triage inbound GitHub issues, audit codebase health, manage dependencies, and handle releases. Code Reviewer for PR quality gates, Product Owner for issue triage and backlog. Inline goal bootstraps the team through repo onboarding, process setup, initial sweep, and steady-state maintenance.

**build-game** — Game development from idea to playable release. Game Designer owns the GDD, mechanics, and balancing. Game Artist generates sprites, textures, and tilesets via AI image generation and code-based approaches. Audio Designer creates sound effects, music, and soundscapes via AI generation and code-based synthesis. Inline goal with 5 milestones: concept (GDD + engine + art style), prototype (core loop + placeholder art + first playtest), vertical slice (one polished level), production (all content), polish & ship (balancing + distribution). Works for any genre.

</details>

<br>

## Modules

Modules are composable capabilities you layer on top of the base team. Each module adds skills, tasks, and optionally heartbeat sections to the relevant roles. Modules are additive — you can combine them freely and they degrade gracefully when a role they extend isn't present.

### Strategy & Planning

| Module | What it does | Kickoff task |
| :----- | :----------- | :----------- |
| **`vision-workshop`** | Define vision, success metrics, strategic milestones | CEO defines vision |
| **`market-analysis`** | Research market, competitors, positioning | Primary owner conducts analysis |
| **`hiring-review`** | Evaluate team gaps, propose hires via board approval | Primary owner reviews team |
| **`tech-stack`** | Evaluate and document technology choices | Primary owner evaluates stack |
| **`architecture-plan`** | Design system architecture + design system | Engineer + Designer (if present) |
| **`brand-identity`** | Brand book, visual identity, design guidelines | Primary owner defines brand |
| **`user-testing`** | Usability evaluations and findings | Primary owner runs evaluations |
| **`competitive-intel`** | Competitive landscape analysis and tracking | Primary owner builds landscape |
| **`documentation`** | Project docs, API refs, onboarding guides | Primary owner creates docs |
| **`security-audit`** | Threat modeling and security code review | Primary owner conducts audit |
| **`accessibility`** | WCAG 2.2 compliance audit and remediation | Primary owner runs audit |
| **`website-relaunch`** | Website relaunch: audit, design ingestion, implementation, migration | Primary owner audits + analyzes designs |
| **`launch-mvp`** | MVP lifecycle: scope, build core feature, deploy, iterate from feedback | CEO scopes, primary owner builds |
| **`game-design`** | Game Design Document, core mechanics, progression, balancing | Primary owner creates GDD |

### Maintenance & Operations

| Module | What it does | Kickoff task |
| :----- | :----------- | :----------- |
| **`codebase-onboarding`** | Audit existing codebase, map architecture, track tech debt, ongoing cleanup | Primary owner audits codebase |
| **`triage`** | Classify, prioritize, and respond to inbound GitHub issues | Primary owner triages open issues |
| **`dependency-management`** | Dependency audits, CVE scanning, safe patching, upgrade planning | Primary owner audits dependencies |
| **`release-management`** | Semver, changelogs, git tagging, GitHub Releases, rollback procedures | Primary owner documents release process |

### Engineering Workflow

| Module | What it does | Kickoff task |
| :----- | :----------- | :----------- |
| **`github-repo`** | Git workflow and commit conventions | Engineer initializes repo |
| **`pr-review`** | PR-based review workflow | Engineer sets up branch protection |
| **`backlog`** | Auto-generate issues from goals when backlog runs low | Primary owner creates initial backlog |
| **`auto-assign`** | Assign unassigned issues to idle agents | — |
| **`stall-detection`** | Detect stuck handovers, nudge or escalate | — |
| **`build-api`** | REST API: schema design, endpoints, auth, documentation | Engineer designs and implements |
| **`ci-cd`** | Continuous integration and deployment pipeline | Primary owner sets up CI/CD |
| **`monitoring`** | Observability, alerting, health checks | Primary owner sets up monitoring |

<details>
<summary><strong>Module details</strong></summary>

#### vision-workshop

Defines the strategic foundation. The CEO runs a vision workshop to refine the company goal into a vision statement, success metrics, and milestones.

- **Capability:** none (CEO-only strategic task)
- **Doc:** `docs/vision-template.md`
- With UX Researcher: contributes user-centered metrics and journey mapping

#### market-analysis

Researches the target market, competitors, and positioning.

- **Capability:** `market-analysis` — owners: `ux-researcher` → `cmo` → `product-owner` → `ceo`
- **Fallback:** CMO focuses on positioning and competitive landscape; CEO creates a brief overview only
- **Doc:** `docs/market-analysis-template.md`

#### hiring-review

Evaluates team composition against the goal and proposes hires through board approval.

- **Capability:** `hiring-review` — owners: `product-owner` → `ceo`
- **Fallback:** CEO proposes one urgent hire only

#### tech-stack

Evaluates technology options and documents decisions with rationale and trade-offs.

- **Capability:** `tech-stack` — owners: `engineer` → `ceo`
- **Fallback:** CEO makes pragmatic defaults, marks them provisional
- **Doc:** `docs/tech-stack-template.md`

#### architecture-plan

Designs the system architecture. Requires `tech-stack`. Includes a `design-system` capability for UI Designers.

- **Capability:** `architecture-plan` — owners: `engineer` → `ceo`
- **Capability:** `design-system` — owners: `ui-designer` → `engineer`
- **Docs:** `docs/architecture-template.md`, `docs/design-system-template.md`

#### github-repo

Git workflow and commit conventions.

- **Task:** Engineer initializes repo
- **Doc:** `docs/git-workflow.md`

#### pr-review

PR-based review workflow. Requires `github-repo`. Activates with `code-reviewer`, `product-owner`, `ui-designer`, `ux-researcher`, `qa`, or `devops`.

- **Task:** Engineer sets up branch protection
- **Doc:** `docs/pr-conventions.md`

#### backlog

Owns the product backlog lifecycle — from goal decomposition to a steady pipeline of actionable issues.

- **Capability:** `backlog-health` — owners: `product-owner` → `ceo`
- **Fallback:** CEO creates 1-2 issues only when backlog is critically empty
- **Doc:** `docs/backlog-process.md`

#### auto-assign

Assigns unassigned issues to idle agents.

- **Capability:** `auto-assign` — owners: `product-owner` → `ceo`
- **Fallback:** CEO assigns only when agents are critically idle

#### brand-identity

Creates brand guidelines: logo usage, color palette, typography, iconography, and tone of voice.

- **Capability:** `brand-identity` — owners: `ui-designer` → `cmo` → `ceo`
- **Fallback:** CMO focuses on brand strategy and messaging; CEO creates minimal provisional placeholder
- **Doc:** `docs/brand-identity-template.md`

#### user-testing

Designs and executes usability evaluations, documents findings with severity ratings.

- **Capability:** `user-testing` — owners: `qa` → `ux-researcher` → `product-owner` → `ceo`
- **Fallback:** QA adds test automation and edge case coverage; CEO creates a basic heuristic checklist
- **Doc:** `docs/user-testing-template.md`

#### ci-cd

Continuous integration and deployment pipeline. Requires `github-repo`.

- **Capability:** `ci-cd` — owners: `devops` → `engineer`
- **Fallback:** Engineer sets up basic CI (lint, test, build); DevOps owns full pipeline lifecycle including CD
- **Doc:** `docs/ci-cd-template.md`

#### monitoring

Observability, error tracking, logging, alerting, and health checks. Requires `github-repo`.

- **Capability:** `monitoring` — owners: `devops` → `engineer`
- **Fallback:** Engineer sets up basic health checks and structured logging; DevOps owns full observability stack
- **Doc:** `docs/monitoring-template.md`

#### security-audit

Threat modeling and security code review. Identifies attack surfaces, OWASP Top 10 vulnerabilities, and dependency CVEs.

- **Capability:** `threat-model` — owners: `security-engineer` → `devops` → `engineer`
- **Capability:** `security-review` — owners: `security-engineer` → `devops` → `engineer`
- **Fallback:** DevOps focuses on infrastructure security; Engineer runs basic checks only

#### documentation

Project documentation: READMEs, API references, architecture overviews, onboarding guides.

- **Capability:** `project-docs` — owners: `technical-writer` → `engineer` → `ceo`
- **Fallback:** Engineer writes minimal README; CEO creates bare-bones project overview

#### competitive-intel

Living competitive landscape — competitor profiles that evolve over time with positioning, strengths, and differentiation insights.

- **Capability:** `competitive-tracking` — owners: `customer-success` → `cmo` → `product-owner` → `ceo`
- **Fallback:** CMO focuses on positioning angles; CEO creates brief overview only

#### accessibility

WCAG 2.2 compliance auditing: semantic HTML, keyboard navigation, color contrast, ARIA, screen reader compatibility.

- **Capability:** `accessibility-audit` — owners: `qa` → `ui-designer` → `engineer`
- **Fallback:** UI Designer focuses on visual accessibility; Engineer runs automated checks

#### website-relaunch

Full website relaunch lifecycle: audit the current site, ingest design assets from an external agency, implement the new design, migrate content, and go live. Includes an inline goal with 5 milestones and 10 issues.

- **Capability:** `design-ingestion` — owners: `ui-designer` → `engineer` → `ceo`
- **Capability:** `site-audit` — owners: `ui-designer` → `engineer` → `ceo`
- **Goal:** Website Relaunch (with dedicated project, 5 milestones, 10 issues)

#### build-api

REST API development from schema to documentation. Inline goal with 4 milestones and 8 issues.

- **Capability:** `api-design` — owners: `engineer` → `ceo`
- **Requires:** `github-repo`
- **Goal:** Build a REST API (with dedicated project, 4 milestones, 8 issues)

#### launch-mvp

MVP project lifecycle: define scope tightly, build the core feature, deploy, and iterate from user feedback. No capabilities or skills — structured goal with milestones and issues.

- **Goal:** Launch MVP (with dedicated project, 4 milestones, 8 issues)

#### codebase-onboarding

Audit an existing codebase and maintain its health over time. Requires `github-repo`.

- **Capability:** `codebase-audit` — owners: `engineer` → `ceo`
- **Output:** `docs/CODEBASE-AUDIT.md`

#### triage

Processes inbound GitHub issues: classify by type and priority, respond to reporters, close duplicates, convert actionable items into Paperclip tasks. Requires `github-repo`.

- **Capability:** `issue-triage` — owners: `product-owner` → `engineer` → `ceo`

#### dependency-management

Dependency lifecycle: vulnerability scanning, outdated package detection, safe patch-level updates, and major version migration planning. Requires `github-repo`.

- **Capability:** `dependency-audit` — owners: `devops` → `security-engineer` → `engineer`
- **Output:** `docs/DEPENDENCY-AUDIT.md`

#### release-management

Release lifecycle: semantic versioning, changelog generation, git tagging, GitHub Releases, and rollback documentation. Requires `github-repo`.

- **Capability:** `release-process` — owners: `devops` → `engineer` → `ceo`
- **Output:** `docs/RELEASE-PROCESS.md`

#### game-design

Game Design Document creation and ongoing mechanic design, progression, and balancing. Ships a GDD template and engine reference docs (Phaser, PixiJS, Three.js).

- **Capability:** `game-design` — owners: `game-designer` → `engineer` → `ceo`
- **Docs:** `docs/gdd-template.md`, `docs/engine-phaser.md`, `docs/engine-pixijs.md`, `docs/engine-threejs.md`

#### stall-detection

Detects issues stuck in `in_progress` or `in_review` with no recent activity. Nudges the assigned agent, escalates to the board if nudging doesn't help.

- **Capability:** CEO-only

</details>

<br>

## Roles

Every company starts with just the **CEO** (the only base role). All other roles are optional:

| Role | Paperclip role | Reports to | Enhances |
| :--- | :------------- | :--------- | :------- |
| **Product Owner** | `pm` | CEO | Takes over roadmap, auto-assign, hiring-review from CEO |
| **Code Reviewer** | `general` | CEO | Enables pr-review activation |
| **UI & Brand Designer** | `designer` | CEO | Takes over design-system and brand-identity |
| **UX Researcher** | `researcher` | CEO | Takes over market-analysis and user-testing |
| **CTO** | `cto` | CEO | Technical leadership, architecture oversight |
| **CMO** | `cmo` | CEO | Marketing strategy, go-to-market, growth metrics |
| **CFO** | `cfo` | CEO | Financial planning, budget tracking, cost analysis |
| **DevOps Engineer** | `devops` | CEO | Takes over ci-cd and monitoring from Engineer |
| **QA Engineer** | `qa` | CEO | Takes over user-testing, quality gates |
| **Technical Writer** | `general` | CEO | Takes over documentation, adds doc review pass |
| **Security Engineer** | `general` | CEO | Takes over security-audit, adds security review pass |
| **Customer Success** | `general` | CEO | Takes over competitive-intel customer analysis |
| **Game Designer** | `pm` | CEO | Takes over game-design from Engineer, playtesting focus |
| **Level Designer** | `pm` | CEO | Takes over level-specific design from Game Designer |
| **Game Artist** | `designer` | CEO | Takes over art asset creation from Engineer |
| **Audio Designer** | `designer` | CEO | Takes over audio asset creation from Engineer |

<details>
<summary><strong>Role details</strong></summary>

#### Product Owner

The voice of the user. Owns the backlog pipeline, validates engineering output against goals, manages scope discipline. Adds product-alignment review pass with pr-review module.

#### Code Reviewer

Owns code quality. Reviews PRs for correctness, style, security, and test coverage. Never writes code — only reviews it.

#### UI & Brand Designer

Owns visual identity, design systems, and brand consistency. Creates design specs that engineers implement. Outputs are design documents, not code. Adds design review pass with pr-review module.

#### UX Researcher

Owns user experience research, usability analysis, and journey mapping. Grounds design and product decisions in evidence-based user insights. Adds UX review pass with pr-review module.

#### CTO

Technical leadership and architecture oversight. Guides technology decisions, reviews system design, and ensures engineering quality at scale.

#### CMO

Owns marketing strategy, brand positioning, go-to-market planning, and growth metrics. Data-driven, measures everything.

#### CFO

Owns financial planning, budget tracking, cost analysis, and resource allocation. Monitors agent cost events and budget utilization.

#### DevOps Engineer

Owns infrastructure, CI/CD pipelines, deployment, monitoring, and platform reliability. Automation over manual work, infrastructure as code.

#### QA Engineer

Owns test strategy, test automation, quality gates, and regression prevention. Prevention over detection.

#### Technical Writer

Owns developer documentation, API references, READMEs, and onboarding guides. Keeps docs accurate as the codebase evolves.

#### Security Engineer

Owns threat modeling, security code reviews, OWASP compliance, and secure coding standards. Security issues are always blocking.

#### Customer Success Manager

Owns customer health monitoring, feedback synthesis, churn prevention, and competitive intelligence from the customer perspective.

#### Game Designer

Owns the Game Design Document, core mechanics, game loop, progression systems, difficulty curves, and balancing. Runs design experiments and iterates based on playtest data.

#### Level Designer

Owns level layout, pacing, difficulty curves, environmental storytelling, and spatial progression.

#### Game Artist

Owns visual art production: sprites, textures, tilesets, UI elements, and visual effects. Creates assets using AI image generation tools, code-based approaches, and asset pipeline tools.

#### Audio Designer

Owns audio production: sound effects, music, ambient soundscapes, and audio systems design. Creates audio using AI generation tools, code-based synthesis, and audio processing pipelines.

</details>

<br>

## Configuration

Configure the plugin via **Settings → Plugins → Company Wizard** in the Paperclip UI.

| Field | Required | Description |
| --- | --- | --- |
| `companiesDir` | No | Where assembled company workspaces are written. Defaults to `~/.paperclip/instances/default/companies`. Override for Docker setups. |
| `templatesPath` | No | Path to the templates directory. Defaults to `~/.paperclip/plugin-templates` (auto-downloaded from `templatesRepoUrl` if missing). |
| `templatesRepoUrl` | No | GitHub tree URL to pull templates from when the templates directory does not exist. Defaults to the official @Yesterday-AI/paperclip-plugin-company-wizard templates. |
| `paperclipUrl` | No | Paperclip instance URL. Defaults to `http://localhost:3100` or `PAPERCLIP_PUBLIC_URL` env var. |
| `paperclipEmail` | No | Board login email. Required for authenticated (non-`local_trusted`) instances. |
| `paperclipPassword` | No | Board login password. Stored as a secret ref. |
| `anthropicApiKey` | No | Anthropic API key for AI wizard mode. Stored as a secret ref. Required to use the AI-powered setup path. |
| `disableBoardApprovalOnNewCompanies` | No | If `true`, the wizard PATCHes new companies to set `requireBoardApprovalForNewAgents=false` during provisioning. Leave `false` to preserve approval-gated hiring. Defaults to `false`. |

<br>

## Development

```bash
pnpm install
pnpm build          # esbuild: worker + manifest + UI → dist/
pnpm dev            # watch mode
pnpm test           # vitest: tests/**/*.spec.ts
pnpm test:logic     # node --test: src/logic/*.test.js
pnpm typecheck      # tsc --noEmit
```

After `pnpm build`, reload the plugin in the Paperclip UI — no reinstall required.

<br>

## Extending

### Add a module

```text
templates/modules/<name>/
├── module.meta.json             # Name, capabilities, tasks, dependencies, permissions
├── skills/                      # Shared skills (used by any primary owner)
│   └── <skill>.md
├── agents/<role>/
│   ├── skills/                  # Role-specific overrides and fallbacks
│   │   ├── <skill>.md           # Override (replaces shared for this role)
│   │   └── <skill>.fallback.md  # Fallback (safety-net for non-primary)
│   └── heartbeat-section.md     # Optional: injected into role's HEARTBEAT.md
└── docs/                        # Shared docs (→ docs/)
```

<details>
<summary><strong>module.meta.json schema</strong></summary>

```json
{
  "name": "my-module",
  "requires": ["other-module"],
  "activatesWithRoles": ["my-role"],
  "permissions": ["tasks:assign"],
  "adapterOverrides": { "chrome": true },
  "capabilities": [
    {
      "skill": "my-skill",
      "owners": ["my-role", "ceo"],
      "fallbackSkill": "my-skill.fallback"
    }
  ],
  "tasks": [
    {
      "title": "Initial task",
      "assignTo": "capability:my-skill",
      "description": "Task description"
    }
  ],
  "goal": {
    "title": "My Goal",
    "description": "What this goal achieves",
    "project": true,
    "milestones": [
      { "id": "phase-1", "title": "Phase 1", "project": false }
    ],
    "issues": [
      { "title": "First task", "milestone": "phase-1", "assignTo": "engineer", "priority": "high" }
    ]
  }
}
```

| Field | Description |
| :---- | :---------- |
| `requires` | Other modules that must be selected |
| `activatesWithRoles` | Module only applies if one of these roles is present |
| `capabilities[].owners` | Priority order — first present role gets the primary skill |
| `capabilities[].fallbackSkill` | Filename (without `.md`) of the fallback variant |
| `tasks[].assignTo` | A role name or `"capability:<skill>"` to auto-resolve |
| `adapterOverrides` | Adapter config keys merged into all capability owner agents during provisioning |
| `goal` | Optional inline goal. When active, `tasks` are skipped. |
| `goal.project` | If `true` (default), creates a dedicated Paperclip project for this goal |
| `goal.issues[].assignTo` | Role name, `"capability:<skill>"`, or `"user"` (human pickup) |

</details>

<details>
<summary><strong>Skill resolution</strong></summary>

When assembling a capability's primary skill, the system checks in order:

1. **Role-specific override:** `agents/<role>/skills/<skill>.md`
2. **Shared skill:** `skills/<skill>.md`

First match wins. Most capabilities only need a shared skill. Role-specific overrides exist only when a role brings a genuinely different approach.

```text
Example: market-analysis module
├── skills/
│   └── market-analysis.md                    # Shared: any primary owner
├── agents/
│   ├── ux-researcher/skills/
│   │   └── market-analysis.md                # Override: user-focused
│   └── ceo/skills/
│       └── market-analysis.fallback.md       # Fallback: brief overview
```

- **UX Researcher** present → gets role-specific override (user-focused)
- **Product Owner** primary → gets shared skill
- **CEO** as fallback → gets fallback variant

</details>

<details>
<summary><strong>Doc references in skills</strong></summary>

Two kinds of docs end up in `{company}/docs/`:

- **Templates** (`lowercase-kebab.md`) — Shipped by modules, copied at assembly time. Guaranteed to exist if the module is active.
- **Agent output** (`UPPERCASE.md`) — Created by agents during execution. May or may not exist yet.

| Reference | Rule | Example |
| :--- | :--- | :--- |
| Define own output | Name the path directly | "Document in `docs/TECH-STACK.md`" |
| Read own template | Reference directly | "Follow conventions in `docs/pr-conventions.md`" |
| Read cross-module output | **Always conditional** | "If `docs/TECH-STACK.md` exists, review it. Otherwise, proceed based on project context." |

</details>

### Add a role

```text
templates/roles/<name>/
├── role.meta.json   # Name, title, base, paperclipRole, reportsTo, adapter
├── AGENTS.md
├── SOUL.md
├── HEARTBEAT.md
└── TOOLS.md
```

<details>
<summary><strong>role.meta.json schema</strong></summary>

```json
{
  "name": "my-role",
  "title": "My Role",
  "base": false,
  "division": "engineering",
  "tagline": "One-liner for wizard display and AI selection",
  "paperclipRole": "general",
  "description": "What this role does",
  "reportsTo": "ceo",
  "enhances": ["Takes over X from CEO"],
  "adapter": {
    "model": "claude-sonnet-4-6"
  }
}
```

| Field | Description |
| :---- | :---------- |
| `base` | `true` for always-present roles (ceo only) |
| `division` | Grouping: `leadership`, `engineering`, `design`, `product` |
| `tagline` | One-liner for wizard UX and AI selection |
| `paperclipRole` | Paperclip enum: `ceo`, `engineer`, `pm`, `qa`, `designer`, `cto`, `cmo`, `cfo`, `devops`, `researcher`, `general` |
| `adapter` | Passed to `adapterConfig` during provisioning |

</details>

### Add a preset

Create `templates/presets/<name>/preset.meta.json`:

```json
{
  "name": "my-preset",
  "description": "What this preset is for",
  "constraints": [],
  "roles": ["product-owner"],
  "modules": ["github-repo", "backlog"]
}
```

<br>

## How It Works

```text
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Wizard    │────▶│   Assembly   │────▶│   Provisioning   │
│   (UI)      │     │  (files)     │     │   (Paperclip API)│
└─────────────┘     └──────────────┘     └──────────────────┘
```

**Assembly** (always runs):

1. Copies base role files (CEO, Engineer) into `agents/`
2. Copies selected extra roles into `agents/`
3. For each module: resolves capability ownership, installs skills, copies docs
4. Injects module heartbeat sections into each role's `HEARTBEAT.md`
5. Generates `BOOTSTRAP.md` with goal, project, agent paths, and initial tasks

**Provisioning** (Review → Provision step):

1. Connects to Paperclip API (auto-detects `local_trusted` vs authenticated)
2. Creates a new **company** in Paperclip — or targets an existing one if `existingCompanyId` is set in the review step
3. Creates the **CEO agent** with adapter config (cwd, instructionsFilePath, model), or reuses the existing active CEO when targeting an existing company. If board approval is required, the wizard hires via `/agent-hires` and auto-approves
4. Creates a **Bootstrap task** assigned to the CEO

The CEO then sets up the rest of the team on its first heartbeat: hiring the other roles from disk, creating the goal, project, and initial backlog issues. If provisioning fails after a **new** company is created, the partial company is automatically deleted — existing target companies are never deleted on error.

<br>

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
