# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Company Wizard is a [Paperclip](https://github.com/paperclipai/paperclip) plugin for bootstrapping agent company workspaces. It provides an interactive wizard UI (manual and AI-powered paths) that assembles companies from modular templates and optionally provisions them via the Paperclip API. Derived from the standalone `@yesterday-ai/paperclip-plugin-company-wizard` CLI.

## Commands

```bash
pnpm build          # esbuild: worker + manifest + UI → dist/
pnpm dev            # watch mode
pnpm test           # vitest: tests/**/*.spec.ts
pnpm test:logic     # node --test: src/logic/*.test.js + src/api/*.test.js
pnpm typecheck      # tsc --noEmit
```

After `pnpm build`, reload the plugin in the Paperclip UI. No reinstall required.

## Architecture

**Plugin worker** (`src/worker.ts`) — Registers actions via the Paperclip Plugin SDK:
- `preview-files` — Assembles to a temp dir, returns `.md` file tree as `{path, content}[]`, cleans up. Used by the ConfigReview step for inline preview+edit before provisioning.
- `start-provision` — Assembles to the workspace `companies/` dir, applies `fileOverrides` (edits from preview), then provisions via Paperclip API.
- `check-auth` — Validates Paperclip API credentials early (used by the summary step).
- `ai-chat` — Proxies messages to the Anthropic API using the configured key. Returns `{ text, error? }` — never throws.
- `check-ai-config` — Lightweight check that `anthropicApiKey` is configured. Called by the AI wizard on mount to show a warning banner.
- `refresh-templates` — Official default uses bundled release templates; custom remote sources refresh atomically into URL-specific caches. Explicit local paths are never overwritten. Provisioning does not silently refresh after preview.
- `list-pending-hires` — Requires run approval IDs; filters live pending `hire_agent` records by company, type, and ID.
- `approve-pending-hires` — Requires explicit selected IDs and re-reads live approvals before board-authorized approval. Provisioning never auto-approves.
- `start-bootstrap` — Explicit issue-bound, idempotent CEO wake after checking company, assignee, status, and invokability; restores an absent watchdog best-effort.

All worker actions return errors as `{ error }` instead of throwing, so the plugin host never swallows messages in generic 502 responses.

**Plugin UI** (`src/ui/`) — React state machine (WizardContext + reducer). Manual path: ONBOARDING → NAME → GOAL → REPOSITORY → PRESET → MODULES → ROLES → SUMMARY → PROVISION → DONE. AI path: ONBOARDING → AI_WIZARD → PROVISION → DONE.

**Build** — esbuild bundles `src/worker.ts`, `src/manifest.ts`, and `src/ui/main.tsx` into `dist/`. CSS via PostCSS/Tailwind 4.

### Source Layout

- `src/worker.ts` — Worker entry point; registers actions with `ctx.actions.register`
- `src/manifest.ts` — Plugin manifest: `id: "starlein.paperclip-plugin-company-wizard"`, `displayName: "Company Wizard"`
- `src/logic/assemble.js` — File assembly: copies templates, resolves capabilities, generates BOOTSTRAP.md
- `src/logic/resolve.js` — Capability resolution, role formatting, module dependency expansion
- `src/logic/load-templates.js` — Loads presets, modules, roles. Exports `collectGoals()`, `validateGoal()`
- `src/logic/routines.js` — Routine template helpers shared by assembly and provisioning: `routineTitle()` (accepts the legacy `name` key), `routineConcurrencyPolicy()` (maps/validates against Paperclip's enum), `routineUsesProjectWorkspace()`, `routineProjectPayload()`
- `src/api/client.js` — Paperclip REST API client (auto-detects auth: no-op for local_trusted, Better Auth sign-in for authenticated). Network errors wrapped with actionable messages. Methods: `createCompany`, `getCompany`, `updateCompany`, `deleteCompany`, `listAgents`, `getAgent`, `createAgent` (governed `/agent-hires`, returns pending approval ids without auto-approving), `createGoal`, `createProject`, `updateProject`, `createIssue` (accepts an optional `watchdog: { agentId, instructions? }`), `setIssueWatchdog`/`getIssueWatchdog`/`deleteIssueWatchdog` (task-watchdog upsert via `PUT/GET/DELETE /issues/:id/watchdog`), `putIssueDocument`, `createRoutine`, `createRoutineTrigger`, `triggerHeartbeat`
- `src/ui/context/WizardContext.tsx` — State machine + reducer. Key state: `goals: Goal[]`, `projects: WizardProject[]`, `fileOverrides: Record<string,string>`, `existingCompanyId: string` (when set, provisioning targets this company instead of creating a new one)
- `src/ui/components/ConfigReview.tsx` — Review step: calls `preview-files`, shows collapsible `FileEntry` components with inline edit. Overrides dispatched via `SET_FILE_OVERRIDE`/`DELETE_FILE_OVERRIDE`
- `src/ui/components/steps/StepProvision.tsx` — Passes `fileOverrides` to `start-provision`

### Template System

```text
templates/
├── roles/           # All roles with role.meta.json (base: true for always-present roles)
├── modules/         # Composable capabilities with module.meta.json
│   └── <module>/
│       ├── module.meta.json           # capabilities[], activatesWithRoles[], issues[], routines[]?, permissions[], adapterOverrides?, goal?
│       ├── skills/                    # Shared primary skills (any owner can use)
│       │   └── <skill>.md
│       ├── agents/<role>/
│       │   ├── skills/                # Role-specific overrides + fallback variants
│       │   │   ├── <skill>.md         # Override (replaces shared for this role)
│       │   │   └── <skill>.fallback.md # Fallback (reduced scope for non-primary)
│       │   └── heartbeat-section.md   # Optional: injected into role's HEARTBEAT.md
│       └── docs/                      # Shared docs injected into all agents
├── presets/         # Curated module+role combinations with preset.meta.json (may include goals[])
└── ai-wizard/       # Configurable prompts for AI wizard mode
    ├── config-format.md
    ├── single-shot-system.md
    ├── interview-system.md
    └── messages.json
```

**Current counts**: 15 presets, 27 modules, 16 optional roles (CEO is the only base role).

**Optional lean delivery**: `lean-delivery` requires `pr-review` (and transitively `github-repo`) and is not included in built-in presets. It adds `docs/lean-delivery.md`, one non-author Code Reviewer gate, and risk-triggered evidence. Queue counts are advisory, not fixed gates. Standard review retains role-based stages; actual blockers and explicit operator capacity policies apply in both modes.

### Skill Resolution

Skills are provisioned as **Company Skills** (Skills Store) rather than written as files into `agents/<role>/skills/`. The assembler resolves skill markdown from two locations in priority order:

1. `agents/<role>/skills/<skill>.md` — role-specific override (wins if present)
2. `skills/<skill>.md` — shared skill (default for any primary owner)

`assembleCompany()` returns `companySkills` (array of `{ slug, name, markdown }`) and `roleSkillSlugs` (`Map<role, slug[]>`). During provisioning, each skill is created once in the Skills Store, and agent hire requests carry a `desiredSkills` field (derived from `roleSkillSlugs`) so agents receive only their assigned slugs. Role-specific overrides exist only when a role brings a genuinely different approach. Fallback variants are always role-specific.

### Doc References in Skills

Two kinds of docs live in `{company}/docs/`:

- **Templates** (`lowercase-kebab.md`) — Shipped by modules, copied at assembly time. Safe to reference directly.
- **Agent output** (`UPPERCASE.md`) — Created by agents during execution. Always wrap in "if exists" conditionals.

**Path convention.** Skills are installed into the Skills Store, not next to `AGENTS.md`, so skill markdown, module docs, and module/preset issue text reference docs as `docs/<file>.md` — relative to the agent's working directory, which `buildCeoAdapterConfig`/`buildWorkerAdapterConfig` set to the company dir. Only `roles/*/AGENTS.md` and the generated "Shared Documentation" list use `../../docs/<file>.md`, because those live at `{company}/agents/<role>/` and adapters resolve their relative references from that file's directory. Skills must likewise name other skills by slug (`pr-workflow`), never as `skills/<name>.md` — assembly writes no such file.

### Heartbeat Injection

Convention-based: if a module provides `agents/<role>/heartbeat-section.md`, assembly injects it into that role's HEARTBEAT.md before the `<!-- Module-specific ... -->` marker comment. Multiple modules can inject into the same role.

Currently 3 modules have heartbeat sections: `stall-detection` (CEO), `auto-assign` (CEO fallback + PO primary), `backlog` (CEO fallback + PO primary).

### Persona Enrichment

Enabled by default when templates provide fragments. The plugin no longer exposes an `enableEnrichedPersonas` setting; assembly appends fragment files into the generated agent files and never emits the fragments as standalone files — `isEnrichmentFragment()` filters `LENSES.md`, `DONE.md`, and `*.bar.md` from every copy path.

- `roles/<role>/LENSES.md` → appended to that role's `SOUL.md` (domain lenses). Lens-heavy: `security-engineer`, `ux-researcher`, `ui-designer`; focused: `product-owner`, `code-reviewer`, `devops`. Operational roles (`engineer`, `qa`) intentionally have none.
- `roles/<role>/DONE.md` → appended to that role's `HEARTBEAT.md` (done-criteria + heartbeat-exit rule); present for all 8 enriched roles.
- `modules/<module>/skills/<skill>.bar.md` → appended to the installed **primary** skill `<skill>.md` (output/review bar). Resolved via `resolveSkillFile` (role-specific override first, then shared), so role-specific-primary capabilities (e.g. `design-system`) carry a role-specific bar. Fallback skills stay lean. Non-capability skills (e.g. `pr-review`) do not receive bars in this iteration.

### Key Concepts

- **Goals and projects** — `WizardState.goals: Goal[]` holds user-specified goals (from manual step or AI wizard). `WizardState.projects: WizardProject[]` holds user-specified projects. Each `Goal` has `title`, `description`, and optional `parentGoal` for sub-goal hierarchy. Each `WizardProject` has `name`, `description`, and `goals[]` (goal titles it's linked to, matching Paperclip API `goalIds`).
- **Inline goals** — Module-level goals (`goal: {}` in `module.meta.json`) and preset goals (`goals: []` in `preset.meta.json`). Goals can have `subgoals[]` (nested goals with `id`, `title`, `level`, `description`). `collectGoals()` merges them at runtime as `inlineGoals`. During assembly, inline goals become sub-goals of the main user goal, and subgoals are expanded into the goal hierarchy.
- **Module issues and routines** — Issues are at module/preset level (`issues[]`), not inside goals. Routines (`routines[]`) define recurring scheduled work with `assignTo`, `schedule` (cron), and `concurrencyPolicy`. Both are collected from active modules during assembly.
- **`assembleCompany()` params** — `userGoals` (from wizard), `userProjects` (from wizard), `inlineGoals` (from `collectGoals()`). Module inline goals are auto-parented to `userGoals[0]`. If no `userProjects` specified, a default project linked to all goals is created.
- **Paperclip object model** — Goals have `level` (`company` | `team` | `agent` | `task`), nested via `parentId`. Projects link to goals via `goalIds`. Issues link to projects via `projectId`. Routines have `assigneeAgentId`, `schedule`, and cron triggers. `instructionsFilePath` sets the agent's working directory.
- **`assignTo: "user"`** — Issues assigned to the board user via `assigneeUserId` (resolved during `client.connect()`).
- **`companyDescription`** — AI wizard generates a comprehensive description. Stored in `WizardContext.companyDescription`, rendered in BOOTSTRAP.md, and sent to the Paperclip API as the company's `description` field.
- **File overrides** — `WizardContext.fileOverrides` (`Record<string,string>`) stores edits made in ConfigReview. Passed to `start-provision` as `params.fileOverrides`; written over assembled files before API provisioning.
- **Gracefully optimistic architecture** — Capabilities extend when roles are present, degrade gracefully when absent. A capability's `owners[]` chain determines primary/fallback assignment at assembly time.
- **`adapterOverrides` field** — Module-level adapter config (e.g., `{ "chrome": true }`) merged into agent `adapterConfig` at provisioning. Keeps role templates clean.
- **toPascalCase** — Company and project names become PascalCase directory names. Special characters are stripped.
- **BOOTSTRAP.md** — Generated guide with: company description, goal hierarchy (with `level` and `parentGoal` in HTML-comment frontmatter), projects with workspace + goal links, agents with role + instructionsFilePath, issues with assignee + project, routines with schedule + concurrencyPolicy, Company Skills (pre-provisioned slugs in the Skills Store), and provisioning steps in API dependency order. Used as the bootstrap issue description for the CEO.

### Paperclip API Flow (start-provision)

Connects to Paperclip API (auto-detects auth mode). Resolves the target company: creates a new one (with `companyDescription`) or, when `existingCompanyId` is passed, loads it via `getCompany` (existing-company runs skip company creation and skip cleanup on error). Creates Board Operations and Hiring Plan issues, writes `decision-log` and `hiring-plan` documents. **Provisions Company Skills** — each skill from `companySkills` is upserted into the Skills Store before any agents are hired. Then provisions CEO/team agents via governed `/agent-hires` requests with full managed `instructionsBundle` payloads, `sourceIssueId` provenance, and `desiredSkills` set deterministically per role from `roleSkillSlugs` (replacing the old `preserveExistingSkillSync` approach). Pending approval ids are logged for board action and are not auto-approved. Scheduled routines are created with board authority, then a Bootstrap Issue is created for the CEO (description = BOOTSTRAP.md content, title uses the resolved company name). A **task watchdog** is then attached to the Bootstrap Issue (CEO as watchdog agent, with recovery instructions) so the initial setup self-recovers if it stalls — best-effort, since in the governed hire flow the CEO may still be pending approval (not yet invokable), in which case the upsert fails non-fatally and provisioning continues. The CEO then reads the bootstrap issue and creates remaining goals/issues and links pre-created projects as described in BOOTSTRAP.md.

### Execution Workspace Policy

`effectiveExecutionPolicy()` in `assemble.js` resolves the `executionWorkspacePolicy` sent with the project (and rendered into BOOTSTRAP.md). It **always returns a policy** — the wizard no longer lets the server fall back to an implicit default:

- Isolated `git_worktree` mode only when the instance experimental setting `enableIsolatedWorkspaces` is on **and** the project is an existing external repo (`sourceType: "git_repo"`). A fresh local repo defers isolation (no base ref exists yet on first run).
- Otherwise an explicit `shared_workspace` policy.

Every branch carries `sharedWorkspaceConcurrency: "serialize"` unless the project pins its own value. Paperclip's `auto` only serializes non-local environments, so on a local driver it would let every agent run enter the *same* working tree concurrently and collide on git state. The deferral is bounded by holder liveness (60–120 s backoff), not an attempt counter, so a deferred run never starves.

`enabled` is required by Paperclip's `projectExecutionWorkspacePolicySchema` (which is `.strict()` — unknown keys are a 400). Never forward a partial policy verbatim; every return path defaults `enabled` to `true`.

Current Paperclip ignores workspace policies/settings when `enableIsolatedWorkspaces` is off. Project serialization also requires `enabled: true`; explicit issue concurrency/mode settings take precedence. Preserve operator opt-outs and never claim that storing `serialize` alone guarantees enforcement.

### Task Watchdogs

Watchdogs are native event-driven stall recovery. The wizard attaches one to bootstrap best-effort and retries an absent watchdog on explicit startup after hire approval; existing operator watchdogs are preserved. Generated workflows attach bounded recovery only where appropriate. The watchdog agent must be invokable. Never archive/delete reusable execution workspaces as a recovery shortcut.

### Model Defaults

Codex CEO/team default is `gpt-5.6-sol` (`DEFAULT_CEO_MODEL`); Claude default is `claude-opus-4-8` (`DEFAULT_CLAUDE_CEO_MODEL`). In the UI (`StepName.tsx`) the model field is an optional free-text override with an adapter-aware suggestion datalist — Codex: `gpt-5.6-sol`/`terra`/`luna`, `gpt-6-astra`, `gpt-5.4`; Claude: `claude-opus-4-8`, `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5-1`, `claude-fable-5`, `claude-mythos-5`, `claude-sonnet-4-6`. The lists mirror the ids each Paperclip adapter publishes (`gpt-6-astra` additionally accepts the extended `max`/`ultra` reasoning efforts); unknown ids stay valid as manual models. Empty means "use the adapter-appropriate default" (resolved in `buildCeoAdapterConfig`).

Use the concrete `gpt-5.6-sol` slug, not the bare `gpt-5.6` alias: OpenAI publishes no model metadata for the bare slug, so the Codex CLI warns (`Model metadata for gpt-5.6 not found`) and falls back to generic context-window limits. Paperclip's `codex_local` adapter rewrites the bare alias for legacy agents (`CODEX_LOCAL_MODEL_ALIASES`), but new companies should never be provisioned onto it.

`ADAPTER_TYPES` in `StepName.tsx` mirrors Paperclip's built-in `AGENT_ADAPTER_TYPES`. Adapter type is an open string server-side (external adapters may register their own), so the list is a convenience picker, not a constraint.

The wizard never changes `requireBoardApprovalForNewAgents`. Pending approvals remain explicit board decisions.

## Test Suites

Two separate test runners:
- `pnpm test` — vitest, `tests/**/*.spec.ts` — TypeScript plugin tests
- `pnpm test:logic` — `node --test`, `src/logic/*.test.js` and `src/api/*.test.js` — Plain-JS logic tests

## React Considerations

- All paths in agent `adapterConfig` must be absolute (agents may run in different cwd)
- Tailwind 4: use `wrap-break-word` not `break-words`
- `@ts-ignore` suppresses hints on the three plain-JS imports in `worker.ts`

## Legacy Note

This plugin was derived from [`@yesterday-ai/paperclip-plugin-company-wizard`](https://github.com/Yesterday-AI/paperclip-plugin-company-wizard), the standalone Ink-based CLI. The template system, assembly logic, and API client were carried over intact. The CLI entry points (`src/cli.jsx`, `src/app.jsx`, `src/headless.js`), Ink components, and old build config were removed. See `CHANGELOG.md` for the full v0.1.0 feature list.
