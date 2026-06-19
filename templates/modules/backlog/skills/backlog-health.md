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
| feature | `0075ca` | New user-facing capability |
| bug | `d73a4a` | Defects and regressions |
| chore | `7057ff` | Refactoring, cleanup, dependency updates |
| spike | `006b75` | Research or investigation with a time-box |
| blocked | `e4e669` | Cannot proceed, needs unblocking |

Add additional labels if the roadmap calls for them (e.g., `docs`, `design`, `security`). Pick distinct hex colors.

## Backlog Health Check

1. Checkout the assigned backlog/routine issue before mutating the board.
2. Read the current company goals, roadmap/project context, existing issue documents, and recent decision log entries.
3. Query existing issues for the relevant project/goal and avoid duplicates.
4. If the backlog is thin or unclear, create around 3-6 small actionable issues via `POST /api/companies/{companyId}/issues`.
5. Each issue must include: `title`, acceptance-oriented `description`, `priority`, `projectId`, `goalId` when known, and `labelIds`.
6. Set workspace isolation explicitly on every issue you create (see Rules): top-level issues send `"executionWorkspaceSettings": { "mode": "isolated_workspace" }`; sub-issues set `parentId` and omit it.
7. Use `blockedByIssueIds` for real dependencies instead of free-text blockers.
8. Assign each issue to the best-fit available agent as you create it — engineer-actionable work with clear acceptance criteria goes to the Software Engineer (or the matching role). Direct push-assignment is the primary dispatch path; the assigned queue is the buffer, so do **not** stockpile a pool of unassigned ready work. Leave an issue unassigned only when no suitable owner exists — the low-frequency auto-assign safety net will catch those.
9. Record generated issue ids and rationale in the routine issue comment; use issue documents for long plans.
10. Mark the routine-run issue done when complete.

## Rules

- Do not run this from normal heartbeats.
- Do not create top-level backlog issues with `projectId: null` when a project exists.
- Keep issues small and actionable. Each should be completable, tested, and reviewed independently.
- Split into subissues only when each child can be completed independently; avoid splitting tightly coupled implementation across sibling subissues.
- **Set workspace isolation explicitly at creation.** Top-level issues (no `parentId`) must send `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` so each gets its own worktree/branch. Sub-issues set `parentId` and omit `executionWorkspaceSettings` so they reuse the parent's workspace. Never create a top-level issue without it — otherwise it inherits the workspace of whatever issue you currently have checked out and blocks parallel work.
- Always attach at least one label to every issue you create.
- If the goal is fully decomposed into issues, do not create more. Report status and next review trigger to the CEO/Product Owner.
- Work products such as roadmap drafts or decomposition tables belong in issue documents/artifacts, not only comments.
