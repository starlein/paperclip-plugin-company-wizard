# Git Workflow

## Commit Conventions

Use Conventional Commits format for all commit messages:

```
<type>: <short description>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`

Examples:
- `feat: add user authentication endpoint`
- `fix: resolve null pointer in game loop`
- `docs: update README with setup instructions`

Rules:
- Lowercase after colon
- No period at end
- Under 72 characters
- Reference issue ID in commit body when applicable

## Repository Hygiene: ignore `.paperclip/`

Paperclip stores per-issue git worktrees and workspace metadata under a `.paperclip/`
directory inside the repository. This must never be committed.

- When preparing the repository (fresh or existing), make sure `.gitignore` contains a
  `.paperclip/` line. Add it before the first commit; create `.gitignore` if missing.
- If `.paperclip/` was already committed, remove it from tracking with
  `git rm -r --cached .paperclip` and commit the removal.
- Committing `.paperclip/` pollutes history and can nest isolated worktrees inside the
  repo, which causes confusing git state for every agent.

## GitHub Push Authentication

Paperclip injects the project secret `GH_TOKEN` into agent runs when the project env maps
`GH_TOKEN` to the secret. Git does not use that variable automatically, and some sandboxed
push subprocesses can drop environment variables exactly when Git asks its credential
helper for credentials. Every GitHub-backed project must install a repository-local
credential helper during foundation setup before the first push.

Run this from the primary project workspace, never from inside an issue worktree:

```bash
git_common_dir="$(git rev-parse --git-common-dir)"
helper="$git_common_dir/paperclip-gh-credential-helper.sh"
cache="$git_common_dir/paperclip-gh-token-cache"

cat > "$helper" <<'EOF'
#!/bin/sh
cache="$(dirname "$0")/paperclip-gh-token-cache"
if [ -n "$GH_TOKEN" ]; then
  ( umask 077; printf '%s' "$GH_TOKEN" > "$cache" ) 2>/dev/null
fi
if [ "$1" = "get" ]; then
  token="$GH_TOKEN"
  [ -z "$token" ] && [ -r "$cache" ] && token="$(cat "$cache" 2>/dev/null)"
  [ -n "$token" ] && printf 'username=x-access-token\npassword=%s\n' "$token"
fi
exit 0
EOF

chmod 700 "$helper"
[ -n "$GH_TOKEN" ] && ( umask 077; printf '%s' "$GH_TOKEN" > "$cache" )
chmod 600 "$cache" 2>/dev/null || true
git config --local credential.helper "$helper"
```

Rules:
- Do not print, commit, or paste the token. The helper cache lives under Git's private
  common directory, not in the worktree.
- If `GH_TOKEN` is empty during setup, stop and ask the CEO/board to bind a writable
  GitHub token as the project secret before continuing.
- Re-run the setup after rotating the secret; the cache refreshes whenever `GH_TOKEN`
  is present in a later agent run.
- Verify the helper without exposing the token: `git config --local --get credential.helper`
  should print the helper path, and `test -s "$(git rev-parse --git-common-dir)/paperclip-gh-token-cache"`
  should succeed after a run where `GH_TOKEN` was injected.

## PR Self-Merge Flow

Use this flow when the **pr-review module is not active** (no Code Reviewer role, no executionPolicy review stages). You open a PR and merge it yourself — there is no external review gate, but all changes go through a PR so branch history is preserved and branch protection is respected. When PR review is active, use the PR workflow from `docs/pr-conventions.md` instead.

1. Resolve the configured base ref from project workspace metadata or the issue's `heartbeat-context` before touching Git. Do not infer it from the current shell branch and do not rewrite it to `main`, `master`, or `origin/*`.
   - External repos: use the project/worktree `repoRef`, `defaultRef`, or `executionWorkspacePolicy.workspaceStrategy.baseRef` exactly as configured.
   - Fresh/local repos: use the configured local branch.
   - Only if no base ref is configured anywhere, detect the repository's default branch — see *Resolving the default branch* below. Never hard-code `main`.
2. Pull/fetch latest from that base before editing.
3. **Create a feature branch** from the base ref: `git checkout -b <branch-name> <base-ref>`. Never commit directly on the base branch. The branch name should reference the issue (e.g., `LEA-5-add-landing-hero`). If you are already on a correctly named feature branch, skip this step.
4. **Verify you are on the feature branch** before making changes: `git branch --show-current` must print `<branch-name>`, not the base ref. If it prints the base ref name, you forgot step 3 — create the branch now.
5. Make changes
6. Run tests/linting locally if available
7. Commit with conventional commit message
8. **Verify the current branch one more time**, then push: `git push -u origin <branch-name>`. The branch name in the push command must match `git branch --show-current`. Never push the base ref as a feature branch — if `git branch --show-current` returns the base ref name, stop and create a feature branch first.
9. Open a pull request against the base ref: write the PR body to a temp file, then `gh pr create --base <github-base-branch> --head <branch-name> --title "<type>: <description>" --body-file <file>`. Never inline `--body "..."` — a double-quoted shell string keeps `\n` literal (see *Posting PR Bodies & Comments* in `docs/pr-conventions.md`). Verify the PR base matches the configured base ref before merging.
10. Merge the PR yourself: `gh pr merge <PR-number> --merge`. Do not wait for a reviewer if none is present. Confirm the PR is closed and the base branch updated before continuing. Never do a direct `git merge` + push to the base branch; always go through a PR.
11. Clean up the feature branch: `git push origin --delete <branch-name>` (remote) and `git branch -d <branch-name>` (local).
12. If the issue uses an isolated execution workspace (worktree), archive it from `heartbeat-context` after the merge is pushed.
13. Verify CI passes on the base branch (if configured). If CI fails, fix immediately.

## Resolving the default branch

A configured base ref (`repoRef` / `defaultRef` / `workspaceStrategy.baseRef`) always wins — use it verbatim. Only when **none** is configured (typically at first-time setup of an existing repository) detect the default branch from the remote, and record it on the project workspace so later isolated worktrees branch from the right base.

The base ref for worktrees should simply **be the repository's default branch, whatever it is named** — `main`, `master`, `trunk`, `develop`, anything. The authoritative source is what `origin/HEAD` points at. Resolution priority:

1. **The remote's default branch** — whatever `origin/HEAD` resolves to. This is name-agnostic and is the answer in almost all cases.
2. **`main`, then `master`** — only as a fallback when the remote advertises no default HEAD (rare/ambiguous).

```bash
# Prints the repository's default branch name (origin/HEAD; main/master only as fallback).
git remote set-head origin --auto >/dev/null 2>&1 || true
def=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
[ -z "$def" ] && def=$(git ls-remote --symref origin HEAD 2>/dev/null | sed -n 's@^ref: refs/heads/\(.*\)\tHEAD@\1@p')
if [ -z "$def" ]; then
  if   git ls-remote --exit-code --heads origin main   >/dev/null 2>&1; then def=main
  elif git ls-remote --exit-code --heads origin master >/dev/null 2>&1; then def=master
  fi
fi
echo "$def"
```

For a brand-new local repository there is no remote yet, so initialize on `main` (`git init -b main`) — that is the conventional default for fresh repos.

## What Requires a Commit

- Code logic changes
- Configuration changes
- Feature additions
- Bug fixes
- Documentation updates
- Infrastructure changes

## Issue Completion Guardrails

- Never mark an issue as `done` unless at least one new commit exists for that issue's work and has been pushed.
- Before marking `done`, ensure the working tree is clean (`git status --short` shows no pending changes).
- If Paperclip created an isolated execution workspace for this issue, close/archive it after the commit/PR has landed and before marking `done`. If cleanup is blocked or fails, leave the issue open with the exact cleanup blocker. If the issue is in the shared project workspace, do not invent isolated-worktree cleanup.
- If no repository change is required, do not silently close as `done`: add an issue comment explaining why no code change was needed and escalate to the CEO for explicit decision.

## Branch Safety

- **Always work on a feature branch, never on the base branch.** Create the branch with `git checkout -b <branch-name> <base-ref>` before committing any changes. If you are resuming work on an existing issue, `git branch --show-current` should already show the feature branch name.
- **Verify your branch before pushing.** Before running `git push -u origin <branch-name>`, confirm that `git branch --show-current` prints the feature branch name — not the base ref. If it prints the base ref, you are on the wrong branch: stop and create/switch to the feature branch first. Pushing the base ref as a feature branch corrupts upstream tracking and causes incorrect branch divergence reports.

## CI

If the project has CI configured (e.g., GitHub Actions), always verify your push passes CI. If CI fails, fix it immediately — a broken base ref blocks everyone.
