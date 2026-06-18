# Skill: Git Workflow

You work in a GitHub repository. Follow the conventions in `docs/git-workflow.md` in the project root.

## Direct-to-Base-Ref Flow

Use this flow when the **pr-review module is not active** — i.e., there is no Code Reviewer role and no executionPolicy review stages. In this flow, you commit and merge directly; there is no external review gate.

1. Before the first push on a project, confirm the GitHub credential helper from `docs/git-workflow.md` -> *GitHub Push Authentication* is installed in the primary repository. If `GH_TOKEN` is not injected or the helper cache is empty, stop and escalate instead of attempting unauthenticated pushes.
2. Resolve the base ref from project workspace metadata or the issue's `heartbeat-context`. Use the configured `repoRef`, `defaultRef`, or `executionWorkspacePolicy.workspaceStrategy.baseRef` exactly as Paperclip provides it. Never guess from the current shell branch and never rewrite the configured ref to `main`, `master`, or `origin/*`. If no base ref is configured anywhere, use the repository's actual default branch — whatever `origin/HEAD` points at, regardless of name (`main`/`master`/`trunk`/…); fall back to `main` then `master` only if the remote advertises no default HEAD. See `docs/git-workflow.md` → *Resolving the default branch*. Never hard-code `main`.
3. Pull/update latest from that base:
   - external: `git fetch origin`, then integrate from the configured base ref
   - local: update from the configured local branch
4. Make your changes
5. Run available checks (lint, typecheck, tests)
6. Commit using Conventional Commits: `<type>: <description>`
7. Push your branch: `git push -u origin <branch-name>`
8. Merge to base and push:
   - `git checkout <base-ref>` (the same resolved base branch from step 2)
   - `git merge <branch-name> --no-edit`
   - Resolve any conflicts (favor your changes; if uncertain, escalate to the CEO)
   - `git push origin <base-ref>`
9. Clean up the feature branch: `git push origin --delete <branch-name>` (remote) and `git branch -d <branch-name>` (local)
10. If the issue uses an isolated execution workspace (worktree), archive it from your `heartbeat-context` after the merge is pushed.
11. If CI fails on the base branch after the merge, fix immediately.

## When PR Review IS Active

If the pr-review module is active and you have a Code Reviewer role on the team, do NOT use the Direct-to-Base-Ref Flow. Instead, use the PR Workflow skill (`skills/pr-workflow.md`) — open a PR, set executionPolicy review stages, and let the merge gate land the branch. Never merge your own branch when a PR review workflow is in place.

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
- When working without a PR review flow, you are the merge owner. Merge your branch to base promptly after pushing — do not leave branches dangling unmerged.