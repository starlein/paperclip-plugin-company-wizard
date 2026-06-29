# Changelog

All notable changes to the Company Wizard plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.16] - 2026-06-28

### Changed

**Agents and projects use external paths under `companies/<Company>/…` with relative instruction references**

Agents were provisioned with a **managed** instructions bundle (materialized by the host under `companies/<companyId>/agents/<agentId>/instructions/`), and the assembled instruction files hard-coded **absolute** `$AGENT_HOME/...` paths that pointed at the human-readable `companies/<CompanyName>/agents/<role>/` dir — a mismatch that made references fragile and unportable.

- **External instructions bundle (all agents, incl. CEO):** provisioning now points each agent at its assembled on-disk dir via `updateInstructionsBundle({ mode: 'external', rootPath: '…/companies/<Company>/agents/<role>', entryFile: 'AGENTS.md' })`. That call also sets `adapterConfig.instructionsFilePath`, which every local adapter (codex/claude/acpx) loads — instructing the model to *"resolve relative file references from the instructions directory"*. Existing managed agents are migrated to external on the next update.
- **Relative references** in assembled files: `$AGENT_HOME/HEARTBEAT.md` → `HEARTBEAT.md`, `$AGENT_HOME/skills/<x>.md` → `skills/<x>.md`. Bare `$AGENT_HOME` prose (the runtime home env var) is left intact. The old absolute-path rewrite is removed; no managed-bundle file upload happens anymore.
- **Company doc references unified to `../../docs/<y>.md`** across every agent-facing file (AGENTS.md, HEARTBEAT, skills, the shipped docs themselves like `git-workflow.md`/`pr-conventions.md`, heartbeat-sections, bootstrap-instructions, and module/preset issue descriptions) — 170+ refs. This path is **cwd-independent**: both the instructions dir (`agents/<role>/`) and the execution cwd (the project workspace `projects/<name>/`) sit at depth 2 under the company dir, so `../../docs/` resolves to `companies/<Company>/docs/` from either. A bare `docs/<y>.md` would have broken once the agent runs in a project workspace.
- **Project workspaces** are realized under `companies/<Company>/projects/<Project>` for external (`git_repo`) projects too — the repo is cloned into that dir via `workspace.cwd` instead of a separate host-managed clone path (local projects already used this path).

> Deploy + "Update templates" + update-company to migrate a live company's agents from managed to external instructions.

## [0.4.15] - 2026-06-28

### Fixed

**Template-cache refresh now hits the dir the worker reads (Docker) — fixes "fixed but never deployed"**

`refresh-templates` (the "Update templates" button) always deleted/re-downloaded `~/.paperclip/plugin-templates`, but on Docker instances the worker reads `~/plugin-templates` (`isDockerLayout()`). So refreshing never updated the dir the worker actually assembles from, and shipped template fixes (e.g. the v0.4.7 Code-Reviewer merge-ownership fix) silently never reached agents. A shared `resolveTemplatesCacheDir`/`refreshTemplatesCache` helper now targets the same Docker-aware dir, and `start-provision` refreshes the cache from the repo before assembling (best-effort; `params.refreshTemplates: false` opts out) so an update always provisions the latest published instructions.

### Changed

**CI/CD is a merge gate only when the company owns it (`ci-cd` module)**

The merge gate enforced "CI must be green" whenever the repo had any CI checks — so a pre-existing/external CI on an imported repo (broken or flaky, never configured by the company) deadlocked the merge queue. Now the **authoritative gate is the merge-gate agent's executed local lint/test/build** (run it, paste the output); a green CI is required *in addition* only when the `ci-cd` module is active (the company runs its own pipeline). Without a CI/CD module, pre-existing repo checks are advisory — never block a merge solely on a check the company never set up. Reworded across `pr-conventions.md`, `code-review.md`, `qa-review.md`, the Code-Reviewer `AGENTS.md`, and the engineer `git-workflow.md`.

**Without the pr-review module, the engineer works direct-to-base instead of opening a PR**

The no-pr-review fallback was a "PR Self-Merge Flow" that still opened a PR per change — the source of the orphan/draft/conflict PR pile-up. With no reviewer, that PR adds no value, so the engineer now commits and pushes **directly to the base ref** after local verification, and opens a PR *only* as a fallback when branch protection rejects the direct push. Rewrote `github-repo` `git-workflow.md` (skill + `docs/git-workflow.md`) to the Direct-to-Base Flow, updated Branch-Protection guidance (do not require PRs for an unreviewed company), and scoped the engineer `HEARTBEAT.md` review-path rule to "pr-review active". The PR workflow remains gated to the `pr-review` module only.

## [0.4.14] - 2026-06-25

### Fixed

**Stranded-blocked merge issues — a CEO-routine safety net (templates)**

> The longstanding, CI-independent root cause of "agents open PRs but never merge them" was a **contradiction in the Code Reviewer's instructions** — the role's `AGENTS.md` said "Never merge PRs. That's the engineer's job." while its skill (and the engineer's pr-workflow) made the Code Reviewer the merge owner, so nobody merged. That was already fixed in **v0.4.7** (commit `3e065cf`); instances still piling up PRs are running pre-v0.4.7 instruction bundles and need a template-cache refresh + update-company to pick up the corrected instructions. This v0.4.14 entry addresses a **secondary, downstream** failure, not that root cause.

Observed on two live instances (LeadConversionOptimizer, Dial24Modern2): because the normal merge never fired, the CEO fanned a single PR out into separate per-role issues (QA/Security/Product) plus a standalone "Code review and merge PR #N" issue assigned to the Code Reviewer and `blockedBy` those reviews. When the reviews close `done`, Paperclip does not reliably re-wake the blocked merge issue (worker heartbeats are disabled, and the liveness watchdog skips a `blocked` issue whose blockers are all `done`), so even those explicit merge issues strand. Evidence: merge issues sitting `blocked` with `blockerAttention.needs_attention` and zero unresolved blockers.

Template fixes:

- `stall-detection.md` (CEO skill): new `## Stranded blocked` recovery — detect a `blocked` issue whose blockers are all `done`/`cancelled` (or `blockerAttention` with `unresolvedBlockerCount: 0`), flag `STRANDED-BLOCKED`, reactivate via `PATCH {"status":"in_progress"}`, re-assign to the merge owner to trigger a wake, and run the merge. Step 4's skip-rule now treats "blocked with all blockers done" as a stall, not validly blocked. PR-queue hygiene gains a step 7 that reconciles each open green/mergeable PR against its owning issue and merges/reactivates when the merge step was skipped.
- `bootstrap-instructions.md` + `pr-review/README.md`: explicit prohibition — one PR ⇒ one issue ⇒ its `executionPolicy` stages. Never fan a PR out into per-role `blocks`-linked issues, and never model the merge as a standalone `blockedBy` merge issue; the merge gate is the last stage on the same implementation issue, which advances in place.

> Note: the durable platform-level guarantee (auto-reactivate a `blocked` issue once it has no unresolved blockers, and/or a workspace-finalize-barrier timeout) lives in the Paperclip server, not this plugin. These template changes prevent the fan-out and add a CEO-routine safety net that recovers already-stranded merges.

## [0.4.13] - 2026-06-25

### Changed

**Worker agents default to `auto` thinking effort, and per-role adapter levels now reach provisioning**

Provisioned worker (non-CEO) agents were pinned to `thinkingLevel`/`modelReasoningEffort: "medium"`, and the `"thinkingLevel": "auto"` declared in each `role.meta.json` was silently dropped at provisioning time — the `roleAdapterOverrides` passed to `buildWorkerAdapterConfig` were assembled only from **module** `adapterOverrides`, never from the role's own `adapter` block. So every worker ran at a flat `medium` regardless of its template.

- `DEFAULT_WORKER_THINKING_LEVEL` changed from `medium` to `auto` — let the model pick effort per task instead of pinning a flat level. The CEO default is unchanged (`high`, still inherits the wizard's explicit setting).
- `assembleCompany` now seeds `roleAdapterOverrides` from each role's `role.meta.json` adapter (`thinkingLevel` / `modelReasoningEffort` / `reasoningEffort` / `effort`), so a role's declared level reaches the provisioned agent. Module `adapterOverrides` still merge on top (module wins).
- `buildAdapterConfig` now also resolves an override expressed as `effort`, and strips the raw thinking keys before re-applying the resolved level per adapter — so a non-codex adapter no longer carries a stray `thinkingLevel`.

## [0.4.12] - 2026-06-25

### Changed

**"Update existing company" path: pick from a list, stop re-asking for untouched settings**

The update flow asked the user to paste a company UUID, then showed a Review page with contradictory placeholders (`Company: (unnamed)`, `Goal: (no goal)`, `Repository: Create a new Git repository`) for fields that an update never changes — and on authenticated instances it failed after Review with `Authentication failed (429): Too many requests` plus a misleading "Configure paperclipEmail/paperclipPassword" hint, even though credentials were set.

- **Company picker instead of a UUID field** — `StepExistingCompany` now loads the instance's companies via a new `list-companies` worker action (`GET /api/companies`) and renders them as a selectable list. Selecting one carries the real company **name** forward, so the Review page and assembled workspace use it instead of `(unnamed)`. A manual-ID entry remains as a fallback (and is offered automatically if the list can't be loaded).
- **Review page trimmed for updates** — in the update path, `ConfigReview` hides the **Goal**, **Repository**, and **Target** rows and shows the company name read-only. These belong to the existing company and stay untouched; the update only re-syncs instructions, docs, modules, roles, and routines.

### Fixed

**429 "Too many requests" after Review on authenticated instances**

Each worker action built its own `PaperclipClient` and performed a fresh Better Auth sign-in. A single wizard run fires several actions back-to-back (`check-auth`, `preview-files`, `preview-company-update`, `start-provision` — the last signing in twice), so the burst tripped the sign-in rate limiter. A new in-process `connectSharedClient` caches the resolved session cookie + board identity (keyed by URL+email, 5-minute TTL) and validates reuse with a cheap `GET` (`ping`) instead of another sign-in. Sign-ins now happen only on first connect or after the session expires. This also removes the misleading "Configure paperclipEmail/paperclipPassword" banner that `isConfigError` raised because the 429 message contained "authenticat".

## [0.4.11] - 2026-06-23

### Fixed

**Author-only first executionPolicy stage — a stall the v0.4.10 misrouted-`in_review` detection missed**

v0.4.10 caught `in_review` with `executionPolicy: null` (or no non-author stage at all). It did **not** catch `in_review` whose policy *has* non-author stages later, but whose **first/current stage lists only the assignee (author) as a participant**. Paperclip excludes the executor from every stage, so that first stage has no eligible participant and the issue stalls at stage 1 (`422 Only the active reviewer or approver can advance the current execution stage`) — even though later stages look fine. Observed on LeadConversionOptimizer (LEAA-79/76): engineering tasks were misassigned to QA, QA authored the work, moved to `in_review`, and the first review stage was set to QA itself (self-review) → permanent stall the old scan skipped as "pending review".

Four template files close the gap:

- `stall-detection.md` (CEO skill): step 4 skip-rule tightened — "genuinely pending review" now requires the **current (first unapproved) stage** to have a non-author participant. New `## Author-only first stage` section: detect via `GET /api/issues/{id}` (the list endpoint omits `executionPolicy`), inspect `stages[0].participants` vs `assigneeAgentId`; flag `AUTHOR-ONLY-STAGE`; recover with `PATCH {"executionPolicy":null}` (returns the issue to `in_progress` — a bare `{"status":"in_progress"}` is rejected with `422` while a policy is active), then reassign to the correct owner with a non-author first stage or self-merge.
- `roles/engineer/HEARTBEAT.md` step 5: after moving to `in_review`, `GET` the issue and confirm `stages[0].participants` is not just you; if it is, null the policy and re-set with a non-author first stage. Generalizes "executor" → "assignee/executor (whoever did the work)".
- `roles/qa/HEARTBEAT.md`: new guard — QA is a **reviewer, not an author**. Implementation tasks assigned to QA are a misassignment: flag and reassign to the engineer instead of authoring + self-reviewing. Never set an `executionPolicy` stage whose only participant is the assignee; self-recovery via `PATCH {"executionPolicy":null}`.
- `pr-review/docs/pr-conventions.md` step 3: the "never list the executor as a stage participant" rule generalized from "the engineer who authored the work" to "the issue's assignee/executor (engineer, QA, or any role)", with explicit first-stage-author-only stall warning + null-policy recovery; non-engineer roles must not author implementation work and then self-review it.

## [0.4.10] - 2026-06-22

### Fixed

**Root-cause fix: base-branch-red deadlock, misrouted `in_review`, and missing PR-queue hygiene**

Investigates the LeadConversionOptimizer pile-up (LEAA-89, 18 open PRs) where `origin/main` CI was red, every PR inherited the red baseline and failed CI in 1-3 seconds at setup, and "never merge without green CI" deadlocked the entire queue. Three independent root causes fixed:

**A — Base-branch-red deadlock (7 files)**
- `docs/git-workflow.md`: new `## Base-branch-red deadlock` section — agents now detect whether a PR's CI failure is *inherited* (same check failing on the base commit itself) or *introduced* by the PR's diff, using `gh api repos/{owner}/{repo}/commits/<base-sha>/check-runs` for comparison. If the base is red, the situation is classified `BASE-BRANCH-RED` and the baseline-emergency protocol triggers instead.
- `docs/git-workflow.md`: new `## Baseline-emergency protocol` — pause new feature PRs, claim the restore with a comment so concurrent detectors do not open duplicate restore PRs, create a single `fix(ci): restore base CI` PR, fast-track it through merge under the narrow exception, re-verify the base commit's checks, then rebase and drain the feature-PR queue. If the failing check cannot be reproduced locally (missing secrets / runner-only state), escalate to the board/human rather than stalling.
- `docs/git-workflow.md`: new `## Narrow exception: merging the baseline-restore PR on a red base` — the baseline-restore PR (and only that PR) may merge with red CI when: diff is scoped to the base failure fix; the exact failing checks pass locally (paste real output); remaining failing checks exactly match the inherited baseline set (not introduced by the diff). Replaces CI-green with local-executed-verification + diff-scope proof; never waives the verification gate; never applies to feature PRs.
- `git-workflow.md` skill (engineer): step 11 adds a pre-merge CI check (`gh pr checks <N>`) and triggers base-red detection before merging; step 12 adds the Self-Merge baseline-restore exception for the engineer; step 15 routes post-merge base-red to the protocol; new rule in `## Rules` prohibits opening new feature PRs on a red base.
- `pr-workflow.md` skill (engineer): new `## Base-branch-red deadlock` section — in PR-Gate mode (Code Reviewer present) the engineer comments `BASE-BRANCH-RED` and starts the baseline-restore PR immediately, without waiting for the Code Reviewer's `changes_requested` route-back; in Self-Merge mode the engineer cannot merge a feature PR on a red base but may merge the baseline-restore PR under the narrow exception. The engineer **cannot** record `changes_requested` in PR-Gate mode (author excluded by runtime — 422); this is now explicitly stated in all relevant paths including the merge-conflict closing rule.
- `code-review.md` (Code Reviewer): hard-gate bullet added after the "cited executed verification" rule — base-red detection + `changes_requested` citing `BASE-BRANCH-RED` for feature PRs; baseline-restore exception for the `fix(ci)` PR with scoped diff + local verification. The existing "Never merge without green CI" rule (§ Rules) is **modified** (not just appended) to carry the same exception caveat.
- `pr-conventions.md` (shared doc): the `## Merge Rules` "With CI: must be green, cannot be skipped" bullet is **modified** to add the baseline-restore exception caveat — without this the doc injected into the Code Reviewer contradicted the new exception and would re-deadlock.

**B — Misrouted `in_review` with `executionPolicy: null` (3 files)**
- `engineer/HEARTBEAT.md` step 5: replaced "move to `in_review`" with an explicit guard — verify a review path exists (Code Reviewer present → set `executionPolicy` stages before moving; no Code Reviewer → self-merge path, never `in_review`); recover already-stuck null-policy issues by moving back to `in_progress` and then choosing the right path.
- `pr-workflow.md` skill: new `## Misrouted in_review (null executionPolicy)` recovery section — move to `in_progress`, set `executionPolicy` stages (Code Reviewer present) or self-merge the PR (no Code Reviewer); leave a comment naming the misroute.
- `stall-detection.md` step 4: updated to no longer skip `in_review` + `executionPolicy: null` as "pending review" — this is now explicitly identified as a misrouted stall, not a pending approval.

**C — PR-queue hygiene: no monitoring (1 file)**
- `stall-detection.md`: new `## Misrouted in_review` section — detects `in_review` + null policy during the regular scan (before the summary step), flags as `MISROUTED-REVIEW`, assigns back to the engineer with the recovery action.
- `stall-detection.md`: new `## PR-queue hygiene` section — every stall-detection routine run (when the `github-repo` module is active) scans the repository's open PR queue via `gh pr list`. Escalates a triage issue when 3+ PRs are UNSTABLE/DIRTY or 8+ PRs are open total. Runs base-branch-red detection first: if the base is red, the triage issue names `BASE-BRANCH-RED` and instructs the baseline-emergency protocol; if the base is green, lists each UNSTABLE/DIRTY PR with its owner and next action (rebase / fix the introduced failure). First detector claims the restore PR by comment to prevent duplicate opens.

---

## [0.4.9] - 2026-06-22

### Fixed

**Roles — structural gaps in secondary and C-suite roles**
- `devops`, `cto`, `cmo`, `ux-researcher` AGENTS.md: added Working Rules, Collaboration and Handoffs, and Done Bar sections (previously used a thin "Core Principles"-only pattern with no actionable workflow guidance).
- `code-reviewer` HEARTBEAT.md step 5: replaced generic "move to in_review" with the correct role-specific flow — merge the PR, archive worktree, record `approved`; or on rejection set `in_progress` and reassign to engineer.
- `qa` HEARTBEAT.md step 5: replaced generic step with pass → mark done / fail → reassign to engineer with reproduction steps.
- `code-reviewer` AGENTS.md: added rejection flow in step 8; removed duplicate procedure paragraph from `## Principles`.
- `security-engineer` AGENTS.md: added missing `## Safety Considerations` section.
- `product-owner` SOUL.md: renamed section heading and added product ownership bullets.
- `technical-writer` AGENTS.md step 7: clarified that executionPolicy overrides the direct self-close.
- HEARTBEAT.md title casing fixed: CEO, CTO, CMO, QA Engineer, UI Designer, UX Researcher, DevOps.

**Operational modules — heartbeat-scan anti-pattern, bar/skill mismatches, missing fallbacks**
- `dependency-management` and `release-management`: converted heartbeat-scan "Ongoing" sections to routine-triggered procedures; added `routines[]` to both `module.meta.json` files.
- `release-management`: added CEO fallback skill scoped to documentation only — explicitly forbids `git push --tags`, `gh release create`, and version bumps.
- `ci-cd` shared skill: added SHA pinning rule, rollback documentation step, and `## Ongoing Health Checks` section for recurring routine runs.
- `monitoring` shared skill: added dashboard setup step and runbook requirement rule.
- `ci-cd` engineer fallback: marked output as provisional; added explicit `docs/CI-CD.md` reference.
- `monitoring` engineer fallback: "liveness probe" → "liveness and readiness probes".
- `triage` CEO fallback: `gh issue list` now uses full `--json` form; added `executionWorkspaceSettings` note.
- `codebase-onboarding` CEO fallback: added "Health Check Refresh" section for follow-up runs.

**Product/design modules — critical missing files, duplicate issues, bar gaps**
- `architecture-plan`: added missing shared `skills/design-system.md` — without it, an engineer acting as primary was silently installed with no design-system skill.
- `architecture-plan`: added CEO-specific `agents/ceo/skills/architecture-plan.bar.md` with reduced done bar (the shared bar set engineer-level requirements the CEO fallback cannot meet).
- `architecture-plan` ui-designer contribution skill: added guard clause — wait for `docs/ARCHITECTURE.md` before contributing the UI layer.
- `architecture-plan` ui-designer design-system skill: added conditional `docs/BRAND-IDENTITY.md` reference.
- `website-relaunch` module.meta.json: removed 3 duplicate issues (each appeared twice; would have provisioned duplicate board items).
- `competitive-intel`: added missing `agents/product-owner/skills/competitive-tracking.fallback.md`.
- Added new bar files: `competitive-intel/skills/competitive-tracking.bar.md`, `documentation/skills/project-docs.bar.md`, `game-design/skills/game-design.bar.md`.
- `market-analysis` template: added `## User Segments` section.
- `brand-identity` CEO fallback: fixed inconsistent role name ("designer or PO" → "ui-designer or CMO").
- `brand-identity` primary skill: added explicit file path for template reference.

---

## [0.4.8] - 2026-06-22

### Fixed

- **Merge conflicts no longer leave PRs dangling forever.** When `gh pr merge` fails due to a merge conflict, or `gh pr view` reports `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY`, agents previously had no concrete instructions and left the PR in `in_review` indefinitely. All three relevant skills now include an explicit *Resolving merge conflicts* section: `git fetch && git rebase origin/<base-ref>`, resolve conflict markers, `git push --force-with-lease`, verify `mergeable: MERGEABLE`, retry `gh pr merge`. (`git-workflow.md` skill, `pr-workflow.md` skill, `docs/git-workflow.md`.)
- **Code Reviewer checks for conflicts before attempting to merge.** The merge gate now runs `gh pr view <number> --json mergeable,mergeStateStatus` before calling `gh pr merge`. If the PR is conflicting or dirty, it immediately records `changes_requested` with a comment routing the issue back to the engineer to rebase — instead of attempting the merge and silently leaving the issue stranded. (`code-review.md`.)
- **PR Self-Merge flow also guards against dirty merges.** The engineer's self-merge path now checks mergeability before `gh pr merge` and follows the same rebase procedure when conflicting. (`pr-workflow.md`, `git-workflow.md` skill.)
- **Never leave a conflicting PR without an explicit action.** All skills now state: either resolve the conflict and retry, or leave an issue comment with the exact blocker and (for complex conflicts) escalate to the CEO — do not silently abandon the branch.

---

## [0.4.7] - 2026-06-22

### Fixed

- **Stall-safe PR merge workflow rules (`executionPolicy` + roles).** Fixes the long-standing defect where companies without a Code Reviewer would create endless branches without ever merging them into the base ref, or open PRs that never got merged. Two modes, chosen automatically from the roles present:
  - **PR-Gate mode** (Code Reviewer present): Paperclip-native gate flow via `executionPolicy` — QA (review, when present) → Security Engineer (review, only on security-relevant changes) → Product Owner (approval, when present) → **Code Reviewer as the non-author merge gate** (last stage, merges via `gh pr merge <N> --merge` and only then records `approved`, which closes the issue).
  - **PR-Self-Merge mode** (no Code Reviewer): no `executionPolicy` stages — the engineer opens the PR and merges it themselves via `gh pr merge <N> --merge`. Other review roles leave advisory PR comments but do not block.
- **`resolveReviewGate` no longer renders an `executionPolicy` sketch without a merge gate (CRITICAL).** Previously, for `engineer + product-owner` (no Code Reviewer), a gate with an approver (PO) but no merge gate was rendered — the PO approval would then auto-close the issue to `done` while the PR was still open on GitHub. Now `null` is returned whenever no non-author merge gate is resolvable (self-merge path). (`src/logic/assemble.js`, `resolveReviewGate`.)
- **The merge gate can never be the issue executor (guard).** `resolveReviewGate` discards a `mergeGate` that equals the issue's `assignTo` (the executor/author). Because Paperclip excludes the original executor from every stage, a self-stage would stall forever with `422 No eligible approval participant`. The guard prevents this — including for hand-edited presets or future modules. (`src/logic/assemble.js`.)
- **No more role fallback for the merge gate.** Previously, when the Code Reviewer was absent, another role (DevOps, QA, …) was substituted as a static gate stage — rendering an `executionPolicy` sketch the engineer is explicitly told never to set. Now the rule is consistent: no Code Reviewer → self-merge, no substitution. (`src/logic/assemble.js`.)
- **Product Owner stage is consistently tied to presence.** The PO approval stage was marked as "always" in four files (skill, conventions, module meta, BOOTSTRAP guardrail) while QA/Security were already conditional. With `pr-review + code-reviewer` but no PO, this produced a stage with no eligible participant → 422. The PO stage now reads "when present" / "when one is on the team" everywhere. (`pr-workflow.md`, `pr-conventions.md`, `module.meta.json`, `assemble.js` guardrail.)
- **Domain reviewers (UI/UX/DevOps) are consistently advisory.** Previously the skills ("Record your verdict … approved/changes_requested" = blocking stage) contradicted `pr-conventions.md` ("advisory, never gate"). Domain reviewers now post advisory PR comments only and escalate blockers to QA/Security/merge gate — they are never a stage themselves. `infra-review` routes security blockers to the Security Engineer stage instead of blocking directly. (`design-review.md`, `ux-review.md`, `infra-review.md`, `pr-workflow.md`, `pr-conventions.md`.)
- **`code-reviewer` AGENTS.md is self-consistent.** "Post your review as advisory" + "Your review does not gate the merge" contradicted the merge-gate principle (Principles + `code-review.md`). Line 18 now separates the GitHub comment (advisory — no GitHub-native approval because all agents share one account) from the `executionPolicy` stage (the real gate). Step 8 branches: in pr-review mode the Code Reviewer merges via `gh pr merge` and records `approved`; otherwise it leaves an advisory comment only. (`templates/roles/code-reviewer/AGENTS.md`.)
- **Product Owner review skill is role-correct.** "Final approver / last gate before merge" was wrong — the PO is the product sign-off *before* the Code Reviewer merge gate, not the final stage. The PO is also not a merge owner (in self-merge mode the engineer merges). (`product-review.md`.)
- **`docs/git-workflow.md` uses PR self-merge instead of `git merge`+push.** The "Direct-to-Base-Ref Workflow" used `git checkout base → git merge → git push`, which the skill forbids and branch protection (same module) would reject. Replaced with a "PR Self-Merge Flow" using `gh pr create` + `gh pr merge <N> --merge`. (`templates/modules/github-repo/docs/git-workflow.md`.)
- **Branch protection with `enforce_admins: true`.** Previously `enforce_admins: false` let the shared admin account bypass the PR requirement with a direct push to the base ref — exactly what the protection is meant to prevent. With `required_approving_review_count: 0` the admin can still open a PR and merge it with zero approvals (self-merge stays functional); only the direct-push bypass is closed. Added the "distinct non-author GitHub reviewer credentials" qualifier and a note on `restrictions: null`. (`preset.meta.json`, `git-workflow.md` skill.)
- **Work-product POST includes the `Authorization` header.** `pr-workflow.md` documented the POST without `Authorization: Bearer $PAPERCLIP_API_KEY`; in authenticated deployments this yielded 401. Header added, matching the `git-workflow.md` skill. (`pr-workflow.md`.)
- **`worker.ts` typecheck errors fixed.** Seven `Cannot find name` errors occurred because `allRoleNames`, `existingManifest`, `existingByTemplateRole`, and `routines` were declared inside the `try` block but referenced after the `try`/`catch` in the manifest-save and governance-cleanup blocks. The declarations were hoisted before the `try` block; `tsc --noEmit` now passes cleanly. (`src/worker.ts`.)

### Changed

- **README/docs: the merge gate is the Code Reviewer, not the engineer.** The PR-review description in `README.md` had the roles inverted ("merge gate owned by the Engineer") — exactly the 422-stall bug. Corrected to Code Reviewer (non-author) as the merge gate, engineer as the executor (never a stage participant), domain reviewers advisory, and a self-merge path when no Code Reviewer is present. (`README.md`.)

### Tests

- Replaced/augmented static JSON-only tests with behavioral `assembleCompany` calls: no `executionPolicy` sketch + installed self-merge skill when no Code Reviewer is present (C1); guard prevents executor-as-mergeGate (I16); PO stage is omitted when no Product Owner is present (M8); ordered stages QA → PO → Code Reviewer (M9). (`assemble.test.js`, `assemble.integration.test.js`.)

---

## [0.4.6] - 2026-06-18

### Changed

- **Docker path auto-detection for companiesDir and templatesPath.** The plugin now detects Docker vs. NPX installations automatically: if `~/instances` exists (Docker, where HOME=/paperclip), paths default to `~/instances/default/companies` and `~/plugin-templates`; otherwise (NPX/local), paths default to `~/.paperclip/instances/default/companies` and `~/.paperclip/plugin-templates`. Both settings are now rarely needed — the plugin picks the right layout automatically. (`src/worker.ts`, `isDockerLayout()`, `resolveWritableCompaniesDir`, `ensureTemplatesDir`.)
- **Removed `disableBoardApprovalOnNewCompanies` setting.** This setting was never used in practice — board approval governance is always preserved for new companies. The setting has been removed from the manifest and the worker no longer reads or applies it. (`src/manifest.ts`, `src/worker.ts`.)
- **Direct assignment flow — backlog grooming assigns issues at creation, not via routine sweep.** The backlog-health skill now instructs the PM to assign each issue to its best-fit agent as it is created. The auto-assign routine is reframed as a low-frequency safety net (every 4 hours) that catches stragglers, not the primary dispatch path. (`backlog` module, `auto-assign` module.)
- **Engineer hands off to Product Owner on completion (without pr-review).** When the PR-review module is not active and no `executionPolicy` is set, the engineer moves the issue to `in_review` and reassigns to the Product Owner in the same heartbeat. Never leaves finished work in `in_review` assigned to itself. (`engineer` AGENTS.md, HEARTBEAT.md.)
- **Product Owner reviews `in_review` issues immediately.** When an issue is assigned to the PM in `in_review` and no formal executionPolicy participant is waiting, the PM reviews it against acceptance criteria and sets it `done` or sends it back to the engineer. (`product-owner` AGENTS.md, HEARTBEAT.md.)
- **Engineer merges feature branches to base when no PR review is active.** The `github-repo` git-workflow skill now has an explicit direct-to-base-ref flow: push branch → checkout base → merge → push base → delete branch. (`github-repo` module.)
- **Git identity uses real user profile instead of "Paperclip Bootstrap".** The initial empty commit in fresh repositories now uses the board user's name and email (resolved from the Paperclip session) instead of the hardcoded "Paperclip Bootstrap / bootstrap@paperclip.local". Falls back to "Paperclip Bootstrap" when no session is available (local_trusted mode). (`src/api/client.js`, `src/worker.ts`, `src/logic/assemble.js`.)
- **Engineer claims unassigned engineering work as a fallback.** When no actionable work is assigned and unassigned `todo` issues clearly match engineering, the engineer claims the highest-priority ready issue. (`engineer` AGENTS.md.)
- **Manifest setting descriptions updated.** `companiesDir` and `templatesPath` now document auto-detection behavior. `templatesRepoUrl` now notes that the default is correct for most setups. (`src/manifest.ts`.)

### Fixed

- **Branches no longer dangle unmerged without a PR review module.** The git-workflow skill previously instructed engineers to "push to the correct configured base branch" but did not explain how to merge a feature branch back to base. Without a PR review module, branches were pushed but never merged, leaving `main` stale and the team stuck. The skill now includes explicit merge-and-push steps for the no-review case.
- **Auto-assign README and heartbeat-section schedule wording.** "Every few hours" was replaced with the actual cron schedule "every 4 hours" to match the `0 */4 * * *` routine. (`auto-assign` module.)
- **github-repo README now matches the actual direct-to-base-ref skill.** The README previously said "commits directly on the default branch, no branches" but the skill uses a feature branch + merge-to-base flow. (`github-repo` README.)

### Removed

- `disableBoardApprovalOnNewCompanies` plugin setting. Board approval governance is always preserved for new companies — this toggle was never used in practice.

---

## [0.4.5] - 2026-06-16

### Fixed

- **Fresh local project workspaces are initialized before provisioning.** Git-worktree companies now get an on-disk project repository during setup instead of letting Paperclip fall back to agent workspace directories when the project path does not exist yet.

### Changed

- **The plugin-update notice is compact and scoped to the onboarding page.** It was a large amber banner shown on every wizard step; it is now a small one-line notice (`current → latest`, npm link) rendered only on the onboarding (plugin entry) page next to the template update action, explicitly labeled "Company Wizard plugin". (`WizardShell.tsx`, `StepOnboarding.tsx`.)

---
## [0.4.4] - 2026-06-16

### Fixed

- **PR-review issues no longer stall in `in_review`.** The prescribed `executionPolicy` made the engineer (the issue's author) the final merge-gate participant, but Paperclip's runtime excludes the original executor from every review/approval stage — so a stage whose only participant was the author had no eligible participant and the issue stalled forever (`422 No eligible approval participant is configured for this issue`). The merge gate is now the **Code Reviewer** (a non-author who verifies, merges, and records the closing approval), with an assembly fallback to another present non-author role. All review/approval templates and the BOOTSTRAP guardrail now forbid listing the issue's executor/author as a stage participant. (`pr-review` module, `src/logic/assemble.js` reviewGate + bootstrap guardrail, `pr-workflow.md`, `code-review.md`, `pr-conventions.md`, `bootstrap-instructions.md`.)

### Changed

- **The Code Reviewer is now the binding merge gate** (previously advisory/non-blocking). It satisfies the hard verification gate (green CI, or runs the tests/build and pastes the output), merges the PR into the correct base, cleans up any isolated worktree, and only then records the final approval that closes the issue. The engineer no longer adds themselves as a merge-gate stage.
- **Default-branch resolution is name-agnostic.** When no base ref is configured for an existing repository, the worktree base ref is the repository's actual default branch — whatever `origin/HEAD` points at (`main`/`master`/`trunk`/…) — falling back to `main` then `master` only when the remote advertises no default HEAD. The detected branch is recorded on the project workspace so isolated worktrees branch from the correct base. (`github-repo` foundation issue, `docs/git-workflow.md`, engineer git/PR skills.)
- **Terminology: "default branch" / "base ref" instead of hardcoded "main".** Reworded agent-facing instructions across the ci-cd skills, `github-repo`/`pr-review` docs and READMEs, `launch-mvp`, the `fast`/`repo-maintenance` presets, and the engineer SOUL so they no longer treat `main` as the universal default-branch name. Protective guards ("never rewrite the configured ref to `main`/`master`/`origin/*`") and the fresh-repo `git init -b main` default are unchanged.
### Removed

- `scripts/patch-active-company.mjs` — the v0.4.3 one-off maintenance script is no longer tracked.

---
## [0.4.3] - 2026-06-16

### Fixed

- **Worker agents are no longer provisioned with `high` thinking.** Non-CEO agents were built with `buildCeoAdapterConfig`, which defaulted `thinkingLevel`/`modelReasoningEffort` to the CEO default (`high`) for every role — expensive and unnecessary for routine work. A new `buildWorkerAdapterConfig` (with `DEFAULT_WORKER_THINKING_LEVEL = 'medium'`) builds worker adapter config: workers default to `medium`, do not inherit a user-configured CEO thinking level, and a role can still raise its level via its `role.meta.json` adapter override. The CEO is unchanged (`high`).
- **Board Operations and Hiring Plan issues are no longer orphaned.** They are created before the CEO exists, so they could not be assigned at creation time. `start-provision` now assigns both governance issues to the CEO right after the CEO agent is available (best-effort), so they are actionable instead of unassigned.

### Changed

- **The Hiring Plan issue is now a review checkpoint, not a re-hiring task.** `buildHiringPlanBody` was rewritten to state explicitly that the initial team was already submitted as governed `/agent-hires` (pending approval where the board requires it, never auto-approved) and to give the CEO concrete tasks: review each provisioned agent against the `paperclip-create-agent` draft-review checklist, approve/reject the pending hires, and only hire for genuine remaining gaps. This makes the `disableBoardApprovalOnNewCompanies` setting meaningful: left `false`, the wizard's hires land as pending approvals the CEO works through this issue.

### Added

- `scripts/patch-active-company.mjs` — idempotent maintenance script that patches an already-provisioned company in place to the current defaults: sets worker agents to `medium` thinking and assigns the Board Operations / Hiring Plan issues to the CEO. Supports `--dry-run` and `--thinking=<level>`.

---
## [0.4.2] - 2026-06-15

### Fixed

- **Existing-company provisioning no longer fails while creating governance records.** Board Operations and Hiring Plan are now created as unassigned `todo` issues because Paperclip rejects unassigned `in_progress` issues.

---
## [0.4.1] - 2026-06-15

### Changed

- **Hiring now uses Paperclip governance by default.** `PaperclipClient.createAgent()` submits directly through `POST /api/companies/{id}/agent-hires`, preserves `sourceIssueId` / `sourceIssueIds`, returns pending approval ids, and no longer auto-approves board-gated hires.
- **Provisioning now creates Board Operations and Hiring Plan records.** `start-provision` creates standing issues with `decision-log` and `hiring-plan` documents before submitting agent hires, then links CEO/team hire requests to those provenance issues.
- **Agent and routine templates now follow the current Paperclip workflow.** Role heartbeats use `inbox-lite`, `heartbeat-context`, `in_review`, `executionPolicy`, `blockedByIssueIds`, evidence, and work products. Auto-assign, backlog-health, triage, codebase-audit, and stall-detection skills are scoped to assigned routine/task issues instead of every-heartbeat scans.
- **PR review bootstrap guidance now uses native issue execution stages.** The bootstrap instructions no longer direct agents to create child review issues or generic mention handoffs. Review/approval participants record their decisions through the normal issue update route so Paperclip keeps the issue-level review/approval audit trail.
- **Goal prompts are now outcome-first.** AI and manual goal guidance tells the wizard to keep the main goal focused on the product/outcome and treat secondary constraints as quality bars or acceptance criteria unless the user explicitly made one of them the primary project.
- **Git/PR workflow guidance now preserves configured base refs and workspace cleanup.** External repository refs are taken from project/worktree settings and are no longer rewritten to `main`, `master`, or `origin/*`. Merge-gate guidance now requires merging before final approval and closing/archiving isolated worktrees before marking work done.
- **Persona enrichment is now always applied when templates provide fragments.** The plugin no longer exposes `enableEnrichedPersonas`; `LENSES.md`, `DONE.md`, and skill `.bar.md` fragments are injected automatically and never emitted as standalone files.

### Fixed

- **Routine project pre-creation now preserves execution workspace policy.** When routines force the worker to pre-create the main project, the project receives the same resolved `executionWorkspacePolicy` that BOOTSTRAP.md shows, including the configured base ref when isolated workspaces are enabled.
- **External repository setup no longer invents a default ref.** The optional ref field can stay blank so Paperclip/project settings resolve the default branch instead of the wizard silently writing `main`.

### Added

- `putIssueDocument()` API helper for `PUT /api/issues/{issueId}/documents/{key}`.
- Plugin update check action and UI notice when npm has a newer Company Wizard version.
- Regression coverage for governed `/agent-hires`, issue documents, current heartbeat templates, hiring-review guardrails, executionPolicy PR review bootstrap output, persona enrichment defaults, and configured base-ref preservation.

---
## [0.3.24] - 2026-06-15

### Changed

- **PR review is now substantive instead of ceremonial.** The `pr-review` module previously gated merges on a `code-reviewer` reading a diff and recording a verdict — effectively self-approval, since all agents share one model and one GitHub account. The merge gate is now **executed verification**: when the `ci-cd` module is active, CI (lint/test/build) must be green before the Engineer merges; otherwise the Engineer must run the test suite/build and paste the real output into the merge-gate verdict. The hard gate sits on the Engineer's final merge-gate stage and holds regardless of which reviewers are present.
- **QA is the substantive review stage; the Code Reviewer is advisory.** The `pr-review` `reviewGate` reviewers changed from `["code-reviewer"]` to `["qa"]`. QA's skill (`qa-review.md`) was rewritten with two explicit modes (CI present vs. no CI) and a hard evidence requirement — a verdict that does not cite executed verification is invalid. The Code Reviewer's skill (`code-review.md`) and base role files (`roles/code-reviewer/AGENTS.md`, `HEARTBEAT.md`) were reframed as advisory, non-blocking; they no longer instruct GitHub-native `gh pr review --approve`/`--request-changes` (which cannot work with a shared GitHub account) and now post advisory feedback via `gh pr comment --body-file`.
- **`renderReviewGate` / BOOTSTRAP guardrail are CI-aware.** The generated `executionPolicy` sketch and the BOOTSTRAP PR-review guardrail now render the CI-green precondition (or the run-the-tests-and-paste-output fallback) on the merge-gate stage, plus an evidence-required note that rejects "looks good" verdicts (`assemble.js`).

### Added

- **PR-scoped security review.** `security-engineer` is now in `pr-review`'s `activatesWithRoles`, and a new skill `templates/modules/pr-review/agents/security-engineer/skills/pr-security-review.md` reviews a specific PR's diff for security-relevant changes (auth, secrets, input boundaries, crypto, dependencies, infra exposure). The stage is conditional — the Engineer adds it only when the change is security-relevant. Named `pr-security-review.md` (not `security-review.md`) to avoid clobbering the `security-audit` module's capability skill of the same name. `pr-conventions.md` (Review Workflow, Review Roles, Merge Rules) was rewritten to match the new model.

## [0.3.23] - 2026-06-10

### Changed

- **`CHANGELOG.md` and `CONTRIBUTING.md` are now included in the published npm package** (added to the `files` allowlist). Previously only `dist/`, `templates/`, plus the npm defaults (`README.md`, `LICENSE`, `package.json`) shipped, so the changelog and contributor guide were missing from the tarball.

## [0.3.22] - 2026-06-10

### Fixed

- **Wizard-created routines are now linked to the main project.** The wizard creates routines with board authority at provisioning time, but it created them without a `projectId`. Projects are created later by the CEO during bootstrap, and the CEO can only edit routines assigned to itself — so routines owned by other agents (e.g. the Product Owner) stayed project-less forever. The worker now pre-creates the main project before the routines and passes its id to every `createRoutine`; `BOOTSTRAP.md` marks the main project as already created (gated on there being routines) so the CEO links goals/issues to it instead of recreating it. Best-effort — if project creation fails, routines are still created (project-less) rather than blocking provisioning. (`worker.ts`, `assemble.js`.)
- **PR bodies and review comments now render as Markdown.** Agents posted GitHub PR bodies and review comments with inline `gh pr … --body "<inline>"`. A double-quoted shell argument does not turn `\n` into a real newline, so multi-line Markdown rendered on GitHub as literal `text\ntext\ntext`. All PR-review guidance (engineer `pr-workflow`, the six reviewer skills, the `code-reviewer` role, and `pr-conventions.md`) now writes the Markdown to a file and uses `--body-file`, with a verdict-heading comment template (`## ✅ Approved` / `## 🔄 Changes requested`).

## [0.3.21] - 2026-06-10

### Added

- **Deferred-isolation guidance for fresh local repos.** When the instance has isolated worktrees enabled but a project starts as a fresh local repository, the isolated `executionWorkspacePolicy` is (correctly) omitted at provisioning — worktrees need an existing base ref and would fail on the first run. Previously this left the operator thinking the setting did nothing, so they flipped it by hand mid-run and stranded early work in the shared workspace. The project's BOOTSTRAP block now renders an explicit note: as the final step of "Prepare GitHub repository", once the initial commit is on `main`, switch the project to isolated worktrees (Project settings → isolated workspaces, or set `executionWorkspacePolicy` to `isolated_workspace`/`git_worktree` with `baseRef: main`). Rendered by `renderDeferredIsolationNote` in `assemble.js`; only appears when isolation is enabled and the repo is fresh-local.

### Fixed

- **PR merge gate — approved PRs now actually get merged.** The `pr-review` execution-policy chain previously ended with the **Product Owner**'s `approval` stage. Because clearing the final stage auto-closes the issue to `done`, the Product Owner (not the engineer) was the last actor, so the engineer was never woken to merge — approved, mergeable PRs stayed open on GitHub while their issues showed `done`. The chain now ends with a final `approval` stage owned by the **Engineer** (the merge gate): the engineer is woken last, merges the PR, then records the verdict that closes the issue. Adds a `mergeGate` field to the `pr-review` `reviewGate`, renders the merge-gate stage in the BOOTSTRAP `executionPolicy` sketch (`resolveReviewGate`/`renderReviewGate` in `assemble.js`), and updates the engineer `pr-workflow` skill, `pr-conventions.md`, and the bootstrap PR-review guardrail.
- **Repository setup now ignores `.paperclip/`.** The `Prepare GitHub repository` foundation issue and `docs/git-workflow.md` now instruct adding a `.paperclip/` entry to `.gitignore` before the first commit (creating `.gitignore` if missing). Paperclip keeps per-issue git worktrees and workspace metadata under `.paperclip/` inside the repo; without the ignore, that transient state can be committed and isolated worktrees can nest inside the repo, producing confusing git state for every agent.

## [0.3.20] - 2026-06-09

### Added

- **Opt-in agent persona enrichment** (`enableEnrichedPersonas` plugin setting, default `false`). When enabled, assembly appends enrichment fragments into generated agent files; the lean baseline is unchanged when off.
  - **Domain lenses** (`roles/<role>/LENSES.md` → `SOUL.md`) — named mental models an agent cites in comments. Lens-heavy: `security-engineer` (STRIDE, OWASP Web/API/LLM, least privilege, blast radius…), `ux-researcher` (Nielsen's 10, Jakob's/Hick's/Fitts's Law, Kano, JTBD…), `ui-designer` (Gestalt, visual hierarchy, design tokens…). Focused: `product-owner` (RICE/ICE, MoSCoW, WSJF…), `code-reviewer` (correctness-first, blast radius, smallest-diff…), `devops` (error budgets, MTTR, rollback-first…). Operational roles (`engineer`, `qa`) intentionally have none.
  - **Output/review bars** (`modules/<module>/skills/<skill>.bar.md` → primary skill) — concrete "what good/finished work looks like" with negative examples, across 14 module skills (tech-stack, architecture-plan, design-system, api-design, codebase-audit, user-testing, accessibility-audit, threat-model, security-review, market-analysis, brand-identity, backlog-health, ci-cd, monitoring).
  - **Done-criteria** (`roles/<role>/DONE.md` → `HEARTBEAT.md`) — explicit "verify before done" + "always comment before exiting a heartbeat" rule, for all 8 enriched roles.
- Enrichment fragments are filtered from every copy path (`isEnrichmentFragment`) so they never ship as standalone files; injection mirrors the existing module heartbeat-section pattern and is threaded `manifest.ts → worker.ts → assembleCompany`.

## [0.3.19] - 2026-06-09

### Changed

- **Rebranded all leftover "Clipper" references to "Company Wizard"** — AI wizard prompts (`interview-system.md`, `single-shot-system.md` in both `templates/ai-wizard/` and `src/ui/prompts/`), module doc footers (`_Generated by Company Wizard._`), the `template-check-use-case` command, CONTRIBUTING clone instructions, and internal identifiers (`company-wizard-preview-` temp dir, `.company-wizard-plugin-root` CSS class, `sync-plugin.sh` `PLUGIN_DIR`, the `resolveRole` parameter, and the plugin test suite name).
- **Authorship and license updated** — copyright assigned to Sascha Pietrowski; Yesterday AI credited in `LICENSE`, `package.json` contributors, and the README fork note for the original `@yesterday-ai/paperclip-plugin-company-wizard` (template system, assembly logic, API client).

### Fixed

- **README role documentation corrected** — only the CEO is a base role (the "How It Works" assembly step no longer claims Engineer is base); the Software Engineer role was added to the roles table and details (now 16 optional roles, matching `CLAUDE.md`/`AGENTS.md` and the template library); the orphaned CFO role-detail block was removed.
- **`pnpm-workspace.yaml` supply-chain excludes corrected** — `minimumReleaseAgeExclude` referenced non-existent `@starlein/*` packages instead of the real `@paperclipai/plugin-sdk` and `@paperclipai/shared` dependencies.

### Added

- **README "Why Company Wizard?" highlights** — a concise feature summary near the top of the README.
- **ROADMAP refreshed** — post-fork plugin-migration work moved to Done; new backlog items for re-provisioning, dry-run preview, per-role model tuning, and a routine pattern library.

### Removed

- Stale `docs/superpowers/` planning artifacts (pr-review-execution-policy plan + spec, already merged).

## [0.3.18] - 2026-06-09

### Fixed

- **Removed optional provisioning telemetry support.**
- **Repository bootstrap wording for existing repos is now accurate** — the github-repo foundation task is now `Prepare GitHub repository` and explicitly distinguishes fresh-repository setup from verification of an existing repository state.
- **Isolated-worktree execution policy now normalizes `baseRef` consistently** (`main` → `origin/main`) and keeps local fresh repository setups on shared workspaces until the repo exists.

## [0.3.15] - 2026-06-08

### Fixed

- **PR review bootstrap issue is now a foundation task.** `Set up Paperclip PR review workflow` is explicitly marked as `bootstrapPhase: "foundation"` so it no longer gets scheduled after generic module tasks in the backlog.
- **Regression coverage added for bootstrap issue ordering.** Added an integration assertion so PR review setup remains ahead of backlog work when both setup tasks are present.

## [0.3.14] - 2026-06-08

### Fixed

- **Review-step repository edits now fully replace source mode metadata.** The summary/review editor now writes a canonical `workspaceSourceType` (`git_repo` or `local_path`) alongside `workspace`, preventing stale legacy `workspaceSourceType` values from blocking mode switches between new and existing repos.

## [0.3.13] - 2026-06-08

### Fixed

- **Review-step repository editing now stays in sync.** The summary/review repository editor now handles legacy `workspaceSourceType` values consistently, so editing fresh-vs-existing repository settings in the Review step keeps the rendered preview aligned and always uses the selected mode during provisioning.

---
## [0.3.12] - 2026-06-08

### Changed

- **Workspace isolation is now read from Paperclip instance settings** — the plugin no longer exposes an `enableIsolatedWorktrees` plugin option. `executionWorkspacePolicy` for `git_repo` projects now follows `enableIsolatedWorkspaces` from Paperclip instance experimental settings (`/api/instance/settings/experimental`). Fresh local repos continue to skip isolated worktrees during bootstrap.

---
## [0.3.11] - 2026-06-08

### Fixed

- **CEO bootstrap no longer reverse-engineers the Paperclip API from server source.** During bootstrap the CEO was reading/grepping `server/src/routes/*` and `packages/shared/src/validators/*` to recover exact create-payload schemas, because BOOTSTRAP.md listed *what* to create but not the create endpoints or valid enum values for goals and projects. The first create pass then failed on a project status enum (`active` is a goal status, not a project status). `templates/bootstrap-instructions.md` now documents the `POST /api/companies/{companyId}/goals` and `…/projects` endpoints, the valid `level`/`status` enums for goals and projects (explicitly noting `active` is goal-only), and instructs the agent not to inspect server source to recover schemas. Also reiterates that fresh local repos must not attach an `executionWorkspacePolicy`.

### Changed

- **Repository setting on the review/summary step is now an obvious clickable control.** Previously the only way to edit it was a hover-only pencil icon shared by every row, which was hard to discover. The repository value is now a button with a visible "Change" / "Change — use an existing repository" affordance that opens the inline new-vs-existing editor (both manual and AI paths).

---
## [0.3.10] - 2026-06-08

### Fixed

- **Fresh local repositories no longer bootstrap with isolated git worktrees.** The wizard was provisioning `executionWorkspacePolicy: { defaultMode: "isolated_workspace", workspaceStrategy: { type: "git_worktree", baseRef: "main" } }` on brand-new `local_path` projects. Worker agents then tried to create a worktree off `main` before the repo (and its base ref) existed, so every early run failed and agents flipped to `error`. The isolated policy is now suppressed for fresh local repos — agents work in the shared project workspace during bootstrap — while existing external repos (`sourceType: "git_repo"`) keep the isolated `git_worktree` policy. Guarded centrally in `assemble.js` (so both manual and AI-generated configs are covered) and removed at the source in `StepRepository` and the AI wizard prompts (`messages.json`, `single-shot-system.md`).
- **Spurious React "unique key" warnings in the plugin UI.** The UI bundle was compiled against the production JSX runtime (`react/jsx-runtime`), but the Paperclip host loads a development build of react-dom, which then warned about missing keys for every component returning multiple static children (`PathCard`, `StepOnboarding`, `ConfigReview`). The UI now builds with the development JSX runtime (`jsxDEV`) by default so elements carry the static-children flag; published packages still use the production runtime via `pnpm build:prod` / `prepublishOnly`.

### Added

- **Inline repository editor on the review/summary step** (`ConfigReview`). The Repository row is now editable in both the manual and AI paths: toggle between "New repository" (initial branch) and "Existing repository" (repo URL + default ref). Selecting an existing repository opens a URL field and applies the external-repo workspace + isolated `git_worktree` policy; switching back to a new repository clears it.

### Changed

- **Repository setup logic extracted to `src/ui/lib/repository.ts`** (`repositoryProjectFields`, `getRepositoryMode`, `getRepositoryRef`, `getRepositoryUrl`, `normalizeNewRepoBranch`) and shared by `StepRepository` and the new inline editor, so the new-vs-external workspace + execution-policy rules stay consistent across both entry points.

---
## [0.3.9] - 2026-06-08

### Changed

- **PR reviews now use the issue's native `executionPolicy` instead of separate child review issues.** The Engineer sets an ordered stage chain on the originating issue — a `review` stage for the Code Reviewer, optional `review` stages for relevant domain reviewers (UI/UX/QA/DevOps), and a final `approval` stage for the Product Owner — and merges once all stages clear. Reviewer skills record `approved` / `changes_requested` on their stage (the verdict-submit path is agent-runtime logic, so the skills stay mechanism-neutral). This surfaces reviewer/approver in the native UI and removes 2–6 review issues per PR. Touches the `pr-review` engineer + six reviewer skills, `pr-conventions.md`, the module metadata, and the BOOTSTRAP guardrail.

### Added

- **`reviewGate` field on declared module/preset issues** (`{ reviewers: [...], approver: "..." }`). Assembly resolves the roles present in the team (dropping absent ones) and renders an ordered executionPolicy sketch into BOOTSTRAP.md; the CEO resolves roles → agentIds when creating the issue. `client.createIssue` already forwards `executionPolicy`, so no client change was needed. The `pr-review` setup issue ships a `reviewGate` as the first real example.

---
## [0.3.8] - 2026-06-08

### Changed

- **`anthropicApiKey` and `paperclipPassword` plugin settings are now plain string fields** instead of `secret-ref`. The Paperclip host rejects saving any `secret-ref` field until company-scoped plugin config ships (error: "Plugin secret references are disabled until company-scoped plugin config lands"), which blocked saving the plugin settings entirely. `resolveAnthropicApiKey` now uses a directly entered key (`sk-ant-...`) as-is and only falls back to host secret resolution for legacy installs that still store a secret reference. Trade-off: the Anthropic key is now stored in plain plugin config until the host secret store is available.

---
## [0.3.7] - 2026-06-08

### Fixed

- **Agent filter bug in the `auto-assign` module.** Corrected the agent-matching filter used in the CEO/Product Owner heartbeat sections and the primary + fallback `auto-assign` skills.

---
## [0.3.6] - 2026-06-07

### Fixed

- **Bootstrap ordering hardened** in `assemble.js`, with added integration coverage.
- **PR review workflow tightened.** Review skills across all reviewing roles (code reviewer, devops, engineer, product owner, QA, UI designer, UX researcher) and the `pr-conventions` doc were updated for consistent, role-appropriate review scope; `github-repo` and `pr-review` module metadata adjusted.

---
## [0.3.5] - 2026-06-07

### Changed

- **Worker agents no longer run always-on heartbeats.** Since the plugin now provisions the whole team (0.3.2) plus all routines (0.3.4), enabling a heartbeat on every agent produced a burst of concurrent and queued runs that overloaded the dev server (frequent crashes/restarts, cascading `process_lost` failures). Paperclip wakes an agent when work is assigned to it, and routines drive scheduled work, so only the CEO (coordinator) keeps an always-on heartbeat; all other agents are now created with the heartbeat disabled and woken on assignment. This sharply reduces baseline concurrency.

---
## [0.3.4] - 2026-06-07

### Fixed

- **Bootstrap no longer blocks on routine creation.** Paperclip only lets an agent create routines assigned to itself, so the CEO following the bootstrap could not create routines owned by other agents (backlog grooming and auto-assign belong to the Product Owner) — it had to delegate them to a separate issue and block the bootstrap. The plugin now creates all routines directly during provisioning (with board authority, each assigned to its owning agent, with cron triggers), the same way it already creates the agents. BOOTSTRAP.md tells the CEO the routines already exist. New companies only; existing-company runs leave routines untouched.

---
## [0.3.3] - 2026-06-07

### Changed

- **Shared docs are now scoped per role.** Each agent's AGENTS.md previously listed every doc in `docs/`, so e.g. a Code Reviewer was told to read the marketing and vision templates. Docs are now referenced only by the roles of the module that ships them (the CEO, as coordinator, still sees all); a module with no role association stays company-wide.
- **Doc references use relative paths.** They were absolute paths that baked in the (possibly collision-suffixed) company directory name; they are now `docs/<file>` relative to the agent home, which stays valid if the company directory is renamed.

---
## [0.3.2] - 2026-06-07

### Fixed

- **Agents are created with complete instructions.** The plugin now provisions the entire team directly — every non-CEO agent (engineer, code reviewer, etc.) is created with its full `instructionsBundle` (AGENTS.md + HEARTBEAT/SOUL/TOOLS + skills), the same proven path already used for the CEO. Previously the CEO created these agents during bootstrap with only an `instructionsFilePath`, so the host materialized a bundle from a single entry file and each agent ended up with a bare AGENTS.md that referenced its real skills/docs via fragile external absolute paths. BOOTSTRAP.md now tells the CEO the agents already exist (reuse by `metadata.templateRole`, do not duplicate).
- **Isolated workspaces no longer fail on first run.** Fresh local projects used `setupCommand: "git init -b main"`, which leaves an unborn `main` (no commits); the `isolated_workspace` / `git_worktree` policy then failed `git worktree add … main` until an agent happened to make the first commit, so the earliest issues started as "failed" with a workspace error. The default now seeds an initial empty commit (`git init -b main && git … commit --allow-empty …`) so `main` is a valid base ref immediately. A real custom `setupCommand` is left untouched; a missing one is seeded.

---
## [0.3.1] - 2026-06-07

### Added

- **Domain-specific initial issues.** The AI wizard now generates an `issues` array of concrete, project-specific first work items taken straight from the brief. These lead the bootstrap backlog ahead of the generic preset/module setup issues, so the project starts rolling in its actual domain instead of only doing generic scaffolding. Plumbed end-to-end (prompt → wizard state → assembly → BOOTSTRAP.md) with assignee resolution (falls back to CEO when the target role is absent) and deduplication against module issues.

### Changed

- AI wizard config generation now uses Claude Opus (`claude-opus-4-8`), with `max_tokens` raised to 32768 so a full-spec config is never truncated mid-JSON.
- `sync-plugin.sh` now also syncs the `~/.paperclip/plugin-templates` cache. The worker resolves templates from that cache first, so a stale cache silently masked every local template change; the sync script keeps it current.

### Fixed

- AI wizard config generation no longer fails with `RPC call "performAction" timed out after 30000ms`. All Anthropic calls run as background jobs in the worker (start + poll), so no single `performAction` RPC blocks past the host's hard 30s timeout — even for long Opus generations.

---
## [0.3.0] - 2026-06-06

### Fixed

- Secret reference handling for plugin settings now works with the current Paperclip host secret flow.

---
## [0.2.7] — 2026-06-06

### Added

- Two new `game-design` capabilities: `level-design` (owners: level-designer → game-designer → engineer) and `audio-design` (owners: audio-designer → game-designer → engineer), each with a shared primary skill and role fallback — so the Level Designer and Audio Designer roles now own real module work instead of shipping empty.
- `level-designer` added to the `build-game` preset; its "Design all levels and progression" issue reassigned to the specialist.
- Preset coverage: `monitoring` added to `secure` and `full`; `user-testing` added to `gtm`, `content`, and `launch-pack`; `devops` role added to `repo-maintenance`, `qa` to `quality`, `ux-researcher` to `gtm` and `content`. Every module and role is now referenced by at least one preset.
- `src/logic/load-templates.d.ts` — type declarations for the plain-JS loader (restores a clean `tsc --noEmit`).
- Tests: `loadModules` description-precedence cases and an integration test asserting all `$AGENT_HOME` references resolve to absolute paths.

### Changed

- **Routines now run every few hours, around the clock** (previously weekly or business-hours only): auto-assign every 2h, stall-detection every 3h, backlog grooming every 4h, CI pipeline health every 6h, broken-link check every 6h. `concurrencyPolicy: skip_if_active` added to the frequent routines (including the `*/15` API health check) so runs never pile up. Periodic audits (dependency/security scan, Core Web Vitals) stay weekly.
- **Initial backlog**: the `backlog` module's bootstrap issue now seeds an initial backlog of 15-20 actionable issues so the team has immediate, parallelizable work; grooming keeps at least 8 actionable issues ready (was 3).
- `security-engineer` now maps to the dedicated Paperclip `security` role (was `general`).
- `@paperclipai/plugin-sdk` and `@paperclipai/shared` are declared as `peerDependencies` with the minimum required version `>=2026.529.0` — the host provides the SDK at runtime (it is externalized from the bundle).
- `loadModules()` description precedence: `module.meta.json` `description` wins; the README first line is only a fallback (removes a redundant file read).
- `ux-review` skill now guards its `docs/USER-TESTING.md` reference with an explicit "if exists" condition, matching the other review skills.

### Fixed

- **Broken agent file links**: skill, shared-doc, and role-file references used `$AGENT_HOME/...` (or relative `docs/...`), but Paperclip sets `AGENT_HOME` to a separate per-agent workspace dir (`<instanceRoot>/workspaces/<agentId>`) that does not contain the provisioned files. Assembly now rewrites every `$AGENT_HOME` reference and the shared-doc references to absolute paths under `companyDir/agents/<role>/` and `companyDir/docs/`, so HEARTBEAT/SOUL/TOOLS/skills/docs resolve regardless of the agent's runtime cwd.
- **Duplicate bootstrap issues**: a module issue sharing a title with a curated preset issue (e.g. `build-game`'s "Create Game Design Document") was emitted twice. Assembly now de-duplicates issues by title, with the preset issue winning.
- `tsc --noEmit` failure (TS7016) on the `load-templates.js` import, via the new declaration file.

### Removed

- `cfo` role — it was orphaned (in no preset, owned no capability, never activated). Documentation and role counts updated. The `cfo` value remains a valid Paperclip `paperclipRole` enum entry.

---
## [0.2.6] — 2026-05-06

### Added

- **Repository workspace step** — new `StepRepository` wizard step in the manual path lets users choose between creating a fresh local Git repo or connecting an existing external repository (GitHub, GitLab, etc.)
- `ProjectWorkspaceConfig` and `ProjectExecutionWorkspacePolicy` TypeScript interfaces in `WizardContext`
- `resolveEffectiveModules()` — expands transitive module `requires` dependencies; ensures the full module graph is activated
- `collectPresetBootstrapData()` — extracts `issues[]`, `routines[]`, and `labels[]` defined at the preset level so they are included in BOOTSTRAP.md
- `normalizeProjectWorkspace()` / `renderWorkspaceMetaFields()` / `formatWorkspaceObject()` helpers — flexible rendering of `local_path` and `git_repo` workspace types in BOOTSTRAP.md
- `executionWorkspacePolicy` support in project metadata (defaultMode, workspaceStrategy with git_worktree)
- `goalId` field support on issues in BOOTSTRAP.md
- Repository row in `ConfigReview` summary with edit link back to the repository step
- `redactSecrets()` pass on all durable bootstrap text — strips tokens, API keys, and common secret patterns before writing
- Secrets guardrail and PR review workflow guardrail in `templates/bootstrap-instructions.md`
- `presetIssues`, `presetRoutines`, `presetLabels` params to `assembleCompany()`
- `explicitBootstrapLabels` pipeline — preset/module-level labels are registered before issue-derived labels

### Changed

- AI wizard (`StepAiWizard`) now normalizes `workspace` and `executionWorkspacePolicy` from AI-generated project configs
- All AI prompts (single-shot, interview, config-format, messages) updated to ask about and encode repository setup — fresh local repo vs. external Git repo; never request credentials
- `start-provision` and `preview-files` worker actions use `resolveEffectiveModules()` and pass preset bootstrap data to assembly
- `WizardProject` extended with `workspace`, `workspaceSourceType`, `repoUrl`, `repoRef`, `defaultRef`, `executionWorkspacePolicy`
- `repository` added as a step in the manual wizard flow (`MANUAL_STEPS`)
- `WizardShell` maps the `repository` step to `StepRepository`
- `companyDescription` now passed through `escapeBody()` (which includes secret redaction)
- `buildBootstrapLabels()` accepts explicit labels; existing label names are not overwritten by issue-derived ones
- `pr-review` module activates an extra BOOTSTRAP.md note about PR review child issues
- Version bumped to 0.2.6; switched to public npm registry (`--access restricted`)
  CEO default adapter is Codex Local with `gpt-5.5` and high reasoning (`modelReasoningEffort`/`thinkingLevel`).

### Fixed

- CEO provisioning now sends the role description as Paperclip `capabilities` and mirrors it into agent metadata so newly created CEOs are not saved with empty summaries.
- CEO default runtime now caps heartbeat concurrency at one run (`maxConcurrentRuns: 1`).

---

## [0.1.16] — 2026-04-22

### Added

- **Existing-company provisioning** — the wizard can target an existing Paperclip company instead of creating a new one. New `existingCompanyId` state field and `SET_EXISTING_COMPANY_ID` action in `WizardContext`, a "Target" row in `ConfigReview` with inline edit for pasting a company ID, and a summary button label that adapts ("Provision into Existing Company" vs "Create Company")
- **Approval-aware agent hiring** — `PaperclipClient.createAgent()` now detects when direct creation requires board approval, falls back to `POST /api/companies/{id}/agent-hires`, and auto-approves via `/api/approvals/{id}/approve`. If auto-approve fails, the pending approval ID and error are surfaced in the provisioning log so the board can approve it manually
- **`disableBoardApprovalOnNewCompanies` plugin setting** (boolean, default `false`) — when enabled, new companies are PATCHed to `requireBoardApprovalForNewAgents=false` during provisioning for legacy fully-autonomous bootstrap behavior. Leave off to preserve approval-gated hiring policies
- **`PaperclipClient` methods** — `updateCompany`, `getCompany`, `listAgents`, `getAgent` to support existing-company flows

### Changed

- **CEO resolution for existing companies** — when `existingCompanyId` is set, `start-provision` reuses an active CEO agent if one exists on the company; otherwise it hires a new CEO through the approval-aware path. The bootstrap task title now uses the resolved company name
- **Partial-failure cleanup** — provisioning only deletes companies that were created in the same run. Existing companies are never deleted on error; the log explicitly notes the skipped cleanup
- **`StepDone` messaging** adapts to existing-company mode ("Workspace has been assembled and bootstrap tasks were added to the existing Paperclip company")

---

## [0.1.15] — 2026-04-05

### Added

- **`check-ai-config` worker action** — lightweight pre-check that verifies the Anthropic API key is configured. Called on AI wizard mount to show a warning banner with a link to plugin settings before the user starts typing
- **API key warning banner** in the AI wizard describe phase — amber alert with "Plugin Settings" button when `anthropicApiKey` is missing

### Changed

- **Graceful error handling across all worker actions** — `ai-chat`, `start-provision`, `preview-files`, and `refresh-templates` now return `{ error }` instead of throwing. This prevents the plugin host from swallowing error messages in generic 502 responses (fixes [#5](https://github.com/Yesterday-AI/paperclip-plugin-company-wizard/issues/5))
- **`PaperclipClient.connect()`** — wraps the initial fetch in try/catch to surface network errors (wrong port, connection refused) with actionable messages mentioning `paperclipUrl` in plugin settings
- **`PaperclipClient._fetch()`** — same network-error handling for all API calls during a session
- **All error messages** now reference plugin settings fields instead of CLI flags (legacy from the standalone CLI)
- UI components (`StepProvision`, `ConfigReview`, `StepOnboarding`) updated to handle graceful error returns from worker actions

### Fixed

- AI wizard 502 error after first step — error messages from the worker (missing API key, Anthropic API errors, network failures) were lost when the plugin host converted thrown errors to generic 502 responses. Now returned as structured data that flows through to the UI error bar
- "fetch failed" on non-default ports — `PaperclipClient` now catches `TypeError` from `fetch()` and surfaces the configured URL in the error message
- `start-provision` compensation logic preserved — inner try/catch still deletes partially created companies, outer try/catch returns the error gracefully with full provisioning logs

---

## [0.1.14] — 2026-03-30

### Fixed

- `ai-chat` action: `max_tokens` reduced from 16384 to 8192 — 16K caused Paperclip's 30s RPC timeout to trigger before Sonnet could finish generating

---

## [0.1.13] — 2026-03-30

### Changed

- CEO agent default model: `claude-opus-4-6` (was: no default, Paperclip fallback)
- CEO agent heartbeat interval: 3600s / 1 hour (was: Paperclip default 300s / 5 min)
- `createAgent()` API client now accepts `runtimeConfig` (used for `heartbeat.intervalSec`)

---

## [0.1.12] — 2026-03-30

### Added

- Label creation instructions in bootstrap — CEO creates labels before issues, attaches `labelIds`, maintains labels in heartbeat
- `assigneeUserId: → board user` for human-assigned issues (was incorrectly using `assigneeAgentId: → "user"`)

### Changed

- Bootstrap instructions expanded: "How to read the metadata" section explains direct values vs `→` references, documents `assigneeUserId` for board user assignment

---

## [0.1.11] — 2026-03-29

### Added

- Bootstrap instructions loaded from `templates/bootstrap-instructions.md` — editable without code changes

### Changed

- BOOTSTRAP.md field names now match Paperclip API exactly: `parentId` (was `parentGoal`), `assigneeAgentId` (was `assignee`), `projectId` (was `project`), `goalIds` (was `goals`)
- References use `→ "name"` syntax to signal the CEO must resolve names to UUIDs
- Company description rendered under `## Company` heading

### Fixed

- BOOTSTRAP.md metadata switched from `<!-- -->` HTML comments to visible `- **key**: value` bullet lists — HTML comments were stripped by Paperclip's markdown renderer

---

## [0.1.9] — 2026-03-29

### Added

- **Routines** — new `routines[]` field in module/preset meta.json for recurring scheduled agent work. Modules `stall-detection`, `auto-assign`, `backlog`, `ci-cd`, `build-api`, and `website-relaunch` now define routines with cron schedules
- `## Routines` section in BOOTSTRAP.md with `<!-- assignee, schedule, concurrencyPolicy -->` frontmatter per routine
- `createRoutine()` and `createRoutineTrigger()` methods in API client
- Subgoal expansion — `goal.subgoals[]` are expanded into the goal hierarchy as nested goals with `level: "team"` and `parentGoal`
- Robust JSON parser — string-aware brace tracking, trailing comma cleanup, markdown code fence fallback, `console.error` debug logging on parse failure
- ConfigReview file grouping — agent files grouped by `agents/<role>/` instead of flat `agents/`
- "Update templates" button on onboarding screen — `refresh-templates` worker action deletes cached templates and re-downloads from GitHub

### Changed

- **Template schema harmonized with Paperclip API** — `milestones[]` → `subgoals[]` (with `id`, `title`, `level`, `description`); `goal.issues[]` removed (issues belong to projects, not goals); `tasks[]` → `issues[]` everywhere
- BOOTSTRAP.md uses `<!-- -->` HTML-comment frontmatter instead of code fences (safe when descriptions contain code blocks)
- BOOTSTRAP.md issue frontmatter: only `assignee` + `project` (removed `milestone`)
- BOOTSTRAP.md provisioning steps show correct goal `level` (not hardcoded to `company`)
- `assembleCompany()` returns `initialIssues` + `initialRoutines` (was `initialTasks`)
- `createGoal()` API client now accepts `status` and `ownerAgentId` fields
- `ai-chat` action: `max_tokens` increased from 1024 to 16384

### Removed

- `GoalMilestone` typedef, `GoalIssue` typedef, `modulesWithActiveGoals()` export
- `milestone` field on template issues
- `completionCriteria` field on milestones (folded into subgoal `description`)
- `generateBootstrapDescription()` — bootstrap issue uses BOOTSTRAP.md directly
- `skipTaskModules` logic — goals no longer contain issues, so no skip needed

---

## [0.1.7] — 2026-03-29

### Changed

- `ai-chat` action: `max_tokens` increased from 1024 to 16384 — prevents truncated JSON when AI generates thorough goal descriptions with the new `goals[]`/`projects[]` format

### Fixed

- JSON parser in `tryExtractConfig` now string-aware: brace-depth tracker skips `{`/`}` inside quoted strings, preventing false matches on text like `"Build API with {userId}"`
- JSON parser handles trailing commas, line comments, unescaped newlines/tabs in AI-generated JSON
- JSON parser falls back to markdown code fence extraction (`\`\`\`json ... \`\`\``) when brace tracking finds no valid config
- Added `console.error` debug logging when config parsing fails — raw AI response is now visible in browser devtools

---

## [0.1.6] — 2026-03-29

### Changed

- Bootstrap issue now uses BOOTSTRAP.md content directly as its description — the CEO gets the full company spec, goals, projects, agents, issues, and provisioning steps instead of a generic "set up workspace" message

### Removed

- `generateBootstrapDescription()` — redundant; BOOTSTRAP.md IS the bootstrap issue

---

## [0.1.5] — 2026-03-29

### Added

- **Multi-goal support** — `goals[]` array replaces singular `goal` field; AI wizard generates hierarchical goals with `parentGoal` for sub-goals
- **Multi-project support** — `projects[]` array replaces singular `project` field; projects linked to goals via `goals[]` array (matches Paperclip API `goalIds`)
- `WizardProject` interface (`name`, `description`, `goals[]`) and `Goal.parentGoal` field
- `companyDescription` rendered in BOOTSTRAP.md (was previously only sent to the API)
- Full issue details in BOOTSTRAP.md: descriptions, `[priority]` annotations, `_(milestone: id)_` references
- Full milestone details in BOOTSTRAP.md: descriptions and `_Done when:_` completion criteria
- Preset roles shown in AI wizard catalog — `buildCatalog()` now includes `roles: engineer, ...` for each preset so the AI knows what selecting a preset implies

### Changed

- **BOOTSTRAP.md structure** — unified hierarchy: Goals (### top-level, #### sub-goals) → Projects (with workspace + goal links) → Agents (instructionsFilePath only) → Issues (grouped by goal, annotated with target project) → Provisioning Steps (explicit API creation order)
- **AI wizard config format** — `goal`/`goalDescription`/`project`/`projectDescription` (flat) → `goals: [{title, description, parentGoal?}]` + `projects: [{name, description, goals[]}]` (backward compatible with old format)
- **AI wizard prompts** — `goalDescription` instructions now demand thorough, spec-level detail; system prompts explain `goals[]`/`projects[]` format
- `assembleCompany()` signature — `goal`/`project`/`goals` → `userGoals`/`userProjects`/`inlineGoals`; module inline goals auto-linked as sub-goals of the main user goal
- Agent listings in BOOTSTRAP.md show `instructionsFilePath` only (removed legacy `cwd` field)
- Issues in BOOTSTRAP.md are grouped by goal with `_Project: "name"_` annotation instead of `goalId →` references (issues link to projects, not goals)
- Ungrouped module tasks rendered under "Initial tasks" heading (not under main goal title)

### Fixed

- AI wizard silently dropped preset modules — only roles were merged with AI-selected ones; now both modules and roles are defensively merged from the preset definition
- AI wizard rarely selected engineer — `buildCatalog()` listed presets with modules but not roles, so the AI didn't see that selecting a preset doesn't auto-add its roles
- BOOTSTRAP.md had two confusing issue sections ("Goal: ..." with issues and separate "Initial Tasks") — now unified under single `## Issues`
- `project` and `projectDescription` from AI wizard config were silently ignored — never reached `assembleCompany` or BOOTSTRAP.md

---

## [0.1.4] — 2026-03-28

### Added

- `companyDescription` field — AI wizard now generates a comprehensive 2-4 paragraph company description that's stored in `WizardContext` and passed to the Paperclip API when creating the company
- Preset role merging — AI wizard merges preset roles with AI-selected roles so preset roles aren't lost when the AI omits them
- Interview guidance — interview system prompt now covers what to ask about (stage, quality vs speed, team needs, repo details) and skips questions already answered
- Information preservation section — prompts instruct the AI to write thorough `companyDescription`, `goalDescription`, and `projectDescription` fields as the company's permanent record
- `launch-pack` preset — full executive team launch with CTO + CMO: strategy, tech, and marketing from day one
- 4 new modules: `codebase-onboarding` (audit existing codebases), `triage` (classify inbound GitHub issues), `dependency-management` (CVE scanning, safe patching), `release-management` (semver, changelogs, tagging)
- `repo-maintenance` preset — custodial maintenance for existing repos using the new modules

### Changed

- AI wizard config format: `extraModules`/`extraRoles` → `modules`/`roles` (all-inclusive lists that include preset defaults)
- AI wizard prompts now explicitly document that `engineer` is NOT a base role and must be listed for software projects
- Interview start message now includes the user's initial description (`{{DESCRIPTION}}`) so the AI has context from turn one
- Generate-config message reminds the AI to include all non-base roles and write thorough descriptions
- Single-shot system prompt restructured with numbered steps, "How Roles Work" section, and information preservation guidelines
- Template counts: 15 presets, 26 modules, 17 optional roles

### Fixed

- AI wizard no longer silently drops preset roles — `StepAiWizard` merges preset and AI-selected role arrays before dispatching
- Interview-mode template now passes `{{DESCRIPTION}}` in the start message (was previously blank, losing user context)

## [0.1.3] — 2026-03-28

### Added

- `publish:npm` and `prepublishOnly` scripts in `package.json` for streamlined npm publishing
- `files` whitelist in `package.json` to control published package contents

## [0.1.2] — 2026-03-25

### Changed

- Updated plugin references and repository links to point to the new repo
- Updated favicon path and added new favicon SVG
- Updated author name in manifest

## [0.1.1] — 2026-03-22

### Changed

- Version bump and manifest updates

---

## [0.1.0] — 2026-03-18

Initial release of the plugin. Replaces the standalone Ink-based CLI with a native Paperclip plugin.

### Added

- Interactive wizard UI (manual and AI-powered paths) for bootstrapping agent companies
- Preset, module, and role selection with hover-card detail previews and inline editing
- **Preview generated files** — collapsible file browser in the review step; each `.md` file can be expanded and edited before provisioning
- `preview-files` worker action: assembles to a temp dir and returns file contents without writing to disk
- `fileOverrides` support in `start-provision`: edits made in the UI are applied to assembled files before the API calls
- CEO adapter configuration (adapter type, working directory, model) in the wizard
- Real-time provisioning log streamed from the worker
- `check-auth` action for surfacing credential issues early (used by the summary step)
- Self-contained: templates, assembly logic, and API client are all bundled inside the plugin
- CI workflow (GitHub Actions) with pnpm, build, vitest, and node:test logic suite
- Pre-commit hook running prettier via lint-staged

### Template system

- 14 presets (fast, quality, rad, startup, research, full, secure, gtm, content, launch-mvp, build-api, website-relaunch, repo-maintenance, build-game)
- 22 modules across strategy, maintenance, and engineering workflow categories
- 17 optional roles (CEO is the only base role; Engineer is optional but included in most presets)
- All 22 modules now have `description` fields (previously only presets and roles had them)
- Engineer moved from base role to optional; added to 13 presets and to `pr-review`'s `activatesWithRoles`; task `assignTo` falls back to CEO if the named role is absent
- Gracefully optimistic capability resolution: responsibilities shift automatically as roles are added
- Inline goals with milestones and issues (from presets and modules)
- Heartbeat section injection into assembled `HEARTBEAT.md` files

### Configuration

- New `companiesDir` plugin setting — where assembled company workspaces are written. Defaults to `~/.paperclip/instances/default/companies`
- New `templatesRepoUrl` plugin setting — GitHub tree URL for auto-downloading templates. Defaults to the Yesterday-AI/paperclip-plugin-company-wizard repo
- `templatesPath` now defaults to `~/.paperclip/plugin-templates`, auto-downloaded from `templatesRepoUrl` if missing; falls back to bundled templates
- `sync-plugin.sh` added — syncs built artifacts and updates `manifest_json` in the Paperclip DB so schema changes are picked up on restart

### Bug fixes

- Bootstrap issue is now set to `todo` immediately after creation (was `backlog`, which the CEO agent inbox endpoint doesn't return)
- `issues.update` capability added to manifest to support the status update
- Generated files are now written directly to `companiesDir` — removes the container/host path split and fixes incorrect paths in the bootstrap issue description
- Improved loading screen: spinner + explanation that templates may be downloaded on first load

---

## Prior art

This plugin is derived from [`@yesterday-ai/paperclip-plugin-company-wizard`](https://github.com/Yesterday-AI/paperclip-plugin-company-wizard), the standalone Ink-based CLI. See that project's changelog for history prior to this plugin.
