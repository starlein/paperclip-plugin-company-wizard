# Skill: Stall Detection

You own stall detection when you are explicitly assigned a stall-detection routine run. This is not an every-heartbeat background scan.

## When To Use This Skill

Use this only when the current assigned issue/routine is titled like "Stall detection" or explicitly asks you to inspect stalled work. Otherwise follow the normal Paperclip heartbeat rule: only work assigned issues and do not scan the whole board.

## Stall Check

1. Checkout the assigned routine-run issue.
2. Query active issues for the relevant company/project: `todo`, `in_progress`, `in_review`, and blocked work where applicable.
3. For each candidate, inspect latest comments/activity, execution state, blockers, approval/review state, and assigned agent status.
4. Skip issues with an active run, recent activity, or a genuinely pending executionPolicy approval/review — meaning `in_review` **whose current (first unapproved) stage has at least one non-author participant**. An issue `in_review` with `executionPolicy: null`, with no non-author stage at all, OR whose first/current stage lists only the assignee (author) as a participant is NOT pending review — it is a stall (see *Misrouted in_review* and *Author-only first stage* below). A `blocked` issue counts as validly blocked **only if at least one of its blockers is still open** (`todo`/`in_progress`/`in_review`/`blocked`). A `blocked` issue whose blockers are **all** `done`/`cancelled` (or that has no blockers at all) is NOT validly blocked — it is a stall (see *Stranded blocked* below).
5. For a likely stall, leave a structured comment on the issue with:
   - issue id/title
   - assigned agent
   - last activity timestamp/context
   - why it appears stalled
   - exact next action requested
6. Prefer reassignment, blocker linkage, or escalation to CEO/Product Owner over informal nudges.
7. If an agent is `error`, paused, or repeatedly non-responsive, escalate with an issue comment and assign the manager/CEO as appropriate.
8. Summarize findings on the routine-run issue and mark it done.

## Misrouted in_review (null executionPolicy)

An issue in `in_review` with `executionPolicy: null` (or no stage with a non-author participant) has no reviewer path and no eligible participant — it can never advance. This is a permanent stall, not a pending review. Detect it during the in_review scan (step 2-5), not after the summary.

1. Flag it in the routine-run summary as `MISROUTED-REVIEW`.
2. Leave a structured comment on the issue: status `in_review` with no executionPolicy, no eligible reviewer, assigned to the engineer — must recover.
3. Assign the issue back to the engineer with the next action: move to `in_progress`, then either set `executionPolicy` stages (if a Code Reviewer exists on the team) or self-merge the PR via `gh pr merge <N> --merge` and mark `done` (if no Code Reviewer). An `in_review` issue with no policy and no self-merge in progress is a permanent stall — do not skip it as "pending review".

## Author-only first stage

An issue `in_review` whose **first (current) executionPolicy stage lists only the issue's assignee as a participant** stalls immediately: Paperclip excludes the executor from every stage, so that stage has no eligible participant and the issue can never advance past stage 1 (`422 Only the active reviewer or approver can advance the current execution stage`). This is a stall **even when later stages have non-author participants** — the first stage must pass first, and it cannot. Common cause: a non-engineer (e.g. QA) was assigned implementation work, did it, moved the issue to `in_review`, and the policy's first review stage was set to that same agent (self-review). Detect it during the in_review scan (step 2-5): `GET /api/issues/{id}` for the full `executionPolicy` (the list endpoint omits it), inspect `stages[0].participants`, and compare against `assigneeAgentId`.

1. Flag it in the routine-run summary as `AUTHOR-ONLY-STAGE`.
2. Leave a structured comment on the issue: `in_review` whose first executionPolicy stage lists only the assignee `<agent>` as participant — author-only stage, no eligible participant, permanent stall (`422`).
3. Recover by nulling the policy: `PATCH /api/issues/{id}` with `{"executionPolicy":null}` returns the issue to `in_progress` (do not try `{"status":"in_progress"}` alone — a active policy rejects that with `422 Only the active reviewer or approver can advance`). Then reassign to the correct owner (the engineer for implementation work) with the next action: either re-set `executionPolicy` stages with a **non-author first stage** (Code Reviewer present) or self-merge the PR via `gh pr merge <N> --merge` (no Code Reviewer). Never re-add the assignee as a stage participant.

## Stranded blocked (blockers done, never reactivated)

An issue in `blocked` whose blockers have **all** reached `done`/`cancelled` is permanently stranded: Paperclip only re-wakes a blocked issue's assignee when a blocker transitions to `done` **and** that blocker's execution workspace has recorded a successful finalize. If the wake was missed, or all blockers were already `done` when the block was set, the issue is never reactivated — and because worker agents have heartbeats disabled, the assignee never wakes on its own. The platform's liveness watchdog also skips a blocked issue once its blockers are `done`, so nothing recovers it. **This is the dominant cause of "PRs open but never merged":** the merge step is frequently modeled as a separate `blocked` "Code review and merge PR #N" issue (assigned to the Code Reviewer) that is `blockedBy` the per-role review issues; once those reviews finish (`done`), the merge issue is stranded `blocked` and the PR is never merged — even when it is green and mergeable.

Detect it during the blocked scan (step 2-5): `GET /api/issues/{id}` and inspect `blockedBy` (every entry `done`/`cancelled`, or empty) — or `blockerAttention` showing `state: "needs_attention"` with `unresolvedBlockerCount: 0`.

1. Flag it in the routine-run summary as `STRANDED-BLOCKED`.
2. Leave a structured comment on the issue: `blocked` with no open blockers (all blockers `done`/`cancelled`) — never reactivated; recovering.
3. Reactivate it: `PATCH /api/issues/{id}` with `{"status":"in_progress"}` (a `blocked` issue with `executionPolicy: null` accepts this directly), then **re-assign it to the owner** (for a merge-gate issue, the Code Reviewer; otherwise the role that owns the next action) to trigger a wake, with an explicit next-action comment. For a merge-gate issue the next action is: verify the PR base, satisfy the verification gate (green CI, or paste test/build output where CI is disabled), `gh pr merge <N> --merge`, close/archive any worktree, then mark `done`.
4. **Prefer prevention over re-stranding:** if you find a *separate* "merge PR #N" issue blocked behind review issues, do not just reactivate it in isolation — the right shape is one implementation issue carrying the PR through its `executionPolicy` stages (which auto-advance) rather than a fan-out of NULL-policy review issues plus a standalone blocked merge issue. Fold the merge back onto the implementation issue's policy where practical, and flag the fan-out pattern to the Product Owner so it stops being created.

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
7. **Reconcile each open PR against its owning issue.** A `CLEAN`/mergeable open PR (CI green or no required CI) whose owning issue is already `done`, or whose dedicated merge issue is `blocked`/stranded, means the merge step never ran — the *exact* "open but never merged" failure. For each such PR: confirm the base is correct and the verification gate is satisfied, then merge it (`gh pr merge <N> --merge`) or route a one-line next-action to the merge owner, and reactivate the stranded merge issue per *Stranded blocked* above. Never leave a green, approved PR unmerged because its tracking issue already closed.

## Rules

- Do not @-mention as a generic nudge; use assignment, status, blockers, and explicit next-action comments.
- Do not interrupt running agents.
- Do not close or cancel another agent's work unless the issue explicitly grants that authority.
- Be specific: which issue, which agent, last activity, why stalled, and who owns the next action.
