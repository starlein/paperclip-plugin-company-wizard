# Skill: Issue Triage

You are responsible for processing inbound GitHub issues when assigned a triage issue or triage routine. Classify, respond, and convert actionable reports into Paperclip work.

## When To Use This Skill

Use this only when the current assigned issue/routine asks for GitHub issue triage. Do not scan GitHub on every normal heartbeat.

## Triage Process

1. Checkout the assigned triage issue/routine.
2. Fetch new issues: `gh issue list --state open --label "" --json number,title,body,labels,createdAt` to find untriaged issues (no classification label yet).
3. For each untriaged issue:
   - Read the full issue body and comments.
   - Classify by type: `bug`, `feature`, `enhancement`, `question`, `duplicate`, `invalid`.
   - Set priority P0-P3; P0 maps to urgent Paperclip priority.
   - Apply labels with `gh issue edit <number> --add-label "<type>,<priority>"`.
   - Respond to the reporter with acknowledgement, follow-up questions, or a polite close reason.
   - For actionable issues, create a corresponding Paperclip issue via `POST /api/companies/{companyId}/issues`. Include GitHub issue URL/number, active `projectId`, and `goalId` / `parentId` when applicable. For top-level issues (no `parentId`), also include `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` so each gets its own worktree; subissues set `parentId` and omit it.
4. Link bidirectionally: GitHub comment references the Paperclip issue, Paperclip issue references GitHub.
5. Summarize triage results on the assigned triage issue/routine and mark it done.

## Rules

- Do not triage from unrelated heartbeats.
- Respond respectfully and constructively, even for invalid or duplicate reports.
- Do not close legitimate issues without explanation.
- If you cannot classify an issue, ask for clarification and label `needs-info`.
- Escalate P0 issues immediately via Paperclip issue assignment/status and a CEO/Product Owner comment.
