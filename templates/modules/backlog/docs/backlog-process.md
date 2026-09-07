# Backlog Process

The product backlog is the single source of work for all agents. This document defines how issues flow from company goals to agent assignments.

## Lifecycle

```
Goal → Roadmap → Issues → Assignment → Execution → Done
```

1. **Goal decomposition** — The backlog owner breaks the company goal into milestones, then milestones into actionable issues.
2. **Issue creation** — New issues enter the backlog via `POST /api/companies/{companyId}/issues` with `title`, `description`, `priority`, `projectId`, `goalId`, and `labelIds`. Top-level backlog issues must always include the active roadmap `projectId`. They must also set workspace isolation explicitly — see **Workspace Isolation** below.
3. **Pipeline health** — The backlog owner monitors implementation and review ownership. Open PR count is a queue-health signal, not a hard cap on independent work.
4. **Assignment** — Assign acceptance-ready issues to available owners. Keep every open PR tied to a named owner and next action, and prioritize stale/conflicting PR repair without freezing unrelated implementation.
5. **Execution** — Agents check out assigned issues, work them, and hand off deliberately for review or completion.

## Issue Quality

Every issue should be:

- **Small** — completable in a single agent session
- **Actionable** — clear what "done" looks like
- **Independent** — minimal blocking dependencies on other issues
- **Prioritized** — `priority` field reflects roadmap order and urgency
- **Labeled** — at least one label from the company's label set via `labelIds`

### Acceptance Criteria

Write acceptance criteria in the issue description. Engineers use these to validate their work before marking done. Keep them concrete and testable.

## Workspace Isolation (required at creation)

Repository implementation issues need explicit workspace intent **when you create the
issue**. When isolated workspaces are enabled and configured for the project, request
an independent workspace to prevent accidental checkout sharing. The API can inherit
the current agent run's issue workspace when no workspace selection is supplied; child
issues can also inherit from their parent within the same project. This is conditional,
not proof that every issue runs in a git worktree. Project-detached API-only routines
need no repository workspace.

- **Top-level implementation issue** (independent work, no `parentId`): when isolation is available, send
  `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` in the create body. This
  requests the project's configured isolated strategy (which may be a git worktree).
- **Implementation sub-issue** (part of a larger parent task): set `"parentId": "<parent-issue-id>"` and
  also send `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` when isolation is available.
  Hierarchy does not imply checkout sharing. Only when the task explicitly requires the
  same code change should you send `inheritExecutionWorkspaceFromIssueId` with the source
  issue's internal id and omit conflicting workspace settings.

If isolated workspaces are disabled or the repository has no valid initial commit yet,
follow the rendered project policy and initialize the repository first. Do not claim
that requesting isolation overrides an instance feature gate. Read back the issue and
runtime workspace before starting concurrent repository writes.

### Why this still matters when the project shares one workspace

The Company Wizard supplies `sharedWorkspaceConcurrency: "serialize"` for shared project
workspaces. Current Paperclip applies this policy only when the instance's experimental
isolated-workspaces feature and project policy are enabled. When effective, shared runs
queue behind the current holder. When disabled, the saved policy is not an active lock;
avoid parallel writes to that checkout and use the bootstrap warning to arrange safe
workspace setup. Independent isolated workspaces permit parallel work only after their
configured strategy and repository are runnable.

Example top-level create body:

```json
{
  "title": "Build campaign onboarding wizard",
  "description": "...",
  "priority": "high",
  "projectId": "<roadmap-project-id>",
  "goalId": "<goal-id>",
  "labelIds": ["<label-id>"],
  "executionWorkspaceSettings": { "mode": "isolated_workspace" }
}
```

## Sources of Issues

Issues can enter the backlog from multiple sources:

- **Backlog owner** — primary source, decomposes roadmap into issues
- **Other modules** — architecture-plan, user-testing, market-analysis, etc. may create follow-up issues from their workflows
- **Engineers** — may create sub-issues or bug reports during execution
- **CEO** — fallback issue creation when backlog owner is absent

All sources use the same API and issue format. The backlog owner is responsible for overall health and prioritization, not for being the only creator.

## Prioritization

- **P0** — Blocking other work or critical path. Do first.
- **P1** — Important for current milestone. Do soon.
- **P2** — Valuable but not urgent. Do when capacity allows.
- **P3** — Nice to have. Backlog buffer.

Re-prioritize when milestones shift or new information arrives. Don't let low-priority issues accumulate indefinitely — archive or cancel stale ones.

## Backlog Health Indicators

- **Healthy**: active work and open PRs have named owners, current heads, and concrete next actions
- **Thin**: available agents have no acceptance-ready work — prepare and assign a small next issue
- **Needs queue attention**: stale, conflicting, red, or ownerless PRs exist — route repairs while independent implementation continues
- **Bloated**: work lacks owners or actionable acceptance criteria — consolidate or reprioritize it without imposing a numeric repository cap

## Coordination

- The backlog owner coordinates with the CEO on strategic priorities when unclear.
- If the goal is fully decomposed and all issues are done or in progress, report completion to the CEO rather than inventing new work.
- When multiple agents create issues (e.g., from user-testing findings), the backlog owner reviews and re-prioritizes as needed.

## Review Handoff

Move an issue to `in_review` only when a runtime-recognized action path exists: an active non-author `executionPolicy` stage or a first-class human interaction/approval. Paperclip reassigns automatically for an executionPolicy stage. Agent reassignment by itself is not a valid no-policy review path; without a recognized path, keep the issue `in_progress` for a concrete handoff or complete the direct/self-merge flow.
