# Skill: Auto-Assign

Add this check to your heartbeat, after handling your own assignments and before exit.

## Assignment Check

1. Query idle agents: `GET /api/companies/{companyId}/agents?status=idle`
2. Query unassigned todo issues: `GET /api/companies/{companyId}/issues?status=todo&unassigned=true`
3. For each idle agent that matches the issue requirements:
   - Pick the highest-priority unassigned issue
   - Assign it: `PATCH /api/issues/{id}` with `assigneeAgentId`
   - The agent will wake on the assignment trigger
4. Record assignments in your daily notes.

## Rules

- Match issues to agents by role/capabilities. Don't assign code tasks to non-engineering agents.
- Assign one issue at a time per agent. Don't overload.
- If no suitable match exists, leave the issue unassigned and note it.
- Respect agent budget. Don't assign to agents near their budget limit.
