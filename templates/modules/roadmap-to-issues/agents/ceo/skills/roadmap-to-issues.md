# Skill: Roadmap to Issues

Add this check to your heartbeat, after handling assignments and before exit.

## Backlog Health Check

1. Query unassigned issues: `GET /api/companies/{companyId}/issues?status=todo&unassigned=true`
2. If fewer than 3 unassigned issues remain:
   - Review the company goal and current progress
   - Identify the next logical chunk of work from the roadmap
   - Create 3-5 new issues via `POST /api/companies/{companyId}/issues`
   - Each issue must have: `title`, `description`, `priority`, `goalId`
   - Leave issues unassigned — assignment happens separately
3. Record what you generated in your daily notes.

## Rules

- Don't create duplicate issues. Check existing issues before creating new ones.
- Keep issues small and actionable. Each should be completable in a single agent session.
- Set priority based on roadmap order and dependencies.
- If the goal is fully decomposed into issues, don't create more. Report to the board instead.
