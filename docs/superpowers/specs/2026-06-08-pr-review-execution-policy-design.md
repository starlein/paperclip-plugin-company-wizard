# PR Review via native `executionPolicy` — Design

**Date:** 2026-06-08
**Status:** Approved (design), pending implementation plan
**Scope owner:** Company Wizard plugin (`pr-review` module + assembly)

## Problem

The `pr-review` module coordinates code review by having the Engineer agent
**manually create explicit child review issues** assigned to the Code Reviewer
and Product Owner (plus UI Designer / UX Researcher / QA / DevOps when relevant).
Each PR therefore spawns 2–6 extra Paperclip issues that exist only to carry a
review verdict.

Paperclip already models review natively. The bundled SDK
(`@paperclipai/shared` `2026.529.0`, the plugin's peer-dependency minimum)
exposes on issue creation/update an `executionPolicy` with ordered `stages`,
where each stage has `type ∈ {"review", "approval"}` and `participants[]`
(`agent` or `user`). These are exactly the "reviewer" / "approver" fields
surfaced in the Paperclip UI. `client.createIssue` already forwards
`executionPolicy`.

This was verified against the running instance: installed `@paperclipai/shared`
is exactly `2026.529.0`, the instance at `localhost:3100` is reachable, and the
bundled Zod schemas are the host's create/update validation.

## Goal

Replace the child-review-issue mechanism with native `executionPolicy` stages,
both for runtime PR reviews and for statically declared module/preset issues.
This removes the per-PR review issues and surfaces reviewer/approver in the
native UI.

## Non-Goals

- **General issue minimization** across the 26 modules (which static `issues[]`
  to drop or consolidate) is a separate follow-up project, not part of this
  spec. This change reduces issue count for the review flow only, as a side
  effect.
- **GitHub-native approving reviews** stay orthogonal and unchanged: they still
  require distinct non-author GitHub credentials and remain optional.

## Decisions

1. **Full replacement, no fallback.** The peer dependency `>=2026.529.0`
   guarantees `executionPolicy` + stage types `review`/`approval` on every
   supported instance, so the child-issue path is removed entirely.
2. **Canonical stage order:** `review` (Code Reviewer, always) → 0..n `review`
   stages for domain reviewers (UI Designer / UX Researcher / QA / DevOps) →
   `approval` (Product Owner, always last, the final gate).
3. **Domain reviewers are context-dependent.** They are appended as additional
   `review` stages only when the role exists in the team **and** is relevant to
   the change (e.g. a UI diff adds the UI Designer). This mirrors today's
   behaviour, expressed as stages instead of child issues.
4. **Stage types are semantic, not functional.** Both `review` and `approval`
   run sequentially, take exactly one approval each (`approvalsNeeded` is a
   literal `1`), and share the same outcomes (`approved` / `changes_requested`).
   `review` = professional critique, `approval` = final sign-off. Two mandatory
   distinct gates are expressed as two stages.
5. **Plugin declaration uses the same model** (see below).

## Stage Model (canonical)

A PR review issue carries:

```jsonc
{
  "mode": "normal",
  "commentRequired": true,
  "stages": [
    { "type": "review",   "participants": [{ "type": "agent", "agentId": "<code-reviewer>" }] },
    { "type": "review",   "participants": [{ "type": "agent", "agentId": "<ui-designer>" }] },
    { "type": "approval", "participants": [{ "type": "agent", "agentId": "<product-owner>" }] }
  ]
}
```

Participant constraints (from the schema): `type: "agent"` requires `agentId`
and forbids `userId`; `type: "user"` requires `userId` and forbids `agentId`.

## Two Paths, One Model

### A) Runtime — PR reviews requested by the Engineer agent

The Engineer, after `gh pr create`, sets the `executionPolicy` on the
**originating issue** via `updateIssue` instead of creating child issues, and
resolves reviewer roles → `agentId` via `listAgents`. Paperclip drives the issue
through the stages, wakes each participant, and records decisions. The Engineer
remains the merge owner and merges once all stages have passed.

Changed templates:

- `templates/modules/pr-review/agents/engineer/skills/pr-workflow.md` — steps
  7–9: set `executionPolicy` (review stage = Code Reviewer, optional domain
  review stages, approval stage = Product Owner) on the originating issue;
  merge when the issue clears its stages; drop child-issue creation.
- Reviewer skills (`code-reviewer/code-review.md`,
  `product-owner/product-review.md`, `ui-designer/design-review.md`,
  `ux-researcher/ux-review.md`, `qa/qa-review.md`, `devops/infra-review.md`) —
  reframed: "you are the participant of a review/approval stage on the issue;
  inspect the linked PR and record your `approved` / `changes_requested`
  verdict (optionally mirrored as a PR comment)" — no child review issue.
- `templates/modules/pr-review/docs/pr-conventions.md` — "Review Workflow" and
  "Review Roles" sections rewritten around stages.
- `templates/modules/pr-review/module.meta.json` — `description` and the setup
  issue text updated to describe the executionPolicy flow.

### B) Plugin declaration — static `issues[]` from modules/presets

Module/preset issues are not created by the plugin; they are rendered into
**BOOTSTRAP.md** and created by the CEO at runtime, who resolves role names →
`agentId` (exactly as it already does for `assigneeAgentId → "engineer"`).

New optional field on a declared issue:

```jsonc
"reviewGate": { "reviewers": ["code-reviewer", "qa"], "approver": "product-owner" }
```

- `assemble.js` resolves each role via the existing `resolveAssignee` (dropping
  roles not present in the assembled team), and renders the resulting
  reviewer/approver chain into BOOTSTRAP.md as an executionPolicy sketch
  expressed with role names.
- The CEO builds the real `executionPolicy` when creating the issue (role →
  agentId, ordered as: reviewers as `review` stages, approver as the final
  `approval` stage).
- `client.createIssue` already forwards `executionPolicy` — **no client change
  required**. (If a future step lets the plugin create gated issues directly, it
  can reuse this path.)
- The pr-review BOOTSTRAP guardrail (currently
  `assemble.js:1075-1077`, "Required PR reviews are explicit assigned child
  issues …") is rewritten to describe the executionPolicy stage chain.

## Data Flow

```
Module/preset issue with reviewGate
        │  (assemble.js: resolveAssignee per role, drop missing)
        ▼
BOOTSTRAP.md  →  executionPolicy sketch (role names, ordered stages)
        │  (CEO at runtime: role → agentId)
        ▼
client.createIssue({ ..., executionPolicy })  →  Paperclip host
        │
        ▼
Issue runs through review → … → approval stages; participants woken;
decisions recorded; Engineer/owner merges when stages clear.
```

For runtime PR reviews (Path A) the Engineer agent performs the role→agentId
resolution itself via `listAgents` and calls `updateIssue` with the
`executionPolicy`.

## Open Verification (do before writing reviewer skills)

The exact submit mechanism for a stage decision (`approved` /
`changes_requested`) is host / agent-runtime logic and is **not** unambiguously
derivable from the bundled SDK — all issue operations go through
`PATCH /api/issues/:id`, but the decision submit is most likely an agent runtime
tool rather than an explicit REST field. The assumption: a reviewer agent
receives the stage as assigned work and submits its verdict through its runtime
tool.

**Action:** confirm the decision-submit path against the live instance before
finalizing reviewer-skill wording. Keep reviewer skills mechanism-neutral if the
exact tool/endpoint cannot be pinned down ("record your `approved` /
`changes_requested` verdict on your review stage").

## Testing

- `assemble.test.js` (vitest): an issue with `reviewGate` renders the correct
  executionPolicy chain into BOOTSTRAP.md — roles resolved in order, the
  approver rendered as the final `approval` stage, roles absent from the team
  silently dropped, and no `reviewGate` rendered when the field is absent.
- Optional plain-JS logic test (`src/logic/*.test.js`) for the role-resolution
  helper if extracted.
- `pnpm test` and `pnpm test:logic` both green; `pnpm typecheck` clean.
- GitHub-native approval path remains unchanged and untested by this work.

## Affected Files (summary)

| File | Change |
|------|--------|
| `templates/modules/pr-review/agents/engineer/skills/pr-workflow.md` | executionPolicy instead of child issues |
| `templates/modules/pr-review/agents/*/skills/*-review.md` (6 reviewer roles) | stage-participant framing |
| `templates/modules/pr-review/docs/pr-conventions.md` | Review Workflow / Roles rewrite |
| `templates/modules/pr-review/module.meta.json` | description + setup issue text |
| `src/logic/assemble.js` | `reviewGate` parse/resolve/render; guardrail rewrite |
| `src/logic/assemble.test.js` | reviewGate → BOOTSTRAP coverage |
| `src/api/client.js` | none (already forwards `executionPolicy`) |
