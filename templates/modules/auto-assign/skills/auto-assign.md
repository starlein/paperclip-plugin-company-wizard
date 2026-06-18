# Skill: Auto-Assign

You own issue assignment when you are explicitly assigned an auto-assignment routine run. This is a low-frequency **safety net** behind backlog grooming, which assigns issues at creation — so most runs find nothing to do. This is not an every-heartbeat background scan.

## When To Use This Skill

Use this only when the current assigned issue/routine is titled like "Auto-assign unassigned issues" or explicitly asks you to rebalance assignments. Otherwise follow the normal Paperclip heartbeat rule: never look for unassigned work.

## Assignment Check

1. Confirm this is the active routine-run issue and checkout it before mutating the board.
2. Query available agents: `GET /api/companies/{companyId}/agents` and consider only active agents that are idle/available and within budget.
3. Query candidate issues using the board's current issue API for unassigned `todo` work, scoped to the relevant project/goal when the routine has one.
4. Skip issues that are blocked, awaiting approval/review, missing acceptance criteria, or already have active execution state.
5. Match issue labels, required skills, project context, and priority to agent role/capabilities.
6. Assign every suitable still-unassigned issue to its best-fit available agent (an agent may hold a short queue): `PATCH /api/issues/{id}` with `assigneeAgentId` and an assignment comment explaining why. As a safety net, clear out all stragglers in one pass rather than dispatching one at a time.
7. Leave a routine-run comment summarizing assigned issue ids, skipped issue ids, and gaps needing Product Owner/CEO attention.
8. Mark the routine-run issue done when complete.

## Rules

- Do not run this from normal heartbeats.
- Do not self-assign random unassigned work.
- Do not assign code tasks to non-engineering agents or security-sensitive work without security coverage.
- Respect budgets, pause/cancel states, approval gates, `blockedByIssueIds`, and executionPolicy.
- If no suitable match exists, leave the issue unassigned and state the reason in the routine-run comment.
