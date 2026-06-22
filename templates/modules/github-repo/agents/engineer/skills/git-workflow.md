# Skill: Git Workflow

You work in a GitHub repository. Follow the conventions in `docs/git-workflow.md` in the project root.

## PR Self-Merge Flow (no pr-review module)

Use this flow when the **pr-review module is not active**. You open a PR and merge it yourself — there is no external review gate, but all changes go through a PR so the branch history is preserved and branch protection is respected.

1. Before the first push on a project, confirm the GitHub credential helper from `docs/git-workflow.md` -> *GitHub Push Authentication* is installed in the primary repository. If `GH_TOKEN` is not injected or the helper cache is empty, stop and escalate instead of attempting unauthenticated pushes.
2. Resolve the base ref from project workspace metadata or the issue's `heartbeat-context`. Use the configured `repoRef`, `defaultRef`, or `executionWorkspacePolicy.workspaceStrategy.baseRef` exactly as Paperclip provides it. Never guess from the current shell branch and never rewrite the configured ref to `main`, `master`, or `origin/*`. If no base ref is configured anywhere, use the repository's actual default branch — whatever `origin/HEAD` points at, regardless of name (`main`/`master`/`trunk`/…); fall back to `main` then `master` only if the remote advertises no default HEAD. See `docs/git-workflow.md` → *Resolving the default branch*. Never hard-code `main`.
3. Pull/update latest from that base:
   - external: `git fetch origin`, then integrate from the configured base ref
   - local: update from the configured local branch
4. **Create a feature branch** from the base ref: `git checkout -b <branch-name> <base-ref>`. Never commit directly on the base branch. The branch name should reference the issue (e.g., `LEA-5-add-landing-hero`). If you are already on a correctly named feature branch, skip this step.
5. Verify you are on the feature branch before making changes: `git branch --show-current` must print `<branch-name>`, not the base ref. If it prints the base ref name, you forgot step 4 — create the branch now.
6. Make your changes
7. Run available checks (lint, typecheck, tests)
8. Commit using Conventional Commits: `<type>: <description>`
9. Verify the current branch one more time, then push: `git push -u origin <branch-name>`. The branch name in the push command must match `git branch --show-current`. Never push the base ref as a feature branch — if `git branch --show-current` returns the base ref name, stop and create a feature branch first.
10. Open a pull request against the base ref: `gh pr create --base <github-base-branch> --head <branch-name> --title "<type>: <description>" --body-file <file>`. `<github-base-branch>` is the **plain branch name** — strip any `origin/` prefix from the configured base ref (e.g., configured `origin/main` → `--base main`). GitHub does not recognise remote-tracking names. Write the PR body to a temp file first — never inline `--body "..."`. Register the PR as a Paperclip work product (see *Register the PR as a Work Product* below). Verify the PR base matches the configured base ref before merging.
11. Before merging, check that the PR is not conflicting: `gh pr view <PR-number> --json mergeable,mergeStateStatus`. If `mergeable` is `CONFLICTING` or `mergeStateStatus` is `DIRTY`, resolve the conflict before merging — see *Resolving merge conflicts* below. Also check CI: `gh pr checks <PR-number>`. If CI is failing, run the **base-branch-red detection** in `docs/git-workflow.md` → *Base-branch-red deadlock* before merging — a red base poisons every PR and a feature PR on a red base must not merge. Follow the baseline-emergency protocol there (fix main first, then drain the queue).
12. Merge the PR yourself: `gh pr merge <PR-number> --merge`. After opening the PR, merge it yourself promptly — do not wait for a reviewer if none is present. Confirm the PR is closed and the base branch updated before continuing. **Baseline-restore exception (Self-Merge mode):** if this PR is the `fix(ci): restore base CI` PR opened under a declared baseline emergency, its CI will still be red from the inherited base failure — you may merge it via `gh pr merge <PR-number> --merge` despite red CI, provided you ran the exact failing checks locally and pasted the passing output into the issue, and the remaining failing checks are exactly the inherited baseline failures. See `docs/git-workflow.md` → *Narrow exception*. This exception never applies to a feature PR.
13. Clean up the feature branch: `git push origin --delete <branch-name>` (remote) and `git branch -d <branch-name>` (local). Update the Paperclip work product to `"status": "merged"` via `PATCH /api/work-products/{workProductId}`.
14. If the issue uses an isolated execution workspace (worktree), archive it from your `heartbeat-context` after the merge is pushed.
15. If CI fails on the base branch after the merge, run the baseline-emergency protocol in `docs/git-workflow.md` → *Base-branch-red deadlock* (detect base-red, fix main first with a `fix(ci): restore base CI` PR, fast-track it through merge under the narrow exception, re-verify the base is green, then rebase and drain the feature-PR queue). A red base blocks everyone — do not leave it red and do not pile new feature PRs onto it.

## Branch Protection Setup

Configure branch protection once during initial repository setup (this is part of the "Prepare GitHub repository" foundation issue). Branch protection must require a PR before merging but must NOT require GitHub-native approving reviews — all agents share one GitHub account and cannot formally approve their own PRs (unless the project has distinct non-author GitHub reviewer credentials, in which case `required_approving_review_count` may be raised).

```bash
gh api repos/{owner}/{repo}/branches/{base}/protection \
  --method PUT --input - <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": false
  },
  "restrictions": null
}
EOF
```

Replace `{owner}`, `{repo}`, `{base}` with the actual values. `enforce_admins: true` so the shared admin account cannot bypass the PR requirement with a direct push — with `required_approving_review_count: 0` the admin can still open a PR and merge it with zero approvals, so the self-merge flow keeps working. `restrictions: null` means no push allowlist; the PR gate still applies (do not "fix" it with an empty array, which would block all pushes). If CI is configured (e.g. the ci-cd module is active), replace `"required_status_checks": null` with the CI context string instead of `null`. Escalate to CEO if `GH_TOKEN` does not have admin rights on the repository.

## When PR Review IS Active

If the pr-review module is active, do NOT use the PR Self-Merge Flow. Instead, use the PR Workflow skill (`skills/pr-workflow.md`):
- **With a Code Reviewer on the team (PR-Gate mode):** Open a PR, set executionPolicy review stages, and let the Code Reviewer (non-author merge gate) land the branch. Never merge your own branch in this mode.
- **Without a Code Reviewer (PR Self-Merge Flow):** Open a PR via `gh pr create`, but skip executionPolicy stages entirely. Other review roles (qa, product-owner, security-engineer) may leave advisory comments. Merge the PR yourself via `gh pr merge <N> --merge` once CI is green. See `skills/pr-workflow.md` step 12 for the full self-merge path.

## Register the PR as a Work Product

Whenever you open a pull request (via `gh pr create`), immediately register it as a Paperclip work product so it shows up on the issue and the board. Creating the PR on GitHub alone does **not** make it visible in Paperclip.

```
POST /api/issues/{issueId}/work-products
Headers: Authorization: Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{
  "type": "pull_request",
  "provider": "github",
  "externalId": "<PR number, e.g. 132>",
  "url": "<full PR URL from `gh pr create`>",
  "title": "<PR title>",
  "status": "ready_for_review",
  "isPrimary": true
}
```

Notes:
- `title` and `url` are required; `url` must be the full PR URL.
- If the issue runs in an isolated execution workspace, also pass `"executionWorkspaceId"` from your `heartbeat-context` so the PR is linked to that worktree.
- When the PR later merges or closes, update the work product (`PATCH /api/work-products/{workProductId}`) with `"status": "merged"` or `"closed"`.

## Rules

- Always pull before starting work to avoid conflicts.
- Keep commits focused — one concern per commit.
- Never force push to the base branch.
- Use the configured base ref. For external repos, branch and compare from the configured remote/ref and push/merge back to the matching remote branch.
- Treat push authentication as repository setup, not as an issue blocker. If `git push` says credentials are missing or invalid, verify the helper and `GH_TOKEN` binding first.
- If `gh pr merge` fails or `gh pr view` reports `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY`, resolve the conflict before retrying — see *Resolving merge conflicts* below. Never leave a PR in an unresolved conflicting state without either fixing it or leaving an explicit issue comment with the blocker.
- Reference the issue ID in the commit body (e.g., `Closes YES-5`).
- Never mark an issue as `done` unless at least one new commit was created for that issue's work and has been pushed.
- Before marking `done`, verify there is no uncommitted work (`git status --short` should be clean).
- If no repository change is required, do not mark `done` silently: leave an issue comment explaining why no code change was needed and escalate to the CEO for decision.
- You are always the merge owner when no code-reviewer is present. Open a PR and merge it yourself via `gh pr merge <N> --merge` promptly — do not leave branches dangling unmerged. Never do a direct `git merge` + push to the base branch; always go through a PR so the branch history is preserved and branch protection is respected (typos/comment-only/doc fixes with an issue reference may be committed directly to the base ref only when branch protection allows it — see `docs/git-workflow.md` → *Dev Cycle Rules*).
- **Always work on a feature branch, never on the base branch.** Create the branch with `git checkout -b <branch-name> <base-ref>` before committing. Verify with `git branch --show-current` before every push.
- **Never push the base ref as if it were a feature branch.** Before `git push -u origin <branch-name>`, confirm that `git branch --show-current` matches `<branch-name>`. If it prints the base ref name instead, you are on the wrong branch — create or switch to the feature branch first.
- **Do not open new feature PRs on a red base.** When the base branch's CI is red, every PR inherits the failure at baseline setup and the queue deadlocks under "never merge without green CI". Detect base-red per `docs/git-workflow.md` → *Base-branch-red deadlock* and run the baseline-emergency protocol (fix main first, fast-track the baseline-restore PR, then drain the queue) before opening or merging feature PRs.

## Resolving merge conflicts

When `gh pr merge` fails or `gh pr view <N> --json mergeable,mergeStateStatus` returns `CONFLICTING` / `DIRTY`:

1. `git fetch origin`
2. `git checkout <branch-name>`
3. `git rebase origin/<base-branch>` where `<base-branch>` is the plain branch name — strip any `origin/` prefix from the configured base ref (e.g., configured `origin/main` → `git rebase origin/main`; configured `main` → `git rebase origin/main`). Resolve each conflict marker, then `git rebase --continue`.
4. Run the full check suite (lint, typecheck, tests) to confirm nothing broke.
5. `git push --force-with-lease origin <branch-name>` — never `--force`, use `--force-with-lease` to avoid overwriting concurrent pushes.
6. Verify the conflict is gone: `gh pr view <N> --json mergeable` should return `MERGEABLE`.
7. Retry the merge: `gh pr merge <N> --merge`.

If the conflict is too complex to resolve safely (e.g., a large structural conflict with another in-flight PR), leave an issue comment describing the exact conflict and escalate to the CEO for prioritization before abandoning the branch.