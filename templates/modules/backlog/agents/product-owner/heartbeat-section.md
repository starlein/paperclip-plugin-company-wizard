## Backlog Health Check

After handling your own assignments:

1. Query unassigned issues: `GET /api/companies/{companyId}/issues?status=todo&unassigned=true`
2. If fewer than 3 unassigned issues remain:
   - Review the company goal and current progress.
   - Identify the next logical chunk of work from the roadmap.
   - Create 3-5 new issues via `POST /api/companies/{companyId}/issues`, making sure each payload includes the correct `projectId`.
   - Each issue needs: `title`, `description`, `priority`, `projectId`, `goalId`, `labelIds`.
   - Use the active roadmap project's `projectId`. Do not leave top-level backlog issues projectless.
   - Fetch labels once per session: `GET /api/companies/{companyId}/labels`. If none exist, create them first (see `backlog-health` skill).
   - Write clear acceptance criteria. Leave issues unassigned.
3. Record what you generated in daily notes.
