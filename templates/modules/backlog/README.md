# Module: backlog

Owns the product backlog lifecycle — from goal decomposition to a steady pipeline of actionable issues.

## What it adds

- **Backlog health skill**: Reviews backlog readiness and ownership during assigned routines/planning issues, generating concrete roadmap work when needed.
- **Process doc**: `backlog-process.md` — shared workflow guide for how issues flow from goals to agents.

## How it works

Only on an assigned backlog-grooming routine or backlog-planning issue, the backlog owner checks the pipeline; this is not a normal-heartbeat background scan:
1. Checkout the assigned run and inspect goals, roadmap, existing issues, and delivery ownership through Paperclip APIs; avoid duplicate work.
2. When the next work is unclear, decompose the next 1–3 actionable issues. Open PR counts guide prioritization but do not freeze unrelated acceptance-ready work.
3. New work issues include `projectId`, `goalId` when known, priority, labels, acceptance criteria, and explicit workspace intent. The grooming routine itself stays project-detached and does not use a repository worktree.
4. Assign acceptance-ready work to available owners. Use `blockedByIssueIds` only for real dependencies, record created/assigned ids and rationale, then complete the routine run.

## Ownership

- **Primary**: Product Owner — owns backlog health, prioritization, and issue quality
- **Fallback**: CEO — creates minimal issues to keep engineers unblocked when PO is absent

## Best for

- Any company that wants a steady pipeline of work without manual issue creation
- Keeps engineers fed with work continuously
