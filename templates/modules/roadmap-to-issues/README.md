# Module: roadmap-to-issues

Adds automatic issue generation from goals/roadmap to the CEO heartbeat.

## What it adds

- **CEO skill**: Backlog health check — when fewer than N unassigned issues remain, the CEO breaks down the next milestone from the goal into concrete issues.

## How it works

On every heartbeat, the CEO checks the issue backlog:
1. Count unassigned issues with status `todo` or `backlog`
2. If count < threshold (default: 3), generate new issues from the goal/roadmap
3. New issues are created with proper `goalId` and priority
4. Issues are left unassigned for the auto-assign module (or manual assignment)

## Best for

- Any company that wants a steady pipeline of work without manual issue creation
- Keeps engineers fed with work continuously

## Example

A company building an app with a goal "Ship MVP with auth, dashboard, and API." The CEO breaks this into milestones, and as engineers complete issues, the CEO automatically generates the next batch from the roadmap.
