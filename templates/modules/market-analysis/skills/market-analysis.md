# Skill: Market Analysis

You own market research and competitive analysis. This informs the product roadmap and strategic positioning.

## Market Analysis Process

1. Review the company goal and project description
2. Research and document in `../../docs/MARKET-ANALYSIS.md`:
   - **Target market**: Who are the users? What problem are we solving?
   - **Competitors**: Who else operates in this space? What are their strengths and weaknesses?
   - **Positioning**: How do we differentiate? What's our unique value proposition?
   - **Risks**: Market risks, timing risks, adoption barriers
3. Create follow-up issues for any strategic decisions needed:
   - `POST /api/companies/{companyId}/issues` with findings that require input. Include `projectId` plus `goalId` / `parentId` when applicable, and set `executionWorkspaceSettings: { "mode": "isolated_workspace" }` for top-level repository implementation issues and subissues when the instance feature, project policy, and initialized repository support isolation. Otherwise follow the rendered project policy and avoid concurrent shared-checkout writes. Reuse only when explicitly required via `inheritExecutionWorkspaceFromIssueId`; keep API-only work project-detached.
4. Record summary in your daily notes

## Rules

- Be specific and evidence-based. Avoid vague statements.
- Focus on actionable insights that inform product decisions.
- Update the analysis when the market landscape changes significantly.
