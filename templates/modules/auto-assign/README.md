# Module: auto-assign

Adds a low-frequency safety net for issue assignment. Primary dispatch happens at backlog grooming — issues are assigned at creation. This module only catches stragglers.

## What it adds

- **Product Owner skill**: Safety-net assignment check — assigns only the next item that fits implementation and review capacity.
- **CEO fallback skill**: Steps in when the PO is absent or stalled.

## How it works

Primary assignment happens during backlog grooming: the Product Owner creates issues and assigns each to the best-fit agent immediately. The auto-assign routine is a **safety net** that runs every 4 hours to catch anything that slipped through:

1. Are there unassigned issues in `todo` status?
2. Do those issues have enough acceptance criteria and no unresolved blockers?
3. If yes and capacity is free: assign only the next suitable item. Default WIP is one active implementation issue per delivery agent and two open implementation PRs per repository; keep later work inactive.

## Best for

- Catching assignment misses without relying on manual cleanup
- Any team size — works with one engineer or many

## Example

The Product Owner normally assigns issues at creation during backlog grooming. If one slips through unassigned, the safety-net routine assigns it on the next pass and the assignee wakes on the assignment trigger.