# Skill: Git Workflow

You work in a GitHub repository. Follow the conventions in `docs/git-workflow.md` in the project root.

## Direct-to-Base-Ref Flow

Use this flow when the **pr-review module is not active** — i.e., there is no Code Reviewer role and no executionPolicy review stages. In this flow, you commit and merge directly; there is no external review gate.

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
10. Open a pull request against the base ref: `gh pr create --base <github-base-branch> --head <branch-name> --title "<type>: <description>" --body-file <file>`. Write the PR body (summary, what changed, how to verify) to a temp file first — never inline `--body "..."`. Register the PR as a Paperclip work product (see *Register the PR as a Work Product* below). Verify the PR base matches the configured base ref before merging.
11. Merge the PR yourself: `gh pr merge <PR-number> --merge`. After opening the PR, merge it yourself promptly — do not wait for a reviewer if none is present. Confirm the PR is closed and the base branch updated before continuing.
12. Clean up the feature branch: `git push origin --delete <branch-name>` (remote) and `git branch -d <branch-name>` (local). Update the Paperclip work product to `"status": "merged"` via `PATCH /api/work-products/{workProductId}`.
13. If the issue uses an isolated execution workspace (worktree), archive it from your `heartbeat-context` after the merge is pushed.
14. If CI fails on the base branch after the merge, fix immediately.

## When PR Review IS Active

If the pr-review module is active and you have a Code Reviewer role on the team, do NOT use the Direct-to-Base-Ref Flow. Instead, use the PR Workflow skill (`skills/pr-workflow.md`) — open a PR, set executionPolicy review stages, and let the merge gate land the branch. Never merge your own branch when a PR review workflow is in place.

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
- If you encounter merge conflicts, resolve them carefully. When in doubt, escalate to the CEO.
- Reference the issue ID in the commit body (e.g., `Closes YES-5`).
- Never mark an issue as `done` unless at least one new commit was created for that issue's work and has been pushed.
- Before marking `done`, verify there is no uncommitted work (`git status --short` should be clean).
- If no repository change is required, do not mark `done` silently: leave an issue comment explaining why no code change was needed and escalate to the CEO for decision.
- You are always the merge owner when no code-reviewer is present. Open a PR and merge it yourself via `gh pr merge <N> --merge` promptly — do not leave branches dangling unmerged. Never do a direct `git merge` + push to the base branch; always go through a PR so the branch history is preserved and branch protection is respected.
- **Always work on a feature branch, never on the base branch.** Create the branch with `git checkout -b <branch-name> <base-ref>` before committing. Verify with `git branch --show-current` before every push.
- **Never push the base ref as if it were a feature branch.** Before `git push -u origin <branch-name>`, confirm that `git branch --show-current` matches `<branch-name>`. If it prints the base ref name instead, you are on the wrong branch — create or switch to the feature branch first.