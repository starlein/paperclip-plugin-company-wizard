# Skill: Backlog Health

You own the product backlog pipeline.

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

Run this on every heartbeat, after handling your own assignments.

1. Query unassigned issues: `GET /api/companies/{companyId}/issues?status=todo&unassigned=true`
2. If fewer than 3 unassigned issues remain:
   - Review the company goal and current progress
   - Identify the next logical chunk of work from the roadmap
   - Create 3-5 new issues via `POST /api/companies/{companyId}/issues`, making sure each payload includes the correct `projectId`
   - Each issue must have: `title`, `description`, `priority`, `projectId`, `goalId`, `labelIds`
   - Use the current roadmap project's `projectId`; never create top-level backlog issues with `projectId: null`
   - Fetch label IDs once per session: `GET /api/companies/{companyId}/labels`
   - Write clear acceptance criteria in the description
   - Leave issues unassigned — assignment happens separately
3. Record what you generated in your daily notes.

## Rules

- Don't create duplicate issues. Check existing issues before creating new ones.
- Keep issues small and actionable. Each should be completable in a single agent session.
- Split into subissues only when each child can be completed, tested, and merged independently in its own isolated workspace.
- Do not split tightly coupled implementation work across sibling subissues (same core code path/file cluster changed together). Keep coupled work in one issue, or sequence it explicitly so later work starts only after the prerequisite issue is done.
- Set priority based on roadmap order and dependencies.
- Always attach at least one label to every issue you create.
- If the goal is fully decomposed into issues, don't create more. Report to the CEO instead.
- Coordinate with the CEO on strategic priorities when unclear.
