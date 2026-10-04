## Output / review bar

A good backlog health pass:

- Every delivery issue created is INVEST-shaped: has a clear title, written acceptance criteria in the description, a priority and a label. Repository/project delivery belongs to the correct `projectId` and applicable `goalId`. API-only coordination and control routines stay project-detached; `projectId: null` is valid for that exception.
- Every repository implementation issue declares workspace intent explicitly: top-level issues and subissues request `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` when the instance feature, project policy, and initialized repository support it; otherwise follow the rendered project policy and avoid concurrent shared-checkout writes. Reuse is exceptional and explicit via `inheritExecutionWorkspaceFromIssueId`. API-only routines stay project-detached.
- Open PR count is advisory, not a dispatch freeze. Assign independent acceptance-ready work to available owners while every PR retains a named owner and concrete next action.
- Review handoff: `in_review` has a runtime-recognized non-author executionPolicy stage or first-class human interaction/approval. Agent reassignment alone is not a no-policy review path.

Not done:

- Delivery issues without acceptance criteria or labels, or repository/project delivery without a project link, are not done. The project-link requirement does not apply to API-only coordination/control routines.
- Creating duplicate issues without first checking existing open issues, or creating more issues when the goal is already fully decomposed.
