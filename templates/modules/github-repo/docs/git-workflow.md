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

1. Pull latest from main
2. Make changes
3. Run tests/linting locally if available
4. Commit with conventional commit message
5. Push to main
6. Verify CI passes (if configured)

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
- If no repository change is required, do not silently close as `done`: add an issue comment explaining why no code change was needed and escalate to the CEO for explicit decision.

## CI

If the project has CI configured (e.g., GitHub Actions), always verify your push passes CI. If CI fails, fix it immediately — a broken main blocks everyone.
