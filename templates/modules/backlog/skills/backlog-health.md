# Skill: Backlog Health

You own the product backlog pipeline when you are explicitly assigned a backlog-grooming routine run or backlog-planning issue. This is not an every-heartbeat background scan.

## When To Use This Skill

Use this only when the current assigned issue/routine is titled like "Backlog grooming", "Backlog health", "Create roadmap", or explicitly asks you to decompose product work. Otherwise follow your normal assigned work.

## Label Setup

Before creating your first batch of issues, set up labels for the company:

1. Check existing labels: `GET /api/companies/{companyId}/labels`
2. If no labels exist, create them via `POST /api/companies/{companyId}/labels` with `{ "name": "...", "color": "..." }`:

| Label | Color | Use for |
|:------|:------|:--------|
| feature | `#0075ca` | New user-facing capability |
| bug | `#d73a4a` | Defects and regressions |
| chore | `#7057ff` | Refactoring, cleanup, dependency updates |
| spike | `#006b75` | Research or investigation with a time-box |
| blocked | `#e4e669` | Cannot proceed, needs unblocking |

Add additional labels if the roadmap calls for them (e.g., `docs`, `design`, `security`). Pick distinct hex colors.

## Backlog Health Check

1. Checkout the assigned backlog/routine issue in Paperclip before mutating the board. This is API-only control-plane work; do not create or enter a repository worktree for the grooming run.
2. Read the current company goals, roadmap/project context, existing issue documents, and recent decision log entries.
3. Query existing issues for the relevant project/goal and avoid duplicates.
4. Check delivery capacity before creating work: open implementation PRs per repository, active implementation issues per agent, and the current review owner. Default WIP is at most two open implementation PRs per repository and one active implementation issue per delivery agent unless company policy says otherwise.
5. If capacity is genuinely free and the next work is unclear, create only the next 1-3 small actionable issues via `POST /api/companies/{companyId}/issues`.
6. Each issue must include: `title`, acceptance-oriented `description`, `priority`, `projectId`, `goalId` when known, and `labelIds`.
7. Set workspace isolation explicitly on every implementation issue, including subissues (see Rules).
8. Use `blockedByIssueIds` for real dependencies instead of free-text blockers. Capacity waits point to the issues owning the in-flight PRs; never poll them with a monitor.
9. Assign only work that fits current owner and review capacity. Keep later roadmap items prioritized but inactive instead of stockpiling an assigned queue.
10. Record generated/assigned issue ids, current WIP evidence, and rationale in the routine issue comment; use issue documents for long plans.
11. Mark the routine-run issue done when complete.

## Rules

- Do not run this from normal heartbeats.
- Do not create top-level backlog issues with `projectId: null` when a project exists.
- Keep issues small and actionable. Each should be completable, tested, and reviewed independently.
- Split into subissues only when each child can be completed independently; avoid splitting tightly coupled implementation across sibling subissues.
- **Set workspace isolation explicitly at creation.** Top-level issues and subissues must send `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` by default so each gets its own worktree/branch. `parentId` is hierarchy, not workspace consent. Reuse another issue's checkout only when explicitly required by the task, using `inheritExecutionWorkspaceFromIssueId` with the source issue's internal id.
- Always attach at least one label to every issue you create.
- Do not attach a universal task watchdog or create watchdog/queue-drain wrapper issues. Use the issue's real owner, first-class blockers, executionPolicy, interactions, and normal wake paths. Add a watchdog only when the issue explicitly documents a bounded recovery requirement that those paths cannot cover.
- If the goal is fully decomposed into issues, do not create more. Report status and next review trigger to the CEO/Product Owner.
- Work products such as roadmap drafts or decomposition tables belong in issue documents/artifacts, not only comments.
- **Review handoff:** Use `in_review` only with a runtime-recognized path: an active non-author `executionPolicy` stage or a first-class human interaction/approval. Agent reassignment alone is not a valid no-policy review path. Without such a path, keep the issue `in_progress` for a concrete agent handoff or finish the direct/self-merge flow.
- **Backlog grooming is intentionally project-detached and must not use a git worktree.** Perform the run through Paperclip APIs only. Setting `projectId` and isolated `executionWorkspaceSettings` on the *work issues you create* is correct; that does not attach the grooming run itself to their project or worktrees. Do not clone, branch, run `git worktree add`, or try to repair the routine by attaching it to a project.
