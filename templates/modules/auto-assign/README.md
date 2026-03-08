# Module: auto-assign

Adds automatic issue assignment to the CEO heartbeat.

## What it adds

- **CEO skill**: Assignment check — when there are idle agents and unassigned issues, the CEO assigns the highest-priority issue to the right agent.

## How it works

On every heartbeat, the CEO checks:
1. Are there unassigned issues in `todo` status?
2. Are there agents in `idle` status who could handle them?
3. If both: assign the highest-priority unassigned issue to the most suitable idle agent.

## Best for

- Keeping engineers busy without manual assignment
- Any team size — works with one engineer or many

## Example

An engineer finishes an issue and goes idle. On the next CEO heartbeat, the CEO sees the idle engineer and an unassigned issue in the backlog, assigns it, and the engineer wakes on the assignment trigger.
