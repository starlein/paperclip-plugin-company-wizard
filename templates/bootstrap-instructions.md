This is your bootstrap task. Create all the Paperclip objects listed below **in order**.

Each section (Goals, Projects, Labels, Agents, Issues, Routines) contains objects to create via the Paperclip API.

**How to read the metadata:**

- Direct values like `level: company` or `priority: high` → use as-is in the API call
- References like `parentId: → "Ship MVP"` or `projectId: → "my-app"` → find that object and use its ID
- `assigneeAgentId: → "engineer"` → find the agent with that role and use its ID
- `assigneeUserId: → board user` → assign to the board user (the human who created this company)
- `labelIds: → ["feature"]` → resolve those labels by name first, then attach their IDs
- Dotted fields like `adapterConfig.model`, `runtimeConfig.heartbeat.maxConcurrentRuns`, `metadata.templateRole`, or `workspace.cwd` are nested API payload fields. For example, `workspace.cwd` means `workspace: { cwd: "..." }`.

**Creation order** (respects dependencies):

1. **Goals** — top-level first, then sub-goals. Sub-goals have `parentId: → "Parent Title"` — create the parent first, then use its ID
2. **Projects** — reference goals via `goalIds`. Create after all goals exist. For Paperclip v2026.403.0, create the project workspace as an object, not as a raw string. Fresh/new repositories use a local project workspace such as `workspace: { sourceType: "local_path", cwd: "...", defaultRef: "main", setupCommand: "git init -b main", isPrimary: true }` and must initialize Git before work starts. Existing repository-backed projects use `workspace: { sourceType: "git_repo", repoUrl: "...", repoRef: "origin/main", defaultRef: "origin/main", isPrimary: true }` and may include `executionWorkspacePolicy` for isolated worktrees. Never inline credentials in repo URLs.
3. **Labels** — if the bootstrap includes an Issues section, create issue labels first (`POST /api/companies/{companyId}/labels` with `{ name, color }`). Colors must be 6-digit hex strings with a leading `#`.
4. **Agents** — hire via governance (`POST /api/companies/{companyId}/agent-hires`) using the listed `adapterType`, nested `adapterConfig`, `runtimeConfig`, `capabilities`, and `metadata`. The Company Wizard already created the CEO for this bootstrap issue; reuse/update any existing agent with the same `metadata.templateRole` instead of creating a duplicate.
5. **Issues** — every issue must include `projectId`, including subtasks. Subtasks must also include `parentId`. Assign via `assigneeAgentId` or `assigneeUserId`, and attach labels via `labelIds`. If you use `POST /api/issues/{parentId}/children`, still pass `projectId` explicitly for clarity; if you use `POST /api/companies/{companyId}/issues`, passing both `parentId` and `projectId` is mandatory for this bootstrap.
6. **Routines** — reference project and agent. Create the routine first, then add a schedule trigger with `POST /api/routines/{routineId}/triggers` using `{ kind: "schedule", cronExpression: schedule, timezone: "UTC" }`.

**Status + subissue guardrails:**

- Parent and subissue status are related by intent, not automatically coupled by tooling.
- Do not auto-mark a parent `done` just because a child changed status.
- Do not auto-reopen a `done` parent/subissue unless you have an explicit reason and record it in a comment.
- Do not implicitly reuse a parent workspace for subissues; keep `projectId` explicit and use isolated checkouts/workspaces unless explicit instructions request shared workspace use.

**Review workflow guardrail:**

- Required PR reviews are tracked as explicit assigned child issues, not @-mentions. When an engineer opens a PR, set the implementation issue to `in_review` and create review child issues assigned to Code Reviewer and Product Owner, plus Security/QA/UI/DevOps child issues when that domain is materially affected. Reviewers close only their own child issue; the engineer owns merge and parent closure. Follow `docs/pr-conventions.md` when the PR review module is active.

**Secrets guardrail:**

- Never embed tokens, API keys, banking/SEPA credentials, provider keys, or connection strings in this file, in issue text, or in `adapterConfig`. Provision them as Paperclip company secrets and reference them via `secret_ref` / project `env`. If any secret was pasted in plaintext, rotate it.

**After bootstrap**: keep labels current. When creating new issues in heartbeat cycles, always include explicit `projectId` on every issue, keep subissue parent links explicit, and attach appropriate `labelIds`.
