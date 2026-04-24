This is your bootstrap task. Create all the Paperclip objects listed below **in order**.

Each section (Goals, Projects, Labels, Agents, Issues, Routines) contains objects to create via the Paperclip API.

**How to read the metadata:**

- Direct values like `level: company` or `priority: high` → use as-is in the API call
- References like `parentId: → "Ship MVP"` or `projectId: → "my-app"` → find that object and use its ID
- `assigneeAgentId: → "engineer"` → find the agent with that role and use its ID
- `assigneeUserId: → board user` → assign to the board user (the human who created this company)
- `labelIds: → ["feature"]` → resolve those labels by name first, then attach their IDs

**Creation order** (respects dependencies):

1. **Goals** — top-level first, then sub-goals. Sub-goals have `parentId: → "Parent Title"` — create the parent first, then use its ID
2. **Projects** — reference goals via `goalIds`. Create after all goals exist
3. **Labels** — if the bootstrap includes an Issues section, create issue labels first (`POST /api/companies/{companyId}/labels` with `{ name, color }`)
4. **Agents** — hire via governance. Set `instructionsFilePath` from the metadata
5. **Issues** — top-level issues must include `projectId`; subtasks must include `parentId` and inherit project scope from the parent unless an explicit override is provided. Assign via `assigneeAgentId` or `assigneeUserId`, and attach labels via `labelIds`
6. **Routines** — reference project and agent. Add a cron trigger with the `schedule` value

**Status + subissue guardrails:**

- Parent and subissue status are related by intent, not automatically coupled by tooling.
- Do not auto-mark a parent `done` just because a child changed status.
- Do not auto-reopen a `done` parent/subissue unless you have an explicit reason and record it in a comment.
- Do not implicitly reuse a parent workspace for subissues; use isolated checkouts/workspaces unless explicit instructions request shared workspace use.

**After bootstrap**: keep labels current. When creating new issues in heartbeat cycles, always include explicit `projectId` on top-level issues, keep subissue parent links explicit, and attach appropriate `labelIds`.
