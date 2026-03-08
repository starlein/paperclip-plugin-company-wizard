# Skill: Stall Detection

Add this check to your heartbeat, after handling assignments and before exit.

## Stall Check

1. Query active issues: `GET /api/companies/{companyId}/issues?status=in_progress,in_review`
2. For each issue, check the latest comment/activity timestamp.
3. If an issue has had no activity for more than 2 heartbeat cycles:
   - Check the assigned agent's status via `GET /api/agents/{agentId}`
   - If agent is `idle`: @-mention them on the issue with a nudge: "This issue appears stalled. Please check and continue or report blockers."
   - If agent is `running`: skip — they may be working on it now.
   - If agent is `error` or `paused`: escalate to the board with a comment.
4. If you've already nudged an agent on the same issue in a previous heartbeat and there's still no progress: escalate to the board.
5. Record stall findings in your daily notes.

## Rules

- Don't nudge agents that are currently running — they may be mid-work.
- Only escalate after one failed nudge attempt.
- When escalating, be specific: which issue, which agent, how long stalled, what was the last activity.
