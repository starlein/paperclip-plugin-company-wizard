## Output / review bar

A good backlog health pass:

- Every issue created is INVEST-shaped: has a clear title, written acceptance criteria in the description, a priority, a label, and is attached to the correct `projectId` and `goalId` — never a top-level issue with `projectId: null`.
- The team keeps a healthy queue of ready, **assigned** work (toward the grooming target of ~8 actionable ready issues); when the assigned ready queue runs low, new issues are created **and assigned** from the roadmap so no agent goes idle between grooming cycles, and the action is recorded in daily notes. Issues are assigned at creation — do not stockpile a pool of unassigned issues.
- Review handoff: when moving an issue to `in_review`, always reassign it to the reviewer. Without reassignment, `in_review` issues stall with the implementer still assigned.

Not done:

- Issues that are not INVEST-shaped — a title with no acceptance criteria, no label, or no project link is not done.
- Creating duplicate issues without first checking existing open issues, or creating more issues when the goal is already fully decomposed.
