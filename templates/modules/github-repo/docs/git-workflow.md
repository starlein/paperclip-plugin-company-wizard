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
