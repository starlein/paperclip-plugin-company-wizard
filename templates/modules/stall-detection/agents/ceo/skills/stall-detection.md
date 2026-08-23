# Skill: Stall Detection

You own stall detection when you are explicitly assigned a stall-detection routine run. This is not an every-heartbeat background scan.

This routine is the **periodic backstop**. Do not create universal task-watchdog, queue-drain, status-repair, or workspace-cleanup wrapper issues. Prefer the originating issue's real owner, blockers, executionPolicy, interactions, and normal wake paths. Add a watchdog only when the issue explicitly documents a bounded recovery requirement those paths cannot cover.

## When To Use This Skill

Use this only when the current assigned issue/routine is titled like "Stall detection" or explicitly asks you to inspect stalled work. Otherwise follow the normal Paperclip heartbeat rule: only work assigned issues and do not scan the whole board.

## Stall Check

1. Checkout the assigned routine-run issue.
2. Query active issues for the relevant company/project: `todo`, `in_progress`, `in_review`, and blocked work where applicable.
3. For each candidate, use Paperclip's liveness views before inferring from status alone: `GET /api/issues/{id}/diagnostics/blockers`, `GET /api/issues/{id}/diagnostics/wakes`, `GET /api/issues/{id}/interactions`, `GET /api/issues/{id}/approvals`, and `GET /api/issues/{id}/recovery-actions`. Inspect latest comments/activity, execution state, assigned agent status, scheduled monitor, and active run as supporting context. Use `GET /api/issues/{id}/diagnostics/subtree` for a bounded dependency chain instead of recursively walking a large tree by hand.
4. Skip issues with an explicit waiting path: an active run or queued wake, recent activity, a usable current `executionPolicy` participant, a pending issue interaction or approval, an assigned user owner, a future scheduled monitor, or an active recovery issue. In particular, `executionPolicy: null` does **not** make an `in_review` issue stalled when a pending interaction owns the next action. A `blocked` issue is validly blocked while blocker diagnostics report unresolved blockers; diagnose the actionable leaf rather than reassigning every downstream issue.
5. For a likely stall, leave a structured comment on the issue with:
   - issue id/title
   - assigned agent
   - last activity timestamp/context
   - why it appears stalled
   - exact next action requested
6. Prefer reassignment, blocker linkage, or escalation to CEO/Product Owner over informal nudges.
7. If an agent is `error`, paused, or repeatedly non-responsive, escalate with an issue comment and assign the manager/CEO as appropriate.
8. Summarize findings on the routine-run issue and mark it done.

## In-review without an action path

Paperclip classifies `in_review_without_action_path` only when an agent-owned `in_review` issue has no participant, interaction, approval, user owner, monitor, active run/queued wake, or recovery issue owning the next action. A null `executionPolicy` is only one input to that classification.

1. Check the interaction, approval, wake, monitor, active-run, and recovery routes in *Stall Check*. If any path is pending, record it as `WAITING-INTERACTION`, `WAITING-APPROVAL`, or the matching owner in the routine summary and do not nudge, reassign, or change status.
2. If every path is absent, flag the issue as `IN-REVIEW-WITHOUT-ACTION-PATH` and leave a structured comment naming the missing owner.
3. Make the next action explicit according to the work: add the intended reviewer/interaction, return it to `in_progress` with a concrete change request and active assignee, or mark it `done` if already accepted. Keep recovery on the originating issue unless independent work is genuinely required. For PR work, use exactly one non-author Code Reviewer stage when that role exists; otherwise return it to the engineer for self-merge.

## Author-only first stage

An `in_review` issue whose **first (current) executionPolicy stage lists only the issue's assignee as a participant** has an invalid review participant: Paperclip excludes the executor from every stage, so that stage cannot advance (`422 Only the active reviewer or approver can advance the current execution stage`). Common cause: a non-engineer (e.g. QA) was assigned implementation work, did it, moved the issue to `in_review`, and set itself as the first reviewer. Detect it with `GET /api/issues/{id}` (the list endpoint omits the full `executionPolicy`) and compare the current stage participants with `assigneeAgentId`. If another explicit waiting path is pending, leave it intact and defer policy repair until that path resolves.

1. Flag it in the routine-run summary as `AUTHOR-ONLY-STAGE`.
2. When no other waiting path is pending, leave a structured comment on the issue: `in_review` whose first executionPolicy stage lists only the assignee `<agent>` as participant — author-only stage with no eligible participant (`422`).
3. Recover by nulling the policy: `PATCH /api/issues/{id}` with `{"executionPolicy":null}` returns the issue to `in_progress` (do not try `{"status":"in_progress"}` alone — a active policy rejects that with `422 Only the active reviewer or approver can advance`). Then reassign to the correct owner (the engineer for implementation work) with the next action: either re-set `executionPolicy` stages with a **non-author first stage** (Code Reviewer present) or self-merge the PR via `gh pr merge <N> --merge` (no Code Reviewer). Never re-add the assignee as a stage participant.

## Dependency-ready but still blocked

Treat `GET /api/issues/{id}/diagnostics/blockers` as authoritative. When `readiness.isDependencyReady` is false, the issue is validly blocked; inspect the unresolved leaf and its action path. When readiness is true but the issue remains `blocked`, check wake diagnostics, active-run state, recent activity, and recovery actions before intervening. A queued/claimed wake or active recovery means Paperclip already owns the transition.

If `readiness.pendingFinalizeBlockerCount` is non-zero, a blocker may be `done` but still carry `workspace_finalize_pending`, so the dependency is not ready yet. A recent finalization is a valid wait. If finalization remains stale or the corresponding `issue_blockers_resolved` wake is `skipped`/`failed`, flag `WORKSPACE-FINALIZE-PENDING`, attach the blocker and wake diagnostics, and escalate the blocker/finalization failure to the CEO or board operator. Do not force the downstream issue active and do not archive/delete the blocker workspace as a workaround.

A `cancelled` blocker does **not** resolve a dependency. Remove that blocker relation from every dependent when the dependency is no longer required, or replace it with the issue that now owns the work. Do not force a dependent active while diagnostics still list the cancelled blocker as unresolved.

1. If dependency-ready with no active/queued wake or recovery action, flag it in the routine-run summary as `DEPENDENCY-READY-BUT-BLOCKED`.
2. Leave a structured comment with blocker readiness and wake-diagnostic evidence.
3. Reactivate it with `PATCH /api/issues/{id}` `{"status":"in_progress"}`, then assign the correct owner with an explicit next action. For a merge-gate issue, the next action is to verify the PR base and verification gate, merge, leave the execution workspace reusable, and mark `done`.
4. **Prefer prevention:** if you find a *separate* "merge PR #N" issue blocked behind review issues, do not just reactivate it in isolation — the right shape is one implementation issue carrying the PR through its `executionPolicy` stages (which auto-advance) rather than a fan-out of null-policy review issues plus a standalone blocked merge issue. Fold the merge back onto the implementation issue's policy where practical, and flag the fan-out pattern to the Product Owner so it stops being created.

## PR-queue hygiene

When `github-repo` is active, reconcile each configured project repository's open PRs against their originating Paperclip issues. Resolve repositories only from project metadata/workspace origin and identify every PR as `owner/repo#number`.

1. List open PRs and compare each with its originating issue, exact head/base, required CI, merge state, owner, and next gate.
2. Default WIP is at most two open implementation PRs per repository. At or above the cap, stop new PR-producing assignment and make waiting issues depend on the issues owning the open PRs; never create a queue-drain issue or polling monitor.
3. Route CI/runner failures, stale bases, conflicts, branch protection, packaging, deployment, and release mechanics on the **existing originating issue and PR** to the operational owner. Never open a replacement PR to escape a blocker.
4. A `done` issue with an open PR is an invariant violation. Reopen/route the originating issue when work remains, or close the obsolete PR with evidence. Do not create a separate merge, status, evidence, or cleanup issue.
5. Detect base-branch-red before blaming feature diffs. Restore the base through one explicitly owned baseline fix, then rebase and drain existing PRs.
6. Summarize repository counts and exact existing issue/PR next actions on the routine-run issue.

## Rules

- Do not @-mention as a generic nudge; use assignment, status, blockers, and explicit next-action comments.
- Do not interrupt running agents.
- Do not close or cancel another agent's work unless the issue explicitly grants that authority.
- Be specific: which issue, which agent, last activity, why stalled, and who owns the next action.
- Do not poll ordinary review stages, PR-capacity waits, or workspace cleanup with a fixed-cadence monitor when a live owner, blocker, participant, or wake path exists. For a named external transition such as a running CI job, use a bounded monitor no more often than every 15 minutes unless the issue defines a tighter SLA; set attempt/timeout bounds and comment only on a state change or terminal checkpoint.
- **Never archive or retire your own routine-run workspace.** This routine is pure control-plane work (reading and patching the board via the API) — it needs no repository state. When you finish, mark the routine issue `done` and exit. Do not call `PATCH /api/execution-workspaces/{id}` with `{"status":"archived"}`, do not check `close-readiness` to trigger a teardown, and do not otherwise remove the worktree your run is using. Archiving it mid-run makes Paperclip fail the run's workspace validation and breaks the next reuse of that workspace. Workspace retirement is a board/operator action only.
