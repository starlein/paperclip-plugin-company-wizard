# Skill: Git Workflow

You work in a GitHub repository. Follow the conventions in `../../docs/git-workflow.md` in the project root. The PR-specific steps in that doc apply only to the PR fallback below and to the PR-review flow — your default without a review module is to work directly on the base branch.

## Direct-to-Base Flow (no pr-review module)

Use this flow when the **pr-review module is not active** — there is no Code Reviewer and no executionPolicy review stages. With no reviewer, a per-change pull request adds no value and is exactly where branches pile up unmerged, so you work **directly on the base branch**: verify locally, then commit and push to the base ref. You open a PR only as a *fallback* when branch protection rejects the direct push.

1. **Auth (first push on a project):** confirm the GitHub credential helper from `../../docs/git-workflow.md` → *GitHub Push Authentication* is installed in the primary repository. If `GH_TOKEN` is not injected or the helper cache is empty, stop and escalate instead of attempting unauthenticated pushes.
2. **Resolve the base ref** from project workspace metadata or the issue's `heartbeat-context`. Use the configured `repoRef`, `defaultRef`, or `executionWorkspacePolicy.workspaceStrategy.baseRef` exactly as Paperclip provides it. Never guess from the current shell branch and never rewrite the configured ref. If none is configured, use whatever `origin/HEAD` points at (`main`/`master`/`trunk`/…); fall back to `main` then `master` only if the remote advertises no default HEAD. See `../../docs/git-workflow.md` → *Resolving the default branch*. Never hard-code `main`.
3. **Preserve the managed issue branch:** if Paperclip supplies `executionWorkspace.branchName`, verify `git branch --show-current` matches it, fetch, and rebase onto the configured base as needed. Do not switch or rename branches in a managed worktree. Only in an unmanaged, exclusively held checkout, check out the base and fast-forward with `git pull --ff-only origin <base-branch>`.
4. **Make your changes** on that managed issue branch when supplied, otherwise on the base branch. Push HEAD to the base without switching the managed branch. Do **not** open a GitHub PR unless repository rules require it.
5. **Run the authoritative gate locally — always:** lint, typecheck, the full test suite, and the build. Paste the real command output into the issue. **This local executed verification is the merge gate** when the company has no CI/CD module. Do not commit/push work whose local checks fail.
6. **Commit** using Conventional Commits (`<type>: <description>`), referencing the issue in the body (e.g. `Closes YES-5`). Keep commits focused — one concern each.
7. **Push to the base ref:** `git push origin HEAD:<base-branch>`.
   - If the push is **rejected as non-fast-forward** (someone else pushed), `git pull --rebase origin <base-branch>`, re-run the checks, and push again.
   - If the push is **rejected by branch protection** (e.g. "protected branch hook declined" / a PR is required), use the **PR fallback** below. This is the only case where you open a PR in this flow.
8. **Confirm it landed:** `git log origin/<base-branch> -1` shows your commit.
9. If the issue uses an isolated execution workspace (worktree), leave it reusable after the push. Do not archive/delete it during issue completion; workspace retirement is a separate board/operator action.
10. If required base CI goes red after your push, diagnose and repair it using `../../docs/git-workflow.md` → *Base-branch-red deadlock*. Required repository checks remain binding without the `ci-cd` module; only optional, non-required checks are advisory.

### PR fallback (only when branch protection requires a PR)

If, and only if, a direct push is rejected by branch protection:

1. Retain Paperclip's managed issue branch when supplied. In an unmanaged checkout, create a feature branch from the current HEAD containing your delivery commits; do not reset to a stale base and lose the work from the rejected push.
2. Push it: `git push -u origin <branch-name>`.
3. Open a PR: `gh pr create --base <base-branch> --head <branch-name> --title "<type>: <description>" --body-file <file>` (plain base name; write the body to a temp file — never inline `--body "..."`). Register it as a work product (see below).
4. Confirm it is not conflicting (`gh pr view <N> --json mergeable,mergeStateStatus`; resolve per *Resolving merge conflicts* if `CONFLICTING`/`DIRTY`) and required checks/rules are satisfied, then merge it yourself: `gh pr merge <N> --merge`. Preserve the managed issue branch and workspace. Update the work product to `"status": "merged"`. Obtain any reviewer required by existing repository rules.

Respect the repository's existing rules when choosing this flow; see *Branch Protection Setup*.

## Branch Protection Setup

Configure branch protection once during initial repository setup (part of the "Prepare GitHub repository" foundation issue).

- Inspect and preserve existing branch protection, required checks, and organization rules before configuring anything. Never clear them with null defaults or weaken them to accommodate shared credentials. Existing requirements need eligible credentials or an explicit repository-owner decision.
- **No pr-review module (this flow):** on a new repository, direct pushes may be allowed under company policy. On an existing repository, follow its rules and use the PR fallback when required. Absence of the `ci-cd` module does not disable required checks.
- **With pr-review active:** require a PR before merging, but do **not** require GitHub-native approving reviews — all agents share one GitHub account and cannot formally approve their own PRs (unless the project has distinct non-author reviewer credentials). See `skills/pr-workflow.md`.

Escalate to CEO if `GH_TOKEN` does not have admin rights on the repository.

## When PR Review IS Active

If the pr-review module is active, do NOT use the Direct-to-Base Flow. Use the PR Workflow skill (`skills/pr-workflow.md`): open a PR, set the executionPolicy review stages, and let the Code Reviewer (the non-author merge gate) land the branch. Never push directly to the base ref when a PR review workflow is in place.

## Register the PR as a Work Product

Whenever you open a pull request (the PR fallback, or the pr-review flow), immediately register it as a Paperclip work product so it shows up on the issue and the board. Creating the PR on GitHub alone does **not** make it visible in Paperclip.

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
- If the issue runs in an isolated execution workspace, also pass `"executionWorkspaceId"` from your `heartbeat-context`.
- When the PR later merges or closes, update the work product (`PATCH /api/work-products/{workProductId}`) with `"status": "merged"` or `"closed"`.

## Rules

- Always fetch/pull before starting work to avoid conflicts.
- Keep commits focused — one concern per commit.
- Never force push to the base branch.
- Use the configured base ref. For external repos, push back to the matching remote branch.
- Treat push authentication as repository setup, not as an issue blocker. If `git push` says credentials are missing or invalid, verify the helper and `GH_TOKEN` binding first.
- Reference the issue ID in the commit body (e.g., `Closes YES-5`).
- Never mark an issue as `done` unless at least one new commit was created for that issue's work and has been pushed to the base ref (or merged via the PR fallback).
- Before marking `done`, verify there is no uncommitted work (`git status --short` should be clean) and that `git log origin/<base-branch> -1` shows your commit landed.
- If no repository change is required, do not mark `done` silently: leave an issue comment explaining why and escalate to the CEO.
- **Default to a direct push to the base ref.** Open a PR only when branch protection rejects the direct push (the PR fallback) or when the pr-review module is active. Do not open a PR per change for an unreviewed company — that is where unmerged branches accumulate.
- **Required CI and repository rules remain binding**, regardless of who configured them or whether the `ci-cd` module is selected. Only optional, non-required checks are advisory. Use the complete local verification gate when required CI does not exist.

## Resolving merge conflicts

For a **direct push** rejected as non-fast-forward: `git fetch origin`, `git pull --rebase origin <base-branch>`, resolve each conflict marker, `git rebase --continue`, re-run the full check suite, then push again.

For the **PR fallback** when `gh pr merge` fails or `gh pr view <N> --json mergeable,mergeStateStatus` returns `CONFLICTING` / `DIRTY`:

1. `git fetch origin`
2. `git checkout <branch-name>`
3. `git rebase origin/<base-branch>` (plain base name; strip any `origin/` prefix). Resolve each conflict marker, then `git rebase --continue`.
4. Run the full check suite (lint, typecheck, tests) to confirm nothing broke.
5. `git push --force-with-lease origin <branch-name>` — never `--force`.
6. Verify: `gh pr view <N> --json mergeable` returns `MERGEABLE`.
7. Retry: `gh pr merge <N> --merge`. Preserve a managed issue branch and its workspace after merge.

If a conflict is too complex to resolve safely, leave an issue comment describing the exact conflict and escalate to the CEO before abandoning the branch.
