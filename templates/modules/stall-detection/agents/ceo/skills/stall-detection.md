# Skill: Stall Detection

You own stall detection when you are explicitly assigned a stall-detection routine run. This is not an every-heartbeat background scan.

## When To Use This Skill

Use this only when the current assigned issue/routine is titled like "Stall detection" or explicitly asks you to inspect stalled work. Otherwise follow the normal Paperclip heartbeat rule: only work assigned issues and do not scan the whole board.

## Stall Check

1. Checkout the assigned routine-run issue.
2. Query active issues for the relevant company/project: `todo`, `in_progress`, `in_review`, and blocked work where applicable.
3. For each candidate, inspect latest comments/activity, execution state, blockers, approval/review state, and assigned agent status.
4. Skip issues with an active run, recent activity, valid `blockedByIssueIds`, or a genuinely pending executionPolicy approval/review (issue `in_review` **with** a non-author stage). An issue `in_review` with `executionPolicy: null` or no non-author stage is NOT pending review — it is a misrouted stall (see *Misrouted in_review* below).
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

## PR-queue hygiene

As part of every stall-detection run, scan the repository's open PR queue for pile-ups and red/DIRTY state — the issue queue alone does not surface a growing PR backlog. This scan only applies when the `github-repo` module is active (so `gh` is configured and a repository exists). Discover the repo from the project workspace metadata (`repoUrl` / `repoRef`) or your `heartbeat-context`; for multi-repo companies, scan each project's repo.

1. List open PRs: `gh pr list --repo <owner/repo> --state open --json number,title,mergeStateStatus,headRefName,baseRefName`.
2. Count PRs in each state: UNSTABLE (mergeable but CI failing), DIRTY/CONFLICTING, CLEAN.
3. Escalate a triage issue when any threshold is met:
   - **3 or more** UNSTABLE or DIRTY/CONFLICTING PRs, or
   - **8 or more** open PRs total.
4. Before opening the triage issue, run the base-branch-red detection in `docs/git-workflow.md` → *Base-branch-red deadlock* against the base commit (if `docs/git-workflow.md` is present — it ships with `github-repo`, which is active here). If the base is red, the triage issue names `BASE-BRANCH-RED` and instructs the baseline-emergency protocol (fix main first, fast-track the baseline-restore PR, drain the queue) — the pile-up is a symptom of the red base, not individual PR faults.
5. If the base is green, the triage issue lists each UNSTABLE/DIRTY PR with its owner and the specific next action (rebase for DIRTY, fix the introduced failure for UNSTABLE).
6. Assign the triage issue to the CEO (or the engineer owning the red base) and summarize on the routine-run issue.

## Rules

- Do not @-mention as a generic nudge; use assignment, status, blockers, and explicit next-action comments.
- Do not interrupt running agents.
- Do not close or cancel another agent's work unless the issue explicitly grants that authority.
- Be specific: which issue, which agent, last activity, why stalled, and who owns the next action.
