<p align="center">
  <h1 align="center">Clipper</h1>
  <p align="center">
    <strong>Bootstrap AI agent teams from modular templates.</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@yesterday-ai/paperclipper"><img src="https://img.shields.io/npm/v/@yesterday-ai/paperclipper?color=cb3837&label=npm" alt="npm version"></a>
    <a href="https://github.com/Yesterday-AI/paperclipper/actions/workflows/ci.yml"><img src="https://github.com/Yesterday-AI/paperclipper/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node.js"></a>
  </p>
</p>

---

Clipper is a CLI and template system for [Paperclip](https://github.com/paperclipai/paperclip) — the control plane for AI-agent companies. It assembles ready-to-run company workspaces by combining a base org (CEO + Engineer) with composable modules and optional specialist roles.

> **Gracefully optimistic:** capabilities extend, they don't require. The system works with just two roles and gets better as you add more. Adding a Product Owner shifts backlog management away from the CEO automatically. Adding a UX Researcher makes them the primary market analyst. No config changes needed.

<br>

## Table of Contents

- [Quick Start](#quick-start)
- [Install](#install)
- [Usage](#usage)
- [What You Get](#what-you-get)
- [Architecture](#gracefully-optimistic-architecture)
- [Presets](#presets)
- [Modules](#modules)
- [Roles](#roles)
- [After Clipper](#after-clipper)
- [Extending](#extending)
- [How It Works](#how-it-works)
- [Contributing](#contributing)

<br>

## Quick Start

```sh
npx @yesterday-ai/paperclipper
```

That's it. The interactive wizard handles the rest. Add `--api` to auto-provision in your local Paperclip instance.

<br>

## Install

```sh
npx @yesterday-ai/paperclipper           # run directly (no install)
npm i -g @yesterday-ai/paperclipper      # or install globally → clipper
```

Requires **Node.js 20+**.

<br>

## Usage

The interactive wizard walks through these steps:

```
$ clipper --api

  ╭──────────────╮
  │   Clipper    │
  ╰──────────────╯

  Company name: Acme Corp
  Company goal: Build the best widgets in the world
  Description:  Ship v1 with core features and onboard first 10 customers

  Project name: Acme Corp
  GitHub repo URL: https://github.com/acme/widgets

  Select a preset:
  ❯ fast — Speed-optimized for solo engineer...
    quality — Quality-optimized with PR review...
    startup — Strategy-first bootstrapping...
    research — Research and planning only...
    full — Full company setup with everything...
    custom — Pick modules manually

  ✓ Company "Acme Corp" created
  ✓ Goal created
  ✓ Project created (workspace: companies/AcmeCorp/projects/AcmeCorp)
  ✓ CEO agent created
  ✓ Engineer agent created
  ✓ 4 issues created
  ✓ CEO heartbeat started
```

### Options

#### Company options

| Flag | Description | Default |
| :--- | :---------- | :------ |
| `--name <name>` | Company name | _(wizard prompt)_ |
| `--goal <title>` | Company goal title | _(wizard prompt)_ |
| `--goal-description <desc>` | Goal description | _(wizard prompt)_ |
| `--project <name>` | Project name | company name |
| `--project-description <desc>` | Project description | _(wizard prompt)_ |
| `--repo <url>` | GitHub repository URL | _(wizard prompt)_ |
| `--preset <name>` | Preset: `fast`, `quality`, `rad`, `startup`, `research`, `full` | _(wizard prompt)_ |
| `--modules <a,b,c>` | Comma-separated module names (merged with preset) | _(wizard prompt)_ |
| `--roles <a,b>` | Comma-separated extra role names (merged with preset) | _(wizard prompt)_ |

#### Infrastructure options

| Flag | Description | Default |
| :--- | :---------- | :------ |
| `--output <dir>` | Output directory for company workspaces | `./companies/` |
| `--api` | Provision via Paperclip API after file assembly | off |
| `--api-url <url>` | Paperclip API URL (implies `--api`) | `http://localhost:3100` |
| `--model <model>` | Default LLM model for all agents | adapter default |
| `--start` | Start CEO heartbeat after provisioning (implies `--api`) | off |

> Company directories use PascalCase: `"Black Mesa"` becomes `companies/BlackMesa/`

### Non-interactive mode

Pass `--name` and `--preset` to skip the wizard entirely. No TTY required.

```sh
# Minimal — assemble files only
clipper --name "Acme" --preset fast

# Full provisioning
clipper --name "Acme" --goal "Build widgets" --preset startup --api --start

# Custom composition
clipper --name "Acme" --preset fast --roles product-owner --modules pr-review

# Preset with overrides
clipper --name "Acme" --preset custom --modules github-repo,auto-assign,stall-detection

# In a CI/CD pipeline or script
clipper --name "$COMPANY" --preset "$PRESET" --api --api-url "$API_URL" --start
```

`--modules` and `--roles` are additive — they merge with whatever the preset includes.

<br>

## What You Get

```
companies/AcmeCorp/
├── BOOTSTRAP.md              # Setup guide (goal, project, agents, tasks)
├── agents/
│   ├── ceo/
│   │   ├── AGENTS.md         # Identity + skill references
│   │   ├── SOUL.md           # Persona and voice
│   │   ├── HEARTBEAT.md      # Execution checklist
│   │   ├── TOOLS.md          # Tool inventory
│   │   └── skills/           # Assigned by capability resolution
│   ├── engineer/
│   │   └── ...
│   ├── product-owner/        # ← if role selected
│   ├── code-reviewer/        # ← if role selected
│   ├── ui-designer/          # ← if role selected
│   └── ux-researcher/        # ← if role selected
├── projects/
│   └── AcmeCorp/             # Agent workspace (cwd)
└── docs/                     # Shared workflows from modules
```

With `--api`, everything is provisioned automatically. Without it, `BOOTSTRAP.md` has step-by-step instructions for manual setup.

> Files are read live by Paperclip agents — edit anything on disk and it takes effect on the next heartbeat.

<br>

## Gracefully Optimistic Architecture

Capabilities extend, they don't require. Start with CEO + Engineer, add specialists as needed:

| Capability | Primary Owner | Fallback | Module |
| :--------- | :------------ | :------- | :----- |
| `market-analysis` | UX Researcher &rarr; Product Owner | CEO | market-analysis |
| `hiring-review` | Product Owner | CEO | hiring-review |
| `roadmap-to-issues` | Product Owner | CEO | roadmap-to-issues |
| `auto-assign` | Product Owner | CEO | auto-assign |
| `user-testing` | UX Researcher &rarr; Product Owner | CEO | user-testing |
| `brand-identity` | UI Designer | CEO | brand-identity |
| `tech-stack` | Engineer | CEO | tech-stack |
| `architecture-plan` | Engineer | CEO | architecture-plan |
| `design-system` | UI Designer | Engineer | architecture-plan |
| `pr-review` | Code Reviewer / Product Owner | — | pr-review |
| `stall-detection` | CEO (always) | — | stall-detection |
| `vision-workshop` | CEO (always) | — | vision-workshop |

**How it works:** Primary owners get the full skill. Fallback owners get a safety-net variant that only activates when the primary is absent or stalled.

> **Example:** With just CEO + Engineer, the CEO handles market analysis, hiring review, and backlog management alongside strategy. Add a Product Owner and those responsibilities shift automatically — the CEO's skills downgrade to fallback-only safety nets.

<br>

## Presets

| Preset | Modules | Best for |
| :----- | :------ | :------- |
| **`fast`** | github-repo, roadmap-to-issues, auto-assign, stall-detection | Solo engineer, prototypes, MVPs |
| **`quality`** | + pr-review, + Product Owner, + Code Reviewer | Teams, production systems |
| **`rad`** | + tech-stack, + hiring-review | Rapid prototyping, formalize later |
| **`startup`** | + vision, market, hiring, tech, architecture | Strategy-first, grow organically |
| **`research`** | vision, market, tech, hiring (no repo/code) | Planning phase only |
| **`full`** | All modules + Product Owner + Code Reviewer | Full planning + quality engineering |

> **`fast`** is for a single engineer — multiple engineers without review will cause conflicts.
>
> **`research`** has no code workflow. Add `github-repo` and `roadmap-to-issues` when ready to build.

<details>
<summary><strong>Preset details</strong></summary>

**fast** — Solo engineer, direct-to-main, automated backlog. No review, no planning phase.

**quality** — Full review pipeline. Product Owner manages backlog and product alignment, Code Reviewer gates code quality. Feature branches with PR workflow.

**rad** — Rapid Application Development. Pick a tech stack, start building, hire when you hit bottlenecks. No upfront market research or architecture formalization — prototype first, learn from what you build, formalize later.

**startup** — Strategy-first. Starts with vision, market analysis, tech evaluation, and hiring review before any code. CEO and Engineer grow the team through board approvals.

**research** — Planning only. Vision, market research, tech evaluation, and team assessment. No repo, no code workflow. Upgrade to `startup` or `full` when ready to build.

**full** — Everything. Full strategic planning, quality engineering with PR review, team growth via hiring review. Product Owner and Code Reviewer included. Best for serious projects that need both strategy and engineering rigor.

</details>

<br>

## Modules

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

### Engineering Workflow

| Module | What it does | Kickoff task |
| :----- | :----------- | :----------- |
| **`github-repo`** | Git workflow and commit conventions | Engineer initializes repo |
| **`pr-review`** | PR-based review workflow | Engineer sets up branch protection |
| **`roadmap-to-issues`** | Auto-generate issues from goals when backlog runs low | Primary owner creates initial backlog |
| **`auto-assign`** | Assign unassigned issues to idle agents | — |
| **`stall-detection`** | Detect stuck handovers, nudge or escalate | — |
| **`ci-cd`** | Continuous integration and deployment pipeline | Engineer sets up CI/CD |
| **`monitoring`** | Observability, alerting, health checks | Engineer sets up monitoring |

<details>
<summary><strong>Module details</strong></summary>

#### vision-workshop

Defines the strategic foundation. The CEO runs a vision workshop to refine the company goal into a vision statement, success metrics, and milestones.

- **Capability:** none (CEO-only strategic task)
- **Doc:** `docs/vision-template.md`
- With UX Researcher: contributes user-centered metrics and journey mapping

#### market-analysis

Researches the target market, competitors, and positioning.

- **Capability:** `market-analysis` — owners: `ux-researcher` &rarr; `product-owner` &rarr; `ceo`
- **Fallback:** CEO creates a brief overview only
- **Doc:** `docs/market-analysis-template.md`

#### hiring-review

Evaluates team composition against the goal and proposes hires through board approval.

- **Capability:** `hiring-review` — owners: `product-owner` &rarr; `ceo`
- **Fallback:** CEO proposes one urgent hire only

#### tech-stack

Evaluates technology options and documents decisions with rationale and trade-offs.

- **Capability:** `tech-stack` — owners: `engineer` &rarr; `ceo`
- **Fallback:** CEO makes pragmatic defaults, marks them provisional
- **Doc:** `docs/tech-stack-template.md`

#### architecture-plan

Designs the system architecture. Requires `tech-stack`. Includes a `design-system` capability for UI Designers.

- **Capability:** `architecture-plan` — owners: `engineer` &rarr; `ceo`
- **Capability:** `design-system` — owners: `ui-designer` &rarr; `engineer`
- **Docs:** `docs/architecture-template.md`, `docs/design-system-template.md`

#### github-repo

Git workflow and commit conventions.

- **Task:** Engineer initializes repo
- **Doc:** `docs/git-workflow.md`

#### pr-review

PR-based review workflow. Requires `github-repo`. Activates with `code-reviewer` or `product-owner`.

- **Task:** Engineer sets up branch protection
- **Doc:** `docs/pr-conventions.md`

#### roadmap-to-issues

Auto-generates issues from the roadmap when the backlog runs low.

- **Capability:** `roadmap-to-issues` — owners: `product-owner` &rarr; `ceo`
- **Fallback:** CEO creates 1-2 issues only when backlog is critically empty

#### auto-assign

Assigns unassigned issues to idle agents.

- **Capability:** `auto-assign` — owners: `product-owner` &rarr; `ceo`
- **Fallback:** CEO assigns only when agents are critically idle

#### brand-identity

Creates brand guidelines: logo usage, color palette, typography, iconography, and tone of voice.

- **Capability:** `brand-identity` — owners: `ui-designer` &rarr; `ceo`
- **Fallback:** CEO creates minimal provisional placeholder
- **Doc:** `docs/brand-identity-template.md`

#### user-testing

Designs and executes usability evaluations, documents findings with severity ratings.

- **Capability:** `user-testing` — owners: `ux-researcher` &rarr; `product-owner` &rarr; `ceo`
- **Fallback:** CEO creates a basic heuristic checklist
- **Doc:** `docs/user-testing-template.md`

#### ci-cd

Continuous integration and deployment pipeline. Requires `github-repo`.

- **Task:** Engineer sets up CI/CD
- **Doc:** `docs/ci-cd-template.md`

#### monitoring

Observability, error tracking, logging, alerting, and health checks. Requires `github-repo`.

- **Task:** Engineer sets up monitoring
- **Doc:** `docs/monitoring-template.md`

#### stall-detection

Detects issues stuck in `in_progress` or `in_review` with no recent activity. Nudges the assigned agent, escalates to the board if nudging doesn't help.

- **Capability:** CEO-only

</details>

<br>

## Roles

Every company starts with **CEO** and **Engineer** (base roles). These optional roles extend the team:

| Role | Paperclip role | Reports to | Enhances |
| :--- | :------------- | :--------- | :------- |
| **Product Owner** | `pm` | CEO | Takes over roadmap, auto-assign, hiring-review from CEO |
| **Code Reviewer** | `qa` | CEO | Enables pr-review activation |
| **UI & Brand Designer** | `designer` | CEO | Takes over design-system and brand-identity |
| **UX Researcher** | `researcher` | CEO | Takes over market-analysis and user-testing |
| **CTO** | `cto` | CEO | Technical leadership, architecture oversight |
| **CMO** | `cmo` | CEO | Marketing strategy, go-to-market, growth metrics |
| **CFO** | `cfo` | CEO | Financial planning, budget tracking, cost analysis |
| **DevOps Engineer** | `devops` | CEO | Takes over ci-cd and monitoring from Engineer |
| **QA Engineer** | `qa` | CEO | Takes over user-testing, quality gates |

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

</details>

<br>

## After Clipper

### With `--api` (recommended)

Clipper provisions everything in the local Paperclip instance automatically:

1. **Company** — created with the name you entered
2. **Goal** — company-level goal, set to `active`
3. **Project** — workspace pointing to `companies/<Name>/projects/<ProjectName>/`
4. **Agents** — one per role, with `cwd`, `instructionsFilePath`, model, and adapter config
5. **Issues** — initial tasks from modules, linked to goal and project
6. **CEO heartbeat** — optionally started with `--start`

### Without `--api`

Follow the `BOOTSTRAP.md` file generated in the company directory. It lists every resource to create manually in the Paperclip UI.

<br>

## Extending

### Add a module

```
templates/modules/<name>/
├── module.json                  # Name, capabilities, tasks, dependencies
├── skills/                      # Shared skills (used by any primary owner)
│   └── <skill>.md
├── agents/<role>/skills/        # Role-specific overrides and fallbacks
│   ├── <skill>.md               # Override (replaces shared for this role)
│   └── <skill>.fallback.md      # Fallback (safety-net for non-primary)
└── docs/                        # Shared docs (→ docs/)
```

<details>
<summary><strong>module.json schema</strong></summary>

```json
{
  "name": "my-module",
  "requires": ["other-module"],
  "activatesWithRoles": ["my-role"],
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
  ]
}
```

| Field | Description |
| :---- | :---------- |
| `requires` | Other modules that must be selected |
| `activatesWithRoles` | Module only applies if one of these roles is present |
| `capabilities[].owners` | Priority order — first present role gets the primary skill |
| `capabilities[].fallbackSkill` | Filename (without `.md`) of the fallback variant |
| `tasks[].assignTo` | A role name or `"capability:<skill>"` to auto-resolve |

</details>

<details>
<summary><strong>Skill resolution</strong></summary>

When assembling a capability's primary skill, the system checks in order:

1. **Role-specific override:** `agents/<role>/skills/<skill>.md`
2. **Shared skill:** `skills/<skill>.md`

First match wins. Most capabilities only need a shared skill. Role-specific overrides exist only when a role brings a genuinely different approach. Fallback variants are always role-specific.

```
Example: market-analysis module
├── skills/
│   └── market-analysis.md                    # Shared: any primary owner
├── agents/
│   ├── ux-researcher/skills/
│   │   └── market-analysis.md                # Override: user-focused
│   └── ceo/skills/
│       └── market-analysis.fallback.md       # Fallback: brief overview
```

- **UX Researcher** present &rarr; gets role-specific override (user-focused)
- **Product Owner** primary &rarr; gets shared skill
- **CEO** primary &rarr; gets shared skill
- **CEO** as fallback &rarr; gets fallback variant

</details>

### Add a role

```
templates/roles/<name>/
├── role.json        # Name, title, paperclipRole, reportsTo, adapter
├── AGENTS.md
├── SOUL.md
├── HEARTBEAT.md
└── TOOLS.md
```

<details>
<summary><strong>role.json schema</strong></summary>

```json
{
  "name": "my-role",
  "title": "My Role",
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
| `paperclipRole` | Paperclip enum: `ceo`, `engineer`, `pm`, `qa`, `designer`, `cto`, `cmo`, `cfo`, `devops`, `researcher`, `general` |
| `adapter` | Passed to `adapterConfig` during provisioning. `--model` CLI flag is fallback. |

</details>

### Add a preset

```json
{
  "name": "my-preset",
  "description": "What this preset is for",
  "constraints": [],
  "base": "base",
  "roles": ["product-owner"],
  "modules": ["github-repo", "roadmap-to-issues"]
}
```

<br>

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Wizard    │────▶│   Assembly   │────▶│   Provisioning   │
│  (prompts)  │     │  (files)     │     │   (API, --api)   │
└─────────────┘     └──────────────┘     └──────────────────┘
```

**Assembly** (always runs):

1. Copies base role files (CEO, Engineer) into `agents/`
2. Copies selected extra roles into `agents/`
3. For each module: resolves capability ownership, installs skills, copies docs
4. Generates `BOOTSTRAP.md` with goal, project, agent paths, and initial tasks

**Provisioning** (with `--api`):

1. Creates company &rarr; goal &rarr; project (with workspace) &rarr; agents &rarr; issues
2. Wires `reportsTo` hierarchy (CEO first, then other agents)
3. Optionally starts CEO heartbeat (`--start`)

<br>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE) &mdash; [Yesterday](https://yesterday.ai)
