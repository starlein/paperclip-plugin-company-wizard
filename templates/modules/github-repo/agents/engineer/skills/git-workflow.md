# Skill: Git Workflow

You work in a GitHub repository. Follow the conventions in `docs/git-workflow.md` in the project root.

## Direct-to-Main Flow

1. Pull latest: `git pull origin main`
2. Make your changes
3. Run available checks (lint, typecheck, tests)
4. Commit using Conventional Commits: `<type>: <description>`
5. Push to main: `git push origin main`
6. If CI fails, fix immediately

## Rules

- Always pull before starting work to avoid conflicts.
- Keep commits focused — one concern per commit.
- Never force push to main.
- If you encounter merge conflicts, resolve them carefully. When in doubt, escalate to the CEO.
- Reference the issue ID in the commit body (e.g., `Closes YES-5`).
