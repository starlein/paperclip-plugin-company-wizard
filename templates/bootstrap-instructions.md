This is your bootstrap task. Create all the Paperclip objects listed below **in order**.

Each section (Goals, Projects, Labels, Agents, Issues, Routines) contains objects to create via the Paperclip API.

**The endpoints and payload shapes you need are listed in this file and in the `paperclip` skill. Do NOT read or grep the Paperclip server source (e.g. `server/src/routes/*`, `packages/shared/src/validators/*`) to reverse-engineer request schemas — the field names, references, and valid enum values below are authoritative. If a create call is rejected, fix it from the documented enums here, not by inspecting source.**

**How to read the metadata:**

- Direct values like `level: company` or `priority: high` → use as-is in the API call
- References like `parentId: → "Ship MVP"` or `projectId: → "my-app"` → find that object and use its ID
- `assigneeAgentId: → "engineer"` → find the agent with that role and use its ID
- `assigneeUserId: → board user` → assign to the board user (the human who created this company)
- `labelIds: → ["feature"]` → resolve those labels by name first, then attach their IDs
- Dotted fields like `adapterConfig.model`, `runtimeConfig.heartbeat.maxConcurrentRuns`, `metadata.templateRole`, or `workspace.cwd` are nested API payload fields. For example, `workspace.cwd` means `workspace: { cwd: "..." }`.

**Creation order** (respects dependencies):

1. **Goals** — create with `POST /api/companies/{companyId}/goals` using `{ title, description, level, parentId? }`. Top-level first, then sub-goals: sub-goals have `parentId: → "Parent Title"`, so create the parent first and use its ID. Valid `level`: `company`, `team`, `agent`, `task`. Valid `status` (optional, defaults to `planned`): `planned`, `active`, `achieved`, `cancelled`.
2. **Projects** — create with `POST /api/companies/{companyId}/projects` using `{ name, description, goalIds, workspace, executionWorkspacePolicy? }`. Reference goals via `goalIds`; create after all goals exist. Valid project `status` (optional, defaults to `backlog`): `backlog`, `planned`, `in_progress`, `completed`, `cancelled` — **`active` is a goal status, NOT a project status; do not set it on a project.** Create the project workspace as an object, not a raw string. Fresh/new repositories use a local workspace such as `workspace: { sourceType: "local_path", cwd: "...", defaultRef: "main", setupCommand: "git init -b main", isPrimary: true }` with the rendered shared-workspace policy until Git has a valid initial commit. Existing repository-backed projects use the workspace refs exactly as rendered; do not rewrite them to `main`, `master`, or add/remove `origin/`. Send any rendered `executionWorkspacePolicy` unchanged, including its `enabled` value. A saved `sharedWorkspaceConcurrency: "serialize"` is effective only when Paperclip's instance feature and project policy are enabled; heed any bootstrap warning instead of assuming that saved configuration is an active lock. Never inline credentials in repo URLs.
3. **Labels** — if the bootstrap includes an Issues section, create issue labels first (`POST /api/companies/{companyId}/labels` with `{ name, color }`). Colors must be 6-digit hex strings with a leading `#`.
4. **Agents** — hire via governance (`POST /api/companies/{companyId}/agent-hires`) using the listed `adapterType`, nested `adapterConfig`, `runtimeConfig`, `capabilities`, and `metadata`. The Company Wizard already created the CEO for this bootstrap issue; reuse/update any existing agent with the same `metadata.templateRole` instead of creating a duplicate.
5. **Issues** — include the rendered `projectId` for project work, including subtasks; keep deliberately project-detached API-only work detached. Subtasks also include `parentId`. Assign via `assigneeAgentId` or `assigneeUserId`, and attach labels via `labelIds`. When using either `POST /api/issues/{parentId}/children` or `POST /api/companies/{companyId}/issues`, keep parent/project links explicit. Declare workspace intent on repository implementation issues, including subtasks: request `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` when the instance feature, project policy, and initialized repository support it; otherwise follow the rendered project policy and avoid concurrent shared-checkout writes. Reuse another issue's workspace only when the task explicitly requires one shared code change; then send `inheritExecutionWorkspaceFromIssueId` with the source issue's internal id instead of relying on `parentId` inheritance.
6. **Routines** — reference project and agent. Create the routine first, then add a schedule trigger with `POST /api/routines/{routineId}/triggers` using `{ kind: "schedule", cronExpression: schedule, timezone: "UTC" }`.

**Status + subissue guardrails:**

- Parent and subissue status are related by intent, not automatically coupled by tooling.
- Do not auto-mark a parent `done` just because a child changed status.
- Do not auto-reopen a `done` parent/subissue unless you have an explicit reason and record it in a comment.
- Make workspace intent explicit at creation; never rely on implicit inheritance. Repository implementation issues and subissues request `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` only when supported by the effective instance/project configuration and initialized repository. `parentId` expresses task hierarchy, not consent to share a checkout. Reuse is exceptional and explicit via `inheritExecutionWorkspaceFromIssueId` only when the task requires the same code change. Keep project work scoped and API-only routines project-detached.

**Secrets guardrail:**

- Never embed tokens, API keys, banking/SEPA credentials, provider keys, or connection strings in this file, in issue text, or in `adapterConfig`. Provision them as Paperclip company secrets and reference them via `secret_ref` / project `env`. If any secret was pasted in plaintext, rotate it.

**After bootstrap**: keep labels current. When creating new issues in heartbeat cycles, always include explicit `projectId` on every issue, keep subissue parent links explicit, and attach appropriate `labelIds`.
