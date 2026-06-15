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

## Direct-to-Main Workflow

1. Resolve the configured base ref from project workspace metadata or the issue's `heartbeat-context` before touching Git. Do not infer it from the current shell branch and do not rewrite it to `main`, `master`, or `origin/*`.
   - External repos: use the project/worktree `repoRef`, `defaultRef`, or `executionWorkspacePolicy.workspaceStrategy.baseRef` exactly as configured.
   - Fresh/local repos: use the configured local branch.
2. Pull/fetch latest from that base before editing.
3. Make changes
4. Run tests/linting locally if available
5. Commit with conventional commit message
6. Push to the matching configured base branch
7. Verify CI passes (if configured)

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

## CI

If the project has CI configured (e.g., GitHub Actions), always verify your push passes CI. If CI fails, fix it immediately — a broken main blocks everyone.
