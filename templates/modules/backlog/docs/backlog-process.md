# Backlog Process

The product backlog is the single source of work for all agents. This document defines how issues flow from company goals to agent assignments.

## Lifecycle

```
Goal → Roadmap → Issues → Assignment → Execution → Done
```

1. **Goal decomposition** — The backlog owner breaks the company goal into milestones, then milestones into actionable issues.
2. **Issue creation** — New issues enter the backlog via `POST /api/companies/{companyId}/issues` with `title`, `description`, `priority`, `projectId`, `goalId`, and `labelIds`. Top-level backlog issues must always include the active roadmap `projectId`. They must also set workspace isolation explicitly — see **Workspace Isolation** below.
3. **Pipeline health** — The backlog owner monitors the ready assigned queue. When fewer than about 8 actionable ready issues remain across the active delivery roles, the next small batch is generated from the roadmap.
4. **Assignment** — Issues are assigned at creation to the best-fit owner. Engineering-ready issues go directly to the Software Engineer (or matching delivery role) so assignment wakeups start work immediately. Leave an issue unassigned only when no suitable owner exists.
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

Every issue runs in a git execution workspace (worktree/branch). To let issues run in
parallel without colliding in the same worktree, you must declare the workspace intent
**when you create the issue** — otherwise the issue silently adopts the workspace of
whatever issue you currently have checked out, which serializes work and corrupts branch
state.

- **Top-level issue** (independent work, no `parentId`): always send
  `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` in the create body. This
  gives the issue its own worktree and branch.
- **Sub-issue** (part of a larger parent task): set `"parentId": "<parent-issue-id>"` and
  do **not** send `executionWorkspaceSettings`. The sub-issue deliberately reuses the
  parent's workspace (the parent cannot be completed/cleaned up while its sub-issues are
  still open, so sharing is safe and intended).

**Never** create a top-level issue without `executionWorkspaceSettings`. Doing so makes it
inherit the creator's currently checked-out workspace and blocks parallel execution.

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

- **Healthy**: about 8 ready assigned issues across active delivery roles, covering the next logical chunk of work
- **Thin**: fewer than 4 ready assigned issues — generate and assign more soon
- **Empty**: no ready assigned issues — engineers will idle. Generate and assign immediately.
- **Bloated**: 20+ ready issues — stop creating, focus on prioritization and cleanup

## Coordination

- The backlog owner coordinates with the CEO on strategic priorities when unclear.
- If the goal is fully decomposed and all issues are done or in progress, report completion to the CEO rather than inventing new work.
- When multiple agents create issues (e.g., from user-testing findings), the backlog owner reviews and re-prioritizes as needed.
