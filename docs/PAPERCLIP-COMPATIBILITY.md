# Paperclip compatibility — Company Wizard 0.6.1

Reviewed on 2026-09-07 against [Paperclip source `856813ba3a083f23694b8554104b3e50abcb1363`](https://github.com/paperclipai/paperclip/tree/856813ba3a083f23694b8554104b3e50abcb1363), the current master snapshot at review time (2026-09-06).

The plugin does not vendor, modify, or deploy Paperclip itself. Its runtime SDK remains provided by the host.

The published SDK and shared package both require **Node 24.11+**; their worker/manifest bundler targets Node 24. Use that runtime for a supported Paperclip host. A root `engines` gate is intentionally omitted so existing Node 20/22 build/release workflows remain installable under pnpm 10. Those workflows are supplemental compatibility signals, not proof of a supported Paperclip host runtime; migrating them to Node 24 requires workflow-edit authority.

## Tested package contracts

- Stable SDK/shared: `2026.831.1` (pinned development dependencies; peer floor `>=2026.831.1`).
- Latest published canary SDK/shared checked separately: `2026.906.0-canary.5`.
- Validation: TypeScript, production bundle, worker/action tests, assembly/template matrix, and shared-schema payload tests. These are source/contract and mocked integration checks, not a live deployed Paperclip database/browser acceptance test.

### Development-dependency remediation

Outcome: **fixed installed dependency advisories**. The original audit reported 19 advisories (1 critical, 9 high, 7 moderate, 2 low), all in development/build dependencies; production-only audit was already clean. The repository's configured tests use `vitest run` without a UI server, and its build uses PostCSS/esbuild against local files, not their HTTP servers. No deployed-plugin exploit was established.

The narrow fix removes unused `esbuild-postcss-plugin`, updates Vitest within 3.x and PostCSS within 8.x, moves esbuild to patched 0.28.x, and refreshes affected transitive Vite/glob/parser packages. `pnpm-workspace.yaml` limits the esbuild override to Vite and preserves the existing dependency-build allowlist and Paperclip release-age exceptions. No application authentication, approval or runtime control is weakened.

Reproduction substitute: the same full `pnpm audit --json` went from 19 advisories to **zero**; the lockfile contains no reported vulnerable versions or unused plugin chain. This proves dependency removal/update, not a live exploit reproduction. Alternate transitive paths (not only direct dependencies) are included in the audit. `pnpm install --frozen-lockfile`, TypeScript, production build, 72 worker/action tests and 199 logic/API tests pass on Node 24.11.0, preserving normal build and provisioning behavior. The existing tests serve as controls; no artificial exploit fixture was needed for a dependency-version remediation.

API version 1 and declared capability checks remain enabled. There is deliberately no numeric `minimumHostVersion`: this source snapshot's `server/src/index.ts` does not pass `hostVersion` to `createApp`, while `server/src/app.ts` passes `"0.0.0"` to the plugin loader by default. A numeric release floor would reject current source-derived hosts. Older API implementations are not thereby supported; unsupported REST operations surface errors rather than silently downgrading governance.

## Source-aligned behavior

| Area | 0.6.1 behavior | Source contract |
| --- | --- | --- |
| Project policies | Required `enabled`, full schema fields, explicit concurrency defaults; preserve existing IDs, goal links and operator settings | `packages/shared/src/validators/project.ts`; `server/src/routes/projects.ts` |
| Workspace enforcement | Feature-gated; preserve disabled policies and explicit issue/operator overrides | `server/src/services/execution-workspace-policy.ts`; `server/src/services/heartbeat.ts` |
| Hires | Governed `/agent-hires`, explicit selected board approvals; no approval-policy bypass | `server/src/routes/agents.ts`; `server/src/routes/approvals.ts` |
| Bootstrap | Separate issue-bound CEO wake; pending/paused/terminated agents rejected, skipped wakes reported, missing watchdog restored best-effort | `server/src/routes/agents.ts`; `server/src/routes/issues.ts` |
| Company Skills | Metadata, file content and rename use their respective routes; rename reads nested `skill.key`; imported slug collisions are not overwritten | `server/src/routes/company-skills.ts`; `server/src/services/company-skills.ts` |
| Wizard state | Company-scoped SDK `ctx.state`, not nonexistent `/plugins/:id/company-settings/:companyId` | Plugin SDK state contract; `server/src/services/plugin-state-store.ts` |
| Review recovery | Active stage/return assignee, not the currently reassigned reviewer, determines author-only blockage | `server/src/services/issue-execution-policy.ts` |
| Managed worktrees | Preserve assigned branch identity and reusable workspace records; no cleanup shortcut or `--delete-branch` merge | `server/src/services/heartbeat.ts`; `server/src/routes/execution-workspaces.ts` |

### Concurrency is conditional

Storing `sharedWorkspaceConcurrency: "serialize"` is not sufficient by itself. Current source ignores workspace policies/settings when the instance's `enableIsolatedWorkspaces` is disabled. The project policy must also be enabled; explicit per-issue settings win, and project `auto`/`allow` opt-outs are preserved. The shared guard applies to project-bound shared-workspace runs, not arbitrary processes sharing a directory. The wizard never changes the global experimental setting.

Fresh local Git repositories stay shared until bootstrap initializes and seeds them. Existing projects retain their supplied workspace/mode/strategy; no guessed local Git directory replaces them. No Git initialization is generated for remote-managed or non-Git paths.

### Consolidation decisions

- PR #44: retain opt-in lean delivery, skill-update route fixes, exact-head review/CI checks, same-issue advisory handoffs, and template regressions. Standard role-based review remains the default.
- PR #46: retain explicit shared concurrency and approval UI, fixing partial policy rendering, AI field loss, existing-project application, overly broad approvals, and host-floor incompatibility.
- PR #47: adopt advisory PR queue counts throughout roles/modules/preset seeds. Actual dependencies, branch protection, required checks, and explicit company capacity policies are still binding.
- Additional fixes: SDK manifest persistence, existing routine project links, imported-skill collisions, wrong retired-role parent IDs, managed-branch preservation, false stalled-review recovery, and release-pinned template selection.

Official/default templates now come from the installed plugin release. A configured local path remains operator-owned. Custom GitHub sources get URL-specific caches and atomic explicit refresh; a missing custom source never silently becomes official templates. Refresh before preview when intentionally changing a custom source.

## Operator acceptance checklist

1. Install the 0.6.1 package in a current Paperclip host and reload the plugin.
2. Preview an existing company with multiple projects. Check IDs, goal links, workspace paths, policy opt-outs and newly added routine project links.
3. Provision a disposable company with board-gated hires. Confirm only this run's hires appear, approve a subset, refresh, then explicitly start bootstrap after the CEO is approved.
4. Confirm actual shared-run deferral with the instance feature and project policy enabled; confirm disabled/explicit override behavior separately.
5. Exercise one standard review and one opt-in lean review using a managed worktree and required CI. Verify exact-head evidence, review ownership, merge, and preserved workspace identity.

No production company, repository protection, instance setting, or npm release was changed during contract validation.
