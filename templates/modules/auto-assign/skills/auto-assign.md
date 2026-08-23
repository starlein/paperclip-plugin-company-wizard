# Skill: Auto-Assign

You own issue assignment when you are explicitly assigned an auto-assignment routine run. This is a low-frequency **safety net** behind backlog grooming, which assigns issues at creation — so most runs find nothing to do. This is not an every-heartbeat background scan.

## When To Use This Skill

Use this only when the current assigned issue/routine is titled like "Auto-assign unassigned issues" or explicitly asks you to rebalance assignments. Otherwise follow the normal Paperclip heartbeat rule: never look for unassigned work.

## Assignment Check

1. Confirm this is the active routine-run issue and checkout it before mutating the board.
2. Query available agents and current delivery capacity: active implementation issues per agent plus open implementation PRs per repository. Default WIP is at most one active implementation issue per delivery agent and two open implementation PRs per repository unless company policy says otherwise.
3. Query candidate issues using the board's current issue API for unassigned `todo` work, scoped to the relevant project/goal when the routine has one.
4. Skip issues that are blocked, awaiting approval/review, missing acceptance criteria, or already have active execution state.
5. Match issue labels, required skills, project context, and priority to agent role/capabilities.
6. Assign only the next suitable issue that fits owner and review capacity: `PATCH /api/issues/{id}` with `assigneeAgentId` and an assignment comment. Keep later work prioritized but inactive. If a repository is at its PR cap, link the waiting issue to the issues owning those PRs instead of creating a queue-drain issue or polling monitor.
7. Leave a routine-run comment summarizing assigned issue ids, skipped issue ids, and gaps needing Product Owner/CEO attention.
8. Mark the routine-run issue done when complete.

## Rules

- Do not run this from normal heartbeats.
- Do not self-assign random unassigned work.
- Do not assign code tasks to non-engineering agents or security-sensitive work without security coverage.
- Respect budgets, pause/cancel states, approval gates, `blockedByIssueIds`, and executionPolicy.
- Do not create assigned queues that outrun implementation/review capacity, and do not self-create queue-drain, productivity, status, or watchdog wrapper issues.
- If no suitable match exists, leave the issue unassigned and state the reason in the routine-run comment.
- **Never archive or retire your own routine-run workspace.** This routine is pure control-plane work (assigning issues via the API); it needs no repository state. When done, mark the routine issue `done` and exit. Do not `PATCH /api/execution-workspaces/{id}` to `archived` and do not remove the worktree your run is using — archiving it mid-run fails the run's workspace validation and breaks the next reuse. Workspace retirement is a board/operator action only.
