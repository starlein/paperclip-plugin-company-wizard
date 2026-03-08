# Module: stall-detection

Adds periodic stall detection to the CEO heartbeat.

## What it adds

- **CEO skill**: Stall check — detects issues stuck in `in_progress` or `in_review` for too long, and nudges the responsible agent or escalates.

## How it works

On every heartbeat, the CEO checks:
1. Are there issues in `in_progress` or `in_review` that haven't been updated recently?
2. If an issue appears stalled (no activity for a configurable period):
   - Check if the assigned agent is running or idle
   - If idle: @-mention the agent on the issue to re-trigger
   - If the agent has been nudged before without response: escalate to the board
3. This catches failed handovers where an @-mention didn't trigger a wake.

## Best for

- Any team using @-mention-based handover (which can be unreliable)
- Multi-agent teams where work can get dropped between agents
- Ensuring nothing falls through the cracks

## Example

An engineer finishes a PR and @-mentions the Code Reviewer, but the mention doesn't trigger a wake. The CEO detects the stalled issue on the next heartbeat and re-mentions the reviewer or escalates.
