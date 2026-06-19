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
2. **Projects** — create with `POST /api/companies/{companyId}/projects` using `{ name, description, goalIds, workspace, executionWorkspacePolicy? }`. Reference goals via `goalIds`; create after all goals exist. Valid project `status` (optional, defaults to `backlog`): `backlog`, `planned`, `in_progress`, `completed`, `cancelled` — **`active` is a goal status, NOT a project status; do not set it on a project.** Create the project workspace as an object, not a raw string. Fresh/new repositories use a local project workspace such as `workspace: { sourceType: "local_path", cwd: "...", defaultRef: "main", setupCommand: "git init -b main", isPrimary: true }` and must initialize Git before work starts; do not attach an `executionWorkspacePolicy` to a fresh local repo (the repo has no base ref yet). Existing repository-backed projects use the workspace refs shown in this bootstrap exactly as rendered; do not rewrite them to `main`, `master`, or add/remove `origin/`. When this bootstrap includes `executionWorkspacePolicy`, send it exactly as rendered; it was included only because Paperclip's experimental isolated-workspaces setting is enabled, and its `workspaceStrategy.baseRef` comes from project/worktree settings. Never inline credentials in repo URLs.
3. **Labels** — if the bootstrap includes an Issues section, create issue labels first (`POST /api/companies/{companyId}/labels` with `{ name, color }`). Colors must be 6-digit hex strings with a leading `#`.
4. **Agents** — hire via governance (`POST /api/companies/{companyId}/agent-hires`) using the listed `adapterType`, nested `adapterConfig`, `runtimeConfig`, `capabilities`, and `metadata`. The Company Wizard already created the CEO for this bootstrap issue; reuse/update any existing agent with the same `metadata.templateRole` instead of creating a duplicate.
5. **Issues** — every issue must include `projectId`, including subtasks. Subtasks must also include `parentId`. Assign via `assigneeAgentId` or `assigneeUserId`, and attach labels via `labelIds`. If you use `POST /api/issues/{parentId}/children`, still pass `projectId` explicitly for clarity; if you use `POST /api/companies/{companyId}/issues`, passing both `parentId` and `projectId` is mandatory for this bootstrap. Set workspace isolation explicitly: **top-level issues** (no `parentId`) must include `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` so each gets its own worktree/branch; **subtasks** set `parentId` and omit `executionWorkspaceSettings` so they reuse the parent's workspace.
6. **Routines** — reference project and agent. Create the routine first, then add a schedule trigger with `POST /api/routines/{routineId}/triggers` using `{ kind: "schedule", cronExpression: schedule, timezone: "UTC" }`.

**Status + subissue guardrails:**

- Parent and subissue status are related by intent, not automatically coupled by tooling.
- Do not auto-mark a parent `done` just because a child changed status.
- Do not auto-reopen a `done` parent/subissue unless you have an explicit reason and record it in a comment.
- Make workspace intent explicit at creation; never rely on implicit inheritance. A top-level issue (no `parentId`) created without `executionWorkspaceSettings` silently adopts the workspace of whatever issue the creator currently has checked out, which serializes work and corrupts branch state. Therefore: top-level issues set `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` (own worktree); subissues set `parentId` and omit `executionWorkspaceSettings` so they deliberately share the parent's workspace (safe because the parent cannot be completed/cleaned up while subissues are open). Keep `projectId` explicit on both.

**Review workflow guardrail:**

- Required PR reviews use the issue's `executionPolicy` review/approval stages, not @-mentions and not separate child review issues. When an engineer opens a PR, set the implementation issue to `in_review` with the resolved execution policy: QA review when present, Security review only for security-relevant changes, Product Owner approval for scope/intent, and a final Code Reviewer merge gate after verification is recorded. **Never list the issue's executor/author as a participant in any stage** — Paperclip excludes the original executor from review/approval, so a stage whose only participant is the author stalls the issue in `in_review` (`422 No eligible approval participant`); the merge gate is therefore a non-author (the Code Reviewer), not the engineer who wrote the code. Each active participant records their decision through the normal issue update route (`approved` by PATCHing toward `done`, `changes_requested` by PATCHing back to `in_progress`), which is the issue-level reviewed/approved audit trail (`reviewed_by` / `approved_by` metadata where Paperclip exposes it). The Code Reviewer merge gate must verify the PR base against the project/worktree base ref shown in `heartbeat-context`, merge before approving, close/archive any isolated worktree when one exists and close-readiness allows it, and only then record final approval. Follow `docs/pr-conventions.md` when the PR review module is active.

**Secrets guardrail:**

- Never embed tokens, API keys, banking/SEPA credentials, provider keys, or connection strings in this file, in issue text, or in `adapterConfig`. Provision them as Paperclip company secrets and reference them via `secret_ref` / project `env`. If any secret was pasted in plaintext, rotate it.

**After bootstrap**: keep labels current. When creating new issues in heartbeat cycles, always include explicit `projectId` on every issue, keep subissue parent links explicit, and attach appropriate `labelIds`.
