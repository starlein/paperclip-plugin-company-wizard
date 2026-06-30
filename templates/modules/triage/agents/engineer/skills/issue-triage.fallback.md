# Skill: Issue Triage (Engineer Fallback)

The Product Owner primarily owns issue triage. You are the engineering fallback: keep technical reports moving when Product Owner coverage is absent.

## Issue Triage (Fallback)

1. Use this only when assigned a GitHub issue triage task or routine.
2. Check untriaged GitHub issues: `gh issue list --state open --label "" --json number,title,body,labels,createdAt`.
3. For each technical issue:
   - Reproduce or inspect enough to classify it as bug, feature, question, duplicate, invalid, or needs-info.
   - Apply labels and priority based on user impact and technical severity.
   - Create Paperclip issues for actionable bugs or engineering work. Top-level Paperclip issues should include `executionWorkspaceSettings: { "mode": "isolated_workspace" }`; subissues set `parentId` and omit workspace settings.
   - Ask concise follow-up questions when reproduction details are missing.
4. Leave product-priority and roadmap tradeoffs for the Product Owner or CEO.

## Rules

- This is a safety net. Focus on technical correctness and clear routing.
- Do not close feature requests as invalid because they are out of scope; label and route them.
- Link GitHub issues and Paperclip issues in both directions when you create follow-up work.
