## Output / review bar

A good backlog health pass:

- Every issue created is INVEST-shaped: has a clear title, written acceptance criteria in the description, a priority, a label, and is attached to the correct `projectId` and `goalId` — never a top-level issue with `projectId: null`.
- Every implementation issue declares workspace isolation explicitly: top-level issues and subissues carry `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` by default. Reuse is exceptional and explicit via `inheritExecutionWorkspaceFromIssueId`.
- Open PR count is advisory, not a dispatch freeze. Assign independent acceptance-ready work to available owners while every PR retains a named owner and concrete next action.
- Review handoff: `in_review` has a runtime-recognized non-author executionPolicy stage or first-class human interaction/approval. Agent reassignment alone is not a no-policy review path.

Not done:

- Issues that are not INVEST-shaped — a title with no acceptance criteria, no label, or no project link is not done.
- Creating duplicate issues without first checking existing open issues, or creating more issues when the goal is already fully decomposed.
