# Template audit — Company Wizard 0.8.0

## Scope and release boundary

This release completes the audited follow-up to Company Wizard 0.7.0 (`11096c0892d4e6ddf3cd23ba13dfe69eaec7e081`), checked against the exact Paperclip `v2026.1001.0` tag (`8f8a0ab7effbd6a0584107d8038736c134ee5047`). The audit is source-, schema-, assembly- and fixture-based, not a live-company migration or an unconditional guarantee of autonomous agent behavior.

The complete enrichment inventory is in [template-audit-inventory.json](template-audit-inventory.json). Each of its 70 files has an explicit outcome and content hash: six LENSES, eight DONE, 17 SOUL, 17 TOOLS, 18 output bars and four published AI prompt files. All six LENSES remain unchanged after review; their domain perspectives are intentional. Optional absence of enrichment in other roles is not a defect.

## Implemented recommendations

| Area | Change and evidence |
| --- | --- |
| Capability ownership | Seven module owner chains now resolve with CEO-only teams. `launch-pack` design-system resolves to the present CTO, with CEO last. New fallback skills match present secondary owners. `tests/template-matrix.spec.ts` exercises all 15 presets (isolation on/off), each of 27 modules with dependencies (CEO-only/all roles), each of 17 roles, and both all-module configurations: 103 cases. It checks primary/fallback skill installation, resolved issue/routine assignments, required files, doc links and fragment exclusion. Intentionally unassigned backlog work stays allowed. |
| Reviews and hiring | Thirteen generic heartbeats separate new review admission from existing-wait diagnostics. PR instructions distinguish rejected first-stage self-review from later routing, and make human escalation prerequisites explicit. CEO hiring fallback follows `/agent-hires` governance and a present Product Owner. Backlog README describes assigned routines, not perpetual queue scans. `tests/template-workflows.spec.ts` checks actual assembled outputs. |
| Releases | Specialist instructions resolve the configured base, preserve managed issue branches, verify the intended merged commit, publish only the selected tag and read back release artifacts. A routine is not implicit authorization. A CEO-specific primary skill provides bounded coordination rather than executing releases; the secondary fallback agrees. `tests/template-release-paths.spec.ts` covers both CEO-only and specialist teams. |
| Runtime paths and scope | Installed skills distinguish company references (the AGENTS Shared Documentation mapping) from actual project/worktree CWD and project deliverables. Existence checks for lean-delivery use the company mapping. Ongoing instructions are bounded by assigned work rather than permission to scan unrelated queues. The competitive fallback uses `COMPETITIVE-LANDSCAPE.md` consistently. `tests/template-runtime-contract.spec.ts` checks every installed skill and every role's tool notes. |
| Completion fragments | All eight DONE fragments preserve native executionPolicy routing, distinguish stage verdict from terminal completion, avoid re-commenting unchanged blockers, require structured waits, and clarify missing acceptance criteria rather than inventing them. |
| Output bars | CEO architecture bar describes actual primary responsibility rather than an absent-engineer fallback. Competitive tracking accepts evidenced no-change passes; backlog permits project-detached API-only routines; CI timing is a justified optimization budget rather than a universal five-minute gate, in both primary skill variants and bar; documentation commands are verified only in safe authorized environments. |
| Enrichment mechanics | `tests/template-enrichment.spec.ts` exercises all 18 bars on actual primary owners, all eight DONE and six LENSES exactly once, disabled-enrichment behavior and absence of standalone fragments. Fallback skills do not receive primary bars. |
| Tool prerequisites | All 17 TOOLS files describe adapter-dependent availability, approved equivalents, authorization before enabling tools and non-secret notes. Templates do not grant tools, credentials or permissions. |
| AI prompts | `src/ui/prompts` is canonical. Published prompt/message copies are checked for exact parity, including config-format content. Both prompt paths describe actual preset-role union, arrays rather than legacy singular fields, and plain folders/existing local paths rather than forcing Git. Negative tests reject the old contradictory requirement. |
| Local workspaces | Manual setup, ConfigReview and AI normalization preserve explicit `workspace.setupCommand: null`. The assembler/client retain it, and local preparation does not initialize/reset Git. Existing local cwd/files and unchanged directory policy flags are preserved. Changing a remote repository URL no longer reuses the previous checkout. Tests cover UI helpers, the actual normalizer, assembly, filesystem effects and project schemas. Omitted setup still uses legacy Git defaults. |
| Input validation | Missing/blank company names fail before instance HTTP lookup. Regression tests assert zero network calls, eliminating the previously observed network-dependent validation timeout. |

## Completed instruction and documentation corrections

The renewed task authorization allowed the role instruction changes: DevOps now uses structured blockers and saved human-input interactions; all nine affected role handoffs route absent specialists through a present owner/CEO without weakening gates; unconditional repeat-comment instructions and incorrect project-output paths were corrected. UX SOUL now describes sample size, population/task coverage and limitations instead of a universal percentage. All eleven previously skipped acceptance tests are enabled and pass.

After explicit authorization, `CLAUDE.md` was also corrected: company reference paths are distinct from project output locations, `instructionsFilePath` is not assumed to determine runtime CWD, null/absent existing policies retain inheritance, and explicit null setup disables local Git initialization. No audited permission-blocked correction remains outstanding.

## Verification commands

Recorded verification: all 362 Vitest cases passed without skips; all 229 logic/API cases passed. Both SDK typechecks and production build passed. The 103-case exact-host matrix passed; all generated payload schema checks passed. A package dry run confirmed that the audit report and per-file inventory are included. Independent reviews covered the implementation and the final role-instruction corrections.

- `pnpm test` — includes complete catalog, enrichment, workflow, release/path, no-Git and AI regression suites; all formerly pending cases are active.
- `pnpm run test:logic`
- `pnpm run typecheck`
- `pnpm run build:prod`
- `git diff --check`

Additional audit checks compile against separately installed SDK/shared `2026.1001.0` without changing shipped `2026.831.1` pins and validate generated client payloads against the exact host tag's schemas. Local Chromium fixture checks use the real StepRepository, ConfigReview, state provider and production CSS at widths 375, 414, 768, 1024 and 1440. They verify directory/new-Git transitions, cwd/policy preservation, accurate summaries, no overflow, usable mode controls and no page errors. These are fixture/component checks, not a live host provisioning run.

## Operational limits

- No production API/database mutations, agent wakeups, installed template-cache synchronization or existing-company instruction migration were performed.
- A plain folder disables initialization; it does not change provider trust policy. The operator must select/configure an adapter that supports the actual workspace. For example, Codex CLI has repository trust requirements; this plugin does not silently add a trust-bypass flag. Provider credentials, entitlements, external tools and ACP availability still require environment-specific acceptance checks.
- Templates affect future assembly. Already-provisioned company files do not automatically receive these changes.
- Live model behavior cannot be guaranteed by schema checks or text assertions. Tests establish deterministic assembly and contract invariants; operator prerequisites still require environment-specific verification.
