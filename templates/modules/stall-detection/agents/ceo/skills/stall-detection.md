# Skill: Stall Detection

You own stall detection when you are explicitly assigned a stall-detection routine run. This is not an every-heartbeat background scan.

This routine is the **periodic backstop**. Individual top-level issues should also carry a per-issue **task watchdog** (`watchdog: { agentId, instructions }` set at issue creation — see the backlog-health skill), which Paperclip fires event-driven the moment an issue's subtree stalls. When you find a stalled top-level issue here that has no watchdog, add one as part of the fix so it recovers natively next time instead of waiting for this scan.

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
3. Make the next action explicit according to the work: add the intended reviewer/interaction, return it to `in_progress` with a concrete change request and active assignee, mark it `done` if already accepted, or open a bounded recovery issue. For PR work, set non-author `executionPolicy` stages when a Code Reviewer exists; otherwise return it to the engineer for the self-merge flow.

## Author-only first stage

An `in_review` issue whose **first (current) executionPolicy stage lists only the issue's assignee as a participant** has an invalid review participant: Paperclip excludes the executor from every stage, so that stage cannot advance (`422 Only the active reviewer or approver can advance the current execution stage`). Common cause: a non-engineer (e.g. QA) was assigned implementation work, did it, moved the issue to `in_review`, and set itself as the first reviewer. Detect it with `GET /api/issues/{id}` (the list endpoint omits the full `executionPolicy`) and compare the current stage participants with `assigneeAgentId`. If another explicit waiting path is pending, leave it intact and defer policy repair until that path resolves.

1. Flag it in the routine-run summary as `AUTHOR-ONLY-STAGE`.
2. When no other waiting path is pending, leave a structured comment on the issue: `in_review` whose first executionPolicy stage lists only the assignee `<agent>` as participant — author-only stage with no eligible participant (`422`).
3. Recover by nulling the policy: `PATCH /api/issues/{id}` with `{"executionPolicy":null}` returns the issue to `in_progress` (do not try `{"status":"in_progress"}` alone — a active policy rejects that with `422 Only the active reviewer or approver can advance`). Then reassign to the correct owner (the engineer for implementation work) with the next action: either re-set `executionPolicy` stages with a **non-author first stage** (Code Reviewer present) or self-merge the PR via `gh pr merge <N> --merge` (no Code Reviewer). Never re-add the assignee as a stage participant.

## Dependency-ready but still blocked

Treat `GET /api/issues/{id}/diagnostics/blockers` as authoritative. When `readiness.isDependencyReady` is false, the issue is validly blocked; inspect the unresolved leaf and its action path. When readiness is true but the issue remains `blocked`, check wake diagnostics, active-run state, recent activity, and recovery actions before intervening. A queued/claimed wake or active recovery means Paperclip already owns the transition.

If `readiness.pendingFinalizeBlockerCount` is non-zero, a blocker may be `done` but still carry `workspace_finalize_pending`, so the dependency is not ready yet. A recent finalization is a valid wait. If finalization remains stale or the corresponding `issue_blockers_resolved` wake is `skipped`/`failed`, flag `WORKSPACE-FINALIZE-PENDING`, attach the blocker and wake diagnostics, and escalate the blocker/finalization failure to the CEO or board operator. Do not force the downstream issue active and do not archive/delete the blocker workspace as a workaround.

1. If dependency-ready with no active/queued wake or recovery action, flag it in the routine-run summary as `DEPENDENCY-READY-BUT-BLOCKED`.
2. Leave a structured comment with blocker readiness and wake-diagnostic evidence.
3. Reactivate it with `PATCH /api/issues/{id}` `{"status":"in_progress"}`, then assign the correct owner with an explicit next action. For a merge-gate issue, the next action is to verify the PR base and verification gate, merge, leave the execution workspace reusable, and mark `done`.
4. **Prefer prevention:** if you find a *separate* "merge PR #N" issue blocked behind review issues, do not just reactivate it in isolation — the right shape is one implementation issue carrying the PR through its `executionPolicy` stages (which auto-advance) rather than a fan-out of null-policy review issues plus a standalone blocked merge issue. Fold the merge back onto the implementation issue's policy where practical, and flag the fan-out pattern to the Product Owner so it stops being created.

## PR-queue hygiene

As part of every stall-detection run, scan the repository's open PR queue for pile-ups and red/DIRTY state — the issue queue alone does not surface a growing PR backlog. This scan only applies when the `github-repo` module is active (so `gh` is configured and a repository exists). Discover the repo from the project workspace metadata (`repoUrl` / `repoRef`) or your `heartbeat-context`; for multi-repo companies, scan each project's repo.

1. List open PRs: `gh pr list --repo <owner/repo> --state open --json number,title,mergeStateStatus,headRefName,baseRefName`.
2. Count PRs in each state: UNSTABLE (mergeable but CI failing), DIRTY/CONFLICTING, CLEAN.
3. Escalate a triage issue when any threshold is met:
   - **3 or more** UNSTABLE or DIRTY/CONFLICTING PRs, or
   - **8 or more** open PRs total.
4. Before opening the triage issue, run the base-branch-red detection in `../../docs/git-workflow.md` → *Base-branch-red deadlock* against the base commit (if `../../docs/git-workflow.md` is present — it ships with `github-repo`, which is active here). If the base is red, the triage issue names `BASE-BRANCH-RED` and instructs the baseline-emergency protocol (fix main first, fast-track the baseline-restore PR, drain the queue) — the pile-up is a symptom of the red base, not individual PR faults.
5. If the base is green, the triage issue lists each UNSTABLE/DIRTY PR with its owner and the specific next action (rebase for DIRTY, fix the introduced failure for UNSTABLE).
6. Assign the triage issue to the CEO (or the engineer owning the red base) and summarize on the routine-run issue.
7. **Reconcile each open PR against its owning issue.** A `CLEAN`/mergeable open PR (CI green or no required CI) whose owning issue is already `done`, or whose dedicated merge issue is still `blocked` despite dependency readiness, means the merge step never ran. For each such PR: confirm the base and verification gate, then merge it (`gh pr merge <N> --merge`) or route a one-line next action to the merge owner, and recover the merge issue per *Dependency-ready but still blocked* above. Never leave a green, approved PR unmerged because its tracking issue already closed.

## Rules

- Do not @-mention as a generic nudge; use assignment, status, blockers, and explicit next-action comments.
- Do not interrupt running agents.
- Do not close or cancel another agent's work unless the issue explicitly grants that authority.
- Be specific: which issue, which agent, last activity, why stalled, and who owns the next action.
- **Never archive or retire your own routine-run workspace.** This routine is pure control-plane work (reading and patching the board via the API) — it needs no repository state. When you finish, mark the routine issue `done` and exit. Do not call `PATCH /api/execution-workspaces/{id}` with `{"status":"archived"}`, do not check `close-readiness` to trigger a teardown, and do not otherwise remove the worktree your run is using. Archiving it mid-run makes Paperclip fail the run's workspace validation and breaks the next reuse of that workspace. Workspace retirement is a board/operator action only.
