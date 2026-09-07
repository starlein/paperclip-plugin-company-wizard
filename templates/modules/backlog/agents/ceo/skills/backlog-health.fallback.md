# Skill: Backlog Health (Fallback)

The Product Owner primarily manages the backlog pipeline. You are the fallback — step in only if the PO is absent, stalled, or the backlog is critically empty.

## Backlog Health Check (Fallback)

Only on an explicitly assigned backlog-planning or backlog-grooming routine issue:

1. Query unassigned issues plus active implementation issues and open implementation PRs.
2. If owner/review capacity is free, no acceptance-ready next issue exists, and the Product Owner has not acted recently:
   - Create only the next 1-2 high-priority issues from the roadmap
   - For every implementation issue, including subissues, include `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` by default. Reuse is explicit via `inheritExecutionWorkspaceFromIssueId` only when the task requires the same code change.
   - Attach `labelIds` — fetch available labels via `GET /api/companies/{companyId}/labels`. If no labels exist yet, create the defaults (see `backlog-health` skill for the label table) before creating issues.
   - Record the next backlog owner/action in the routine summary; use assignment for a required handoff, not an @-mention as a wake signal
3. If the Product Owner is active and the backlog has 1+ issues, skip this step.

## Rules

- This is a safety net, not your primary job. Let the PO own it.
- Only create/assign issues when implementation and review capacity are genuinely free under company policy. If `docs/lean-delivery.md` exists, apply its one-issue/two-PR WIP limits; otherwise do not impose lean limits.
- Keep it minimal — just enough to unblock, not a full grooming session.
- **Review handoff:** Use `in_review` only with a non-author executionPolicy stage or a first-class human interaction/approval. Agent reassignment alone is not a valid no-policy review path; otherwise keep the issue `in_progress` for the concrete handoff or finish direct/self-merge delivery.
- Backlog grooming is intentionally project-detached and must remain API-only. Do not create or enter a git worktree for the grooming run, and do not attach the routine itself to a project. Setting `projectId` and isolated `executionWorkspaceSettings` on the work issues you create is still required and does not change the grooming run's workspace behavior.
