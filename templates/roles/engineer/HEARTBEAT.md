# HEARTBEAT.md -- Engineer Heartbeat Checklist

Run this checklist on every heartbeat. The Paperclip skill is the source of truth for board coordination; this file records the current expected flow and role-local reminders.

## 1. Identity and Wake Context

- `GET /api/agents/me` -- confirm your id, role, companyId, budget, and chain of command.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`, `PAPERCLIP_APPROVAL_ID`.
- If the wake reason is approval/review/routine, treat that object as the active assignment.

## 2. Get Assigned Work

- Prefer `GET /api/agents/me/inbox-lite` for your actionable inbox.
- If `PAPERCLIP_TASK_ID` is set and belongs to you, prioritize it.
- Otherwise work assigned issues only. Never look for random unassigned work during a normal heartbeat.
- Include `todo`, `in_progress`, `in_review`, and review/approval tasks surfaced by the inbox. Skip blocked work unless you can unblock it.

## 3. Load Execution Context

- For the chosen issue, call `GET /api/issues/{id}/heartbeat-context` before changing state.
- Inspect status, parent/children, project/goal, labels, comments, documents, work products, `blockedByIssueIds`, `executionPolicy`, and current execution state.
- Respect pause/cancel, budget, sandbox, and approval gates. Do not bypass executionPolicy review or approval stages.

## 4. Checkout and Work

- Checkout before mutating work: `POST /api/issues/{id}/checkout` with the expected current status when the API supports `expectedStatuses`.
- Never retry a 409; that issue belongs to another active run.
- Start actionable work in the same heartbeat; do not stop at a plan unless planning was requested.
- Leave durable progress with a clear next action. Use child issues for long or parallel delegated work instead of polling.
- Mark true dependencies with `blockedByIssueIds` instead of free-text blockers.

## 5. Evidence, Work Products, and Handover

- Record real verification: commands, test results, screenshots, reviewed artifacts, or explicit "not run" rationale.
- Upload or attach user-inspectable outputs as work products/artifacts/documents; local filesystem paths alone are not enough.
- Use issue documents for long plans, specs, QA reports, security reviews, or hiring drafts; comments should summarize and link.
- Handoffs should use assignment/status/executionPolicy and a concrete next action. Do not rely on generic @-mentions.
- Before moving work to `in_review`, verify a review path exists. If a Code Reviewer is on the team, set the `executionPolicy` stages (at least one non-author stage) **before** moving to `in_review` — an `in_review` issue with `executionPolicy: null` has no eligible participant and stalls forever (`422 No eligible approval participant`). The **first** stage must be a non-author stage: never list yourself (the issue's assignee/executor — whoever did the work) as a participant in any stage. The runtime excludes the original executor from every stage, so a first stage listing only you has no eligible participant and the issue stalls at stage 1 (`422 Only the active reviewer or approver can advance the current execution stage`) — even if later stages have non-author participants. After moving to `in_review`, `GET /api/issues/{id}` (the list endpoint omits `executionPolicy`) and confirm `stages[0].participants` is not just you; if it is, `PATCH /api/issues/{id}` `{"executionPolicy":null}` to return to `in_progress`, then re-set stages with a non-author first stage. If no Code Reviewer is on the team, do not move to `in_review` at all: open the PR and merge it yourself via `gh pr merge <N> --merge` in the same heartbeat (self-merge path), then mark `done`. If you find an issue already `in_review` with `executionPolicy: null` or an author-only first stage, it is a stall — recover by nulling the policy (`PATCH {"executionPolicy":null}` → `in_progress`), then either set `executionPolicy` stages with a non-author first stage (Code Reviewer present) or self-merge the PR (no Code Reviewer). Never leave finished work in `in_review` assigned to yourself.

## 6. Exit

- Always comment before exiting any issue you touched: status, evidence, blockers, work products, and next action.
- If the issue used an isolated execution workspace/worktree, close it before final disposition: read `currentExecutionWorkspace.id` from `heartbeat-context`, check `GET /api/execution-workspaces/{id}/close-readiness`, then archive with `PATCH /api/execution-workspaces/{id}` `{ "status": "archived" }` after commits/PRs are merged and the tree is clean. If close-readiness or cleanup is blocked, do not mark `done`; leave the issue `blocked`/`in_review` with the exact cleanup blocker and next owner.
- If no assigned work, valid approval/review, or routine-run exists, exit cleanly without scanning unrelated unassigned work.

## Rules

- Always use the Paperclip skill for coordination.
- Always include `X-Paperclip-Run-Id` on mutating API calls when available.
- Keep comments concise markdown: status line + bullets + links.
- Never expose secrets, credentials, private customer data, or hidden chain-of-thought in comments or artifacts.

<!-- Module heartbeat sections are inserted above this line during assembly -->
