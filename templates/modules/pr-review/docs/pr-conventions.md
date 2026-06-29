# PR Conventions

## Branch Naming

```
<prefix>-<N>/<short-description>
```

Where `<prefix>` is the company issue prefix (lowercase) and `<N>` is the issue number.

Examples: `yes-6/add-auth-endpoint`, `yes-12/fix-game-loop`

## PR Title

Use Conventional Commits format:

```
<type>: <short description>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`

Rules: lowercase after colon, no period, under 72 chars.

## PR Body Template

```markdown
## What changed
<Brief description of the changes>

## Why
<Motivation and context>

## How to test
<Steps to verify the changes>

## Related
Closes [PREFIX-N]
```

## Posting PR Bodies & Comments

Always pass Markdown through a **file** (`--body-file`), never an inline `--body "..."`. A double-quoted shell argument does **not** turn `\n` into a real newline, so an inline body renders on GitHub as literal `text\ntext\ntext` instead of formatted Markdown. Write the body to a file first:

```bash
# Real newlines + full Markdown (headings, lists, code blocks) preserved.
cat > /tmp/pr-body.md <<'EOF'
## What changed
...
EOF

gh pr create  --title "<type>: <description>" --body-file /tmp/pr-body.md
gh pr comment <number> --body-file /tmp/pr-body.md
```

Every PR comment opens with a Markdown heading stating the verdict (`## ✅ Approved`, `## 🔄 Changes requested`, or `## 💬 Review notes`), followed by a short summary and bullet points or code blocks.

## Labels

Apply one primary label: `feature`, `bug`, `docs`, `chore`, `infra`, `agent`.

## Review Workflow

Review runs through the issue's native `executionPolicy` (stages), not separate child issues. The gate is **executed verification, not opinion**.

1. **Engineer** resolves the project/worktree base ref before branching from `heartbeat-context` / project workspace metadata. Use the configured `repoRef`, `defaultRef`, or `executionWorkspacePolicy.workspaceStrategy.baseRef` exactly as Paperclip provides it. PRs must target the corresponding GitHub base and must not silently target the wrong branch.
2. **Engineer** opens the PR on GitHub and adds the PR link as an issue comment.
3. **Engineer** sets the originating issue's `executionPolicy` stages, in order:
   - a `review` stage for **QA** when a QA agent is on the team (test adequacy / running the tests),
   - a `review` stage for the **Security Engineer** *only when the change is security-relevant* (auth, secrets, input boundaries, crypto, dependencies, infra exposure),
   - an `approval` stage for the **Product Owner** when one is on the team (intent, scope, acceptance),
   - a final `approval` stage for the **Code Reviewer** as the merge gate (a non-author — Paperclip excludes the issue's executor from every stage). When no Code Reviewer is on the team, do not set executionPolicy stages at all — use the PR Self-Merge Flow (the engineer opens the PR and merges via `gh pr merge <N> --merge`); other review roles may leave advisory comments but do not block.
   Resolve each role to its agentId. **Never list the issue's assignee/executor (whoever did the work — engineer, QA, or any role) as a participant in any stage** — the runtime excludes the original executor from every stage, so such a stage has no eligible participant and the issue stalls (`422 No eligible approval participant`). This applies to **every** stage, but is fatal in the **first** stage: a first stage listing only the assignee cannot be passed, so the issue stalls at stage 1 (`422 Only the active reviewer or approver can advance the current execution stage`) even when later stages have non-author participants. If the policy ended up with the assignee as the first/only participant of a stage, recover with `PATCH /api/issues/{id}` `{"executionPolicy":null}` (returns the issue to `in_progress`), then re-set stages with a non-author first stage — or, with no Code Reviewer, self-merge via `gh pr merge <N> --merge`. Non-engineer roles (e.g. QA) must not author implementation work and then self-review it; implementation work belongs to the engineer.
4. **Engineer** sets the issue to `in_review`.
5. **QA** (when present) reviews and records `approved`/`changes_requested` through the normal issue update route with executed evidence (see *Merge Rules*), preserving the issue-level review audit trail.
6. **Security Engineer** (when present as a stage) probes the security-relevant change and records a verdict stating what was checked.
7. Other domain reviewers may add **advisory, non-blocking** PR comments. They do not gate the merge.
8. **Product Owner** reviews for intent match, scope discipline, and acceptance criteria, and records the `approval` verdict through the normal issue update route, preserving the issue-level approval audit trail.
9. **Code Reviewer** owns the final `approval` stage (merge gate): once reviewers and the Product Owner have approved, the Code Reviewer satisfies the hard gate (CI green, or runs the tests/build and pastes the output), merges the PR into the correct configured base, confirms the merge landed, closes/archives the isolated execution workspace when one exists and close-readiness allows it, and only then records `approved` — which closes the issue to `done`. The merge and workspace cleanup must happen before the issue is `done`. The merge owner must be a non-author: Paperclip excludes the issue's executor (the engineer) from every stage, so the engineer cannot be the merge gate.

## Review Roles

- **QA** (`review` stage, when present): the substantive gate. Test coverage, regression risk, and validation — backed by tests that actually ran.
- **Security Engineer** (`review` stage, only when the change is security-relevant): probes the diff for injection, auth, secrets, crypto, dependency, and exposure issues.
- **Product Owner** (`approval` stage, when present): intent alignment, scope discipline, acceptance criteria.
- **Code Reviewer** (`approval` stage, last, when present): the merge gate and hard-gate backstop — a non-author who verifies and lands the PR. See *Merge Rules*. When no Code Reviewer is present, the engineer self-merges via `gh pr merge <N> --merge` and no executionPolicy stages are set.
- **Domain reviewers** (advisory): optional, non-blocking comments on correctness, clarity, design, accessibility, UX. They never gate the merge.

## Merge Rules

The hard gate is **executed verification**, enforced on the merge-gate stage (the Code Reviewer's) and independent of which reviewers are present.

**The authoritative gate is the merge-gate agent's own executed verification: run the full lint/test/build locally and paste the real output into the merge-gate verdict before merging.** (When QA is present, QA already produced this evidence; the merge gate confirms it.) A verdict that does not cite executed verification — your pasted test/build output, or green company-owned CI — is not valid.

**CI is a gate only when this company runs its own CI/CD** — i.e. the `ci-cd` module is active (you have the `ci-cd` skill and a `docs/CI-CD*.md` the company authored). In that case the company-owned CI (lint/test/build) must be **green** before the merge gate merges, with one narrow exception: the baseline-restore PR (`fix(ci): restore base CI`) may merge when the base branch's own CI is red and the PR carries cited local-executed verification that its scoped diff reduces the base failure set (remaining failing checks exactly the inherited baseline set). See `docs/git-workflow.md` → *Base-branch-red deadlock* and *Narrow exception*. A feature PR on a red company-owned base is never merged; the merge gate records `changes_requested` citing `BASE-BRANCH-RED` and routes back with "waiting-on-baseline".

**When the company did NOT set up CI/CD** (no `ci-cd` module): treat any pre-existing checks on the repository as **advisory signals, not a merge gate**. Do not block or refuse a merge solely because a repo-native check the company never configured is red or flaky — your pasted local lint/test/build output is the sufficient and authoritative gate. (Investigate a red repo check if it points at a real defect in the diff, but never let an external/inherited CI you don't own deadlock the queue.)
- The Product Owner's `approval` stage must be approved.
- QA's `review` stage (when present) and the Security Engineer's `review` stage (when added) must be approved.
- Domain reviewers are advisory — blocking only when they escalate a concern that QA, the Security Engineer, or the merge gate then acts on.
- No force pushes.
- Merge using `gh pr merge <number> --merge`.
- Before merge, verify the PR base matches the configured project/worktree base from `heartbeat-context`. Retarget before review/merge if needed.
- The Code Reviewer is the merge owner (a non-author); the engineer who wrote the PR cannot merge it.
- The merge gate must be the **last** `approval` stage and must be a **non-author**. If the Product Owner's approval were last, it would auto-close the issue to `done` and the merge would be skipped, leaving the PR open on GitHub. The merge gate can never be the issue's executor — Paperclip excludes the original executor from every stage (`422 No eligible approval participant is configured for this issue`).
- If Paperclip created an isolated execution workspace for the issue, read its id from `heartbeat-context`, call close-readiness, and archive it after the PR is merged and the tree is clean. If cleanup is blocked or fails, do not mark the issue `done`; record the exact blocker and leave a concrete cleanup next action. If the issue runs in the shared project workspace, do not invent isolated-worktree cleanup.
- Do not configure GitHub branch protection to require approving reviews unless the project has distinct non-author GitHub reviewer credentials; all agents using one GitHub account cannot formally approve their own PRs.

## Dev Cycle Rules

**Requires PR**: code logic, APIs, DB schema, agent configs, infrastructure
**Direct-to-base-ref OK**: typos, comment-only changes, minor doc fixes (must reference issue)
