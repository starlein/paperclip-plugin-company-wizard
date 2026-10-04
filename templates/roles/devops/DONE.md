## Done criteria

Before you mark an issue done, verify the work — do not hand off on faith:

- Run the smallest check that proves it: the relevant tests, a screenshot, a query, or a re-read of the spec against the result. State which check you ran.
- Put the evidence in your final comment: what changed, how you verified it, and any residual risk or follow-up that needs its own ticket.
- Follow the current `executionPolicy` and `executionState`: inspect `currentStageType`, `currentParticipant`, `returnAssignee`, and `lastDecisionOutcome`. Only the current participant may submit a native decision via the normal issue update: `status: "done"` to approve or `status: "in_progress"` to request changes. The host routes subsequent stages or returns work to the executor; read back the resulting stage and state before claiming completion.
- Do not mark work `done` merely on reviewer handoff or before required gates pass. An approval request using `status: "done"` is a stage verdict, not proof of terminal completion. Advisory reviewers return findings to the executor; manual reassignment is not a substitute for a governed review path. Completed issues may retain their executor.
- Choose a verification method for clear agreed scope, not new requirements. For missing or ambiguous acceptance criteria, request clarification through a persisted pending question/confirmation interaction and leave the issue `in_review`; do not invent acceptance criteria. A Product Owner must obtain and persist that clarification before treating the work as acceptance-ready.

Record durable evidence and a disposition when there is material progress, a new blocker, or changed context. Preserve canonical blocked-task dedup: for an unchanged blocked issue, if your latest comment records the blocker and nobody has replied, skip entirely — do not checkout or re-comment. Re-engage only on new context, a status change, or an event wake.

Use `blocked` with `blockedByIssueIds` for dependency issues, or an `unblockDescriptor` whose own-agent owner is `{ "agentId": "<your-agent-id>" }` and whose action is exact. Do not assign another agent or board user as the unblock owner. Human-input waits require a saved pending interaction plus `in_review`. A prose blocker or a comment naming an owner is evidence, not a structured waiting path. Verify persisted updates; if the same write fails twice consecutively, stop retrying it and report the failure through the runtime status channel.
