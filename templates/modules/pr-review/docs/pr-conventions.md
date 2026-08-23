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

Review runs through one default non-author `executionPolicy` stage on the originating issue, not a serial chain or separate child issues. The gate is **exact-head verification, not opinion**.

1. **Engineer** resolves the project/worktree base ref before branching from `heartbeat-context` / project workspace metadata. Use the configured `repoRef`, `defaultRef`, or `executionWorkspacePolicy.workspaceStrategy.baseRef` exactly as Paperclip provides it. PRs must target the corresponding GitHub base and must not silently target the wrong branch.
2. **Engineer** opens the PR on GitHub and adds the PR link as an issue comment.
3. **Engineer** sets exactly one `approval` stage for the **Code Reviewer** as non-author merge gate. When no Code Reviewer is on the team, set no executionPolicy stages and use PR Self-Merge Flow.
   Resolve each role to its agentId. **Never list the issue's assignee/executor (whoever did the work — engineer, QA, or any role) as a participant in any stage** — the runtime excludes the original executor from every stage, so such a stage has no eligible participant and the issue stalls (`422 No eligible approval participant`). This applies to **every** stage, but is fatal in the **first** stage: a first stage listing only the assignee cannot be passed, so the issue stalls at stage 1 (`422 Only the active reviewer or approver can advance the current execution stage`) even when later stages have non-author participants. If the policy ended up with the assignee as the first/only participant of a stage, recover with `PATCH /api/issues/{id}` `{"executionPolicy":null}` (returns the issue to `in_progress`), then re-set stages with a non-author first stage — or, with no Code Reviewer, self-merge via `gh pr merge <N> --merge`. Non-engineer roles (e.g. QA) must not author implementation work and then self-review it; implementation work belongs to the engineer.
4. **Engineer** sets the issue to `in_review`.
5. Product acceptance is defined before engineering. QA, Security, UI/UX, Product, and DevOps contribute one bounded same-issue verdict only when a concrete trigger applies; they do not become serial stages or hand the issue to one another.
6. **Code Reviewer** verifies the exact head/base, required CI, and triggered evidence, merges into the configured base, confirms the merge landed, and only then records `approved` — which closes the issue.
7. A correction returns to the same implementation owner, issue, branch, and PR. Board users are not execution participants for technical defects; use a first-class board decision only for irreducible product, legal, licensing, or residual-risk acceptance.

## Review Roles

- **Product Owner**: freezes intent and acceptance before implementation; returns only for a concrete unresolved decision.
- **QA / Security / UI/UX / DevOps**: risk-triggered bounded evidence on the originating issue, never a serial default stage.
- **Code Reviewer**: the sole default non-author approval stage, exact-head verifier, and merge owner. When absent, the engineer self-merges with no executionPolicy stages.

## Merge Rules

The hard gate is **exact-head verification**, enforced by the Code Reviewer merge stage.

**When required company CI is available, it is authoritative on the exact reviewed head.** Cite the head SHA and required green checks, then run only the smallest independent check needed for a risky or unclear part of the diff. Do not duplicate the complete lint/test/typecheck/build suite. When company CI is unavailable, run the complete local gate once and record the real output.

**CI is a gate only when this company runs its own CI/CD** — i.e. the `ci-cd` module is active (you have the `ci-cd` skill and a `docs/CI-CD*.md` the company authored). In that case the company-owned CI (lint/test/build) must be **green** before the merge gate merges, with one narrow exception: the baseline-restore PR (`fix(ci): restore base CI`) may merge when the base branch's own CI is red and the PR carries cited local-executed verification that its scoped diff reduces the base failure set (remaining failing checks exactly the inherited baseline set). See `../../docs/git-workflow.md` → *Base-branch-red deadlock* and *Narrow exception*. A feature PR on a red company-owned base is never merged; the merge gate records `changes_requested` citing `BASE-BRANCH-RED` and routes back with "waiting-on-baseline".

**When the company did NOT set up CI/CD** (no `ci-cd` module): treat any pre-existing checks on the repository as **advisory signals, not a merge gate**. Do not block or refuse a merge solely because a repo-native check the company never configured is red or flaky — your pasted local lint/test/build output is the sufficient and authoritative gate. (Investigate a red repo check if it points at a real defect in the diff, but never let an external/inherited CI you don't own deadlock the queue.)
- Triggered specialist evidence must be resolved on the originating issue before merge; completed evidence is not replayed after every correction.
- No force pushes.
- Merge using `gh pr merge <number> --merge`.
- Before merge, verify the PR base matches the configured project/worktree base from `heartbeat-context`. Retarget before review/merge if needed.
- The Code Reviewer is the merge owner (a non-author); the engineer who wrote the PR cannot merge it.
- The merge gate is the **only default stage** and must be a non-author. The issue's executor is never a participant.
- If Paperclip created an isolated execution workspace for the issue, leave it reusable after the PR is merged and the tree is clean. Do not archive/delete it as part of recording approval or marking the issue `done`; review, follow-up, or dependent work may still reference it. Workspace retirement is a separate board/operator action.
- Do not configure GitHub branch protection to require approving reviews unless the project has distinct non-author GitHub reviewer credentials; all agents using one GitHub account cannot formally approve their own PRs.

## Dev Cycle Rules

**Requires PR**: code logic, APIs, DB schema, agent configs, infrastructure
**Direct-to-base-ref OK**: typos, comment-only changes, minor doc fixes (must reference issue)
