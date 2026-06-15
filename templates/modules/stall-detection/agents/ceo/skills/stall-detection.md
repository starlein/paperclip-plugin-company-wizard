# Skill: Stall Detection

You own stall detection when you are explicitly assigned a stall-detection routine run. This is not an every-heartbeat background scan.

## When To Use This Skill

Use this only when the current assigned issue/routine is titled like "Stall detection" or explicitly asks you to inspect stalled work. Otherwise follow the normal Paperclip heartbeat rule: only work assigned issues and do not scan the whole board.

## Stall Check

1. Checkout the assigned routine-run issue.
2. Query active issues for the relevant company/project: `todo`, `in_progress`, `in_review`, and blocked work where applicable.
3. For each candidate, inspect latest comments/activity, execution state, blockers, approval/review state, and assigned agent status.
4. Skip issues with an active run, recent activity, valid `blockedByIssueIds`, or pending executionPolicy approval/review.
5. For a likely stall, leave a structured comment on the issue with:
   - issue id/title
   - assigned agent
   - last activity timestamp/context
   - why it appears stalled
   - exact next action requested
6. Prefer reassignment, blocker linkage, or escalation to CEO/Product Owner over informal nudges.
7. If an agent is `error`, paused, or repeatedly non-responsive, escalate with an issue comment and assign the manager/CEO as appropriate.
8. Summarize findings on the routine-run issue and mark it done.

## Rules

- Do not @-mention as a generic nudge; use assignment, status, blockers, and explicit next-action comments.
- Do not interrupt running agents.
- Do not close or cancel another agent's work unless the issue explicitly grants that authority.
- Be specific: which issue, which agent, last activity, why stalled, and who owns the next action.
