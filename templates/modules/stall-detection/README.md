# Module: stall-detection

Adds scheduled stall detection as an assigned routine run.

## What it adds

- **CEO skill**: Stall check — detects issues stuck in `in_progress` or `in_review` for too long, then records a structured next action, reassignment, blocker, or escalation.

## How it works

When the CEO is assigned a stall-detection routine run:
1. Are there issues in `in_progress` or `in_review` that haven't been updated recently?
2. If an issue appears stalled (no activity for a configurable period):
   - Check if the assigned agent is running or idle
   - If idle: leave a structured next-action comment, reassign, or link a blocker as appropriate
   - If the agent has already failed to respond: escalate to the board/CEO with exact evidence
3. This catches dropped handoffs without relying on generic mentions.

## Best for

- Any team with multi-stage handoffs where ownership can become unclear
- Multi-agent teams where work can get dropped between agents
- Ensuring nothing falls through the cracks

## Example

An engineer finishes a PR and moves the issue to `in_review`, but the executionPolicy reviewer never acts. The CEO detects the stalled issue during the scheduled routine run, records the missing next action, and reassigns or escalates.
