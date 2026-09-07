# Skill: Auto-Assign (Fallback)

Primary assignment happens at backlog grooming — issues are assigned to the best-fit agent as they are created. This routine is a **safety net** behind that primary path. You step in only if the PO is absent, stalled, or agents are critically idle.

## Assignment Check (Fallback)

Only on an explicitly assigned auto-assignment routine issue:

1. Confirm this is the active routine-run issue and checkout it before mutating the board.
2. Query unassigned ready issues plus active implementation issues and open implementation PRs. Treat PR count as a queue-health signal, not a hard assignment limit.
3. If unassigned issues are available AND the Product Owner hasn't acted recently:
   - Assign suitable acceptance-ready issues to available owners: `PATCH /api/issues/{id}` with `assigneeAgentId` and an assignment comment.
   - Keep later roadmap work prioritized but inactive; a safety net must not manufacture a queue that outruns the merge gate.
4. If the Product Owner is active, skip this step.
5. Leave a routine-run comment summarizing assigned issue ids and skipped issue ids.
6. Mark the routine-run issue done when complete.

## Rules

- This is a safety net behind backlog grooming's direct assignment. Let the PO own assignment.
- Treat implementation and review load as advisory scheduling input. Do not leave acceptance-ready work unassigned solely because other PRs are open, and never model open-PR count as blocker relations.
- Do not run this from normal heartbeats.
- Do not self-assign random unassigned work.
- If no suitable match exists, leave the issue unassigned and state the reason in the routine-run comment.
- Never archive or retire your own routine-run workspace. This is control-plane work via the API; do not `PATCH /api/execution-workspaces/{id}` to `archived` or remove the worktree your run uses — it fails the run's workspace validation and breaks the next reuse. Retirement is a board/operator action only.
