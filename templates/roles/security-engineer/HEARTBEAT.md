# HEARTBEAT.md -- Security Engineer Heartbeat Checklist

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
- Before leaving an issue in `in_review`, make the next action explicit. Valid paths include an active `executionPolicy` participant, a pending issue interaction or approval, an assigned user owner, a scheduled monitor, an active/queued wake, or a recovery issue. When `executionPolicy` is null, check `GET /api/issues/{id}/interactions` and `GET /api/issues/{id}/approvals`; null policy alone does not mean the issue is stalled. If no path exists, keep or return it to `in_progress` and assign an owner, or create the structured interaction/approval that will resume it.

## 6. Exit

- Always comment before exiting any issue you touched: status, evidence, blockers, work products, and next action.
- Preserve execution workspaces across issue completion — including the workspace your current run is executing in. **Never archive, retire, or delete an execution workspace as part of your own run.** Do not call `PATCH /api/execution-workspaces/{id}` with `{"status":"archived"}`, do not run `git worktree remove`, and do not delete the run branch — not when marking an issue `done`, not at the end of a routine run, and not as a "cleanup" or "tidy up" gesture. Archiving the workspace your run is using deletes its worktree mid-run: the run then fails workspace validation, and the next run that would reuse the workspace breaks. Follow-up, review, dependent work, and later routine runs may reuse the workspace, and Paperclip can restore a missing worktree only while its workspace record stays reusable. Workspace retirement is a board/operator action only, performed when an issue explicitly requests it. `cleanupEligibleAt` / "Cleanup: Not scheduled" is lifecycle metadata, not an automatic cleanup scheduler.
- If no assigned work, valid approval/review, or routine-run exists, exit cleanly without scanning unrelated unassigned work.

## Rules

- Always use the Paperclip skill for coordination.
- Always include `X-Paperclip-Run-Id` on mutating API calls when available.
- Keep comments concise markdown: status line + bullets + links.
- Never expose secrets, credentials, private customer data, or hidden chain-of-thought in comments or artifacts.

<!-- Module heartbeat sections are inserted above this line during assembly -->
