# Agent Persona Enrichment — Design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)
**Setting:** `enableEnrichedPersonas` (boolean, default `false`)

## Motivation

The upstream `paperclip-create-agent` skill (`skills/paperclip-create-agent/references/`)
ships hand-written agent templates that encode three quality levers our generated
templates lack:

1. **Domain lenses** — 5–15 named mental models an expert agent cites when making
   judgment calls (e.g. STRIDE, Nielsen's 10, RICE). The single biggest quality lever
   for judgment-heavy roles.
2. **Output / review bars** — concrete "what good (and not-done) work looks like"
   statements with negative examples, near the work definition.
3. **Done criteria + heartbeat-exit rule** — an explicit "verify before done" check and
   the "always leave a task comment before exiting a heartbeat" reliability rule.

Our role templates (`SOUL.md` persona + `HEARTBEAT.md` checklist) and module skills are
lean. This work adds the three levers as **opt-in enrichments**, gated behind a new
plugin setting so the default behaviour is unchanged.

## Key principle: lens density varies by role

The reference is explicit that lenses are *"the single biggest quality lever for expert
roles and the single biggest noise source for operational roles."* Operational roles
(coder/engineer, QA) deliberately get **no** lens lists — judgment is not their
deliverable; a strong output bar serves them better.

| Role | Lens density | Example lenses |
| :--- | :--- | :--- |
| `security-engineer` | lens-heavy (10–14) | STRIDE, OWASP Web/API/LLM Top 10, least privilege, fail-closed, blast radius, supply-chain trust, prompt-injection / excessive-agency, AuthN ≠ AuthZ |
| `ux-researcher` | lens-heavy (8–12) | Nielsen's 10, Jakob's / Hick's / Fitts's Law, Recognition over Recall, Tesler's Law, Kano, Jobs-to-be-Done, evidence over opinion, WCAG POUR |
| `ui-designer` | lens-heavy (8–12) | Gestalt, visual hierarchy, type scale & rhythm, contrast / WCAG, design tokens & consistency, affordance & signifiers, progressive disclosure, brand coherence |
| `product-owner` | focused (~6) | RICE / ICE, MoSCoW, Kano, opportunity cost, outcome over output, INVEST, WSJF |
| `code-reviewer` | focused (~6) | correctness-first, blast radius, readability / maintainability, test adequacy, security smell, smallest-diff |
| `devops` | focused (~7) | error budgets, MTTR, rollback path, canary vs full deploy, observability-before-launch, IaC, least-privilege IAM, idempotency |
| `engineer`, `qa` | **none** | intentionally omitted (operational) — strong output bar instead |

All lens text is written in our own words. We adopt the *structure and concepts* from the
reference, not its prose, to keep a clean boundary from the upstream repo.

## Architecture

Enrichment content lives in **separate fragment files**, never inline in the baseline
templates. Assembly conditionally injects fragments only when the setting is on. This
mirrors the existing module `heartbeat-section.md` injection and `<skill>.fallback.md`
convention, and guarantees the lean baseline is byte-for-byte unchanged when the setting
is off.

The flag is threaded exactly like the existing `enableIsolatedWorktrees` parameter:

```
manifest.ts  →  worker.ts (cfgBool)  →  assembleCompany({ enableEnrichedPersonas })
                                          ├─ preview-files  (preview reflects the toggle)
                                          └─ start-provision
```

### Fragment files

| Enrichment | Fragment location | Injected into |
| :--- | :--- | :--- |
| Domain lenses | `templates/roles/<role>/LENSES.md` | appended to the role's `SOUL.md` under a `## Domain Lenses` heading |
| Output / review bar | `templates/modules/<module>/skills/<skill>.bar.md` (and role-specific `agents/<role>/skills/<skill>.bar.md` where the override exists) | appended to the resolved primary skill content when that skill is installed |
| Done criteria + heartbeat-exit | `templates/roles/<role>/DONE.md` | appended to the role's `HEARTBEAT.md` after the module heartbeat-section marker |

Fragment files are excluded from the normal role/skill copy step (same way `*.meta.json`
and `*.fallback.md` are filtered) so they are never emitted verbatim — they are only ever
appended through the injection path.

### Assembly changes (`src/logic/assemble.js`)

1. New `assembleCompany` param `enableEnrichedPersonas = false`.
2. After copying a role's files, if `enableEnrichedPersonas` and `roles/<role>/LENSES.md`
   exists, append it to the assembled `SOUL.md`.
3. After the existing heartbeat-section injection, if enriched and `roles/<role>/DONE.md`
   exists, append it to the assembled `HEARTBEAT.md`.
4. In the skill-install step, after resolving a primary skill, if enriched and a sibling
   `<skill>.bar.md` exists (role-specific override first, then shared), append it to the
   installed skill content.
5. Output bars apply to **primary** skills only — fallback variants stay lean.

### Worker changes (`src/worker.ts`)

- `const enableEnrichedPersonas = cfgBool(cfg, 'enableEnrichedPersonas')`.
- Pass it into both the `preview-files` and `start-provision` `assembleCompany` calls.

### Manifest change (`src/manifest.ts`)

```ts
enableEnrichedPersonas: {
  type: 'boolean',
  default: false,
  description:
    'Optional. If true, expert roles are enriched with domain lenses (named mental ' +
    'models), module skills gain concrete output/review bars with negative examples, ' +
    'and HEARTBEAT.md gains explicit done-criteria. Leave false (default) for the lean ' +
    'baseline personas.',
},
```

## Output / review bar — role → module-skill mapping

Bars sit next to the work definition (per the placement decision). First-iteration targets:

| Role | Module skill(s) getting a `.bar.md` |
| :--- | :--- |
| `engineer` | tech-stack, architecture-plan, build-api/api-design, codebase-onboarding/codebase-audit |
| `qa` | user-testing, accessibility/accessibility-audit |
| `security-engineer` | security-audit (threat-model, security-review) |
| `ux-researcher` | market-analysis, user-testing |
| `ui-designer` | brand-identity, architecture-plan/design-system |
| `product-owner` | backlog |
| `code-reviewer` | pr-review |
| `devops` | ci-cd, monitoring |

Each bar states: the deliverable shape, what it must include (evidence/repro/acceptance),
and at least one concrete negative example ("a flow that works but looks unstyled is not
done"). The implementation plan enumerates the exact skill files.

## Component: Done criteria + heartbeat-exit (`roles/<role>/DONE.md`)

A short closing block appended to `HEARTBEAT.md`:

- how to verify the work before marking an issue done (smallest proving check),
- what evidence goes in the final comment,
- who the task is reassigned to on completion,
- the verbatim rule: *always update your task with a comment before exiting a heartbeat.*

Applied to the 8 roles this iteration touches (the 6 lens-bearing roles plus `engineer`
and `qa`). Rolling it out to all 17 roles is a fast-follow, noted in the ROADMAP.

## Documentation updates

- `README.md` — add `enableEnrichedPersonas` to the Configuration table; one line under
  the relevant section describing lenses / output bars / done-criteria.
- `CLAUDE.md` — document the fragment-file convention and the new assembly param.
- `AGENTS.md` — note the enrichment fragments in the template-layout description.
- `ROADMAP.md` — move this work to Done; keep "contributor role-authoring guide" and
  "roll done-criteria out to all roles" as backlog items.
- `CHANGELOG.md` + version bump (next patch release) at release time.

## Testing

`src/logic/assemble.test.js` (node:test):

1. **Off (default):** assembled `SOUL.md` / `HEARTBEAT.md` / skills contain no lens,
   bar, or done-criteria markers — baseline unchanged.
2. **On:** a lens-heavy role's `SOUL.md` contains its `## Domain Lenses` section; a
   primary skill contains its output bar; `HEARTBEAT.md` contains the done-criteria block.
3. **Operational roles:** with the flag on, `engineer` and `qa` `SOUL.md` contain **no**
   lens section (they have no `LENSES.md`).
4. **Fragments never leaked:** `LENSES.md` / `DONE.md` / `*.bar.md` are not emitted as
   standalone files in the assembled company.

`pnpm typecheck`, `pnpm test`, `pnpm test:logic` all green.

## Out of scope (this iteration)

- Contributor role-authoring guide doc (deferred; ROADMAP backlog).
- Lenses for operational roles (engineer, qa) — intentionally excluded.
- Rolling done-criteria out to all 17 roles (fast-follow).
- Any provisioning/adapter governance items from the reference checklist (timer-heartbeat
  defaults, desiredSkills) — already handled by our provisioning logic.
