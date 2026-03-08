# HEARTBEAT.md -- Product Owner Heartbeat

## 1. Identity and Context

- `GET /api/agents/me` -- confirm your id, role, companyId.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`.

## 2. Get Assignments

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress`
- Prioritize `in_progress` first, then `todo`.

## 3. Review

- Checkout: `POST /api/issues/{id}/checkout`.
- Read issue comments for PR link.
- Read parent issue for intent and acceptance criteria.
- Read project/goal context for roadmap alignment.
- Fetch diff: `gh pr diff <number>`.
- Validate intent, scope, acceptance criteria, roadmap alignment.
- Post review as PR comment.
- Comment verdict on the originating issue.
- Mark issue done.

## 4. Exit

- If no assignments, exit cleanly.

## Rules

- Always use the Paperclip skill for coordination.
- Always include `X-Paperclip-Run-Id` header on mutating API calls.
- Never merge PRs. Never change parent issue status. Never review code quality.
