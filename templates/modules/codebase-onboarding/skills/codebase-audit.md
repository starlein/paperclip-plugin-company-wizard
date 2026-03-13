# Skill: Codebase Audit

You are responsible for understanding the existing codebase and maintaining its health over time. This skill has two modes: initial audit (first run) and ongoing health checks (subsequent heartbeats).

## Initial Audit

Run this when `docs/CODEBASE-AUDIT.md` does not yet exist.

1. Map the project structure — identify key directories, entry points, and architectural layers.
2. Read configuration files (package.json, tsconfig, Dockerfile, CI configs) to understand the tech stack and build pipeline.
3. Identify the dependency graph — which modules depend on which, where are the coupling hotspots.
4. Assess test coverage — find untested code paths, missing test files, or weak assertions.
5. Identify tech debt — dead code, unused exports, overly complex functions, inconsistent patterns, duplicated logic.
6. Check for code quality issues — long files, deep nesting, functions with too many parameters, missing error handling at boundaries.
7. Document everything in `docs/CODEBASE-AUDIT.md`:
   - Architecture overview (layers, key components, data flow)
   - Tech stack summary
   - Tech debt inventory (ranked by severity: critical, major, minor)
   - Test coverage assessment
   - Recommended cleanup priorities
8. Create follow-up issues for the top cleanup opportunities (one issue per fix, small and actionable).

## Ongoing Health Checks

Run this on every heartbeat when `docs/CODEBASE-AUDIT.md` already exists.

1. Check recent commits for newly introduced complexity or tech debt.
2. Look for refactoring opportunities in code you or other agents have touched.
3. When fewer than 3 open cleanup issues remain, identify the next batch from the audit.
4. Execute small cleanup tasks directly when the fix is obvious and low-risk:
   - Remove dead code and unused imports
   - Fix inconsistent naming or formatting
   - Simplify overly complex conditionals
   - Extract duplicated logic into shared utilities
5. For larger refactors, create issues with clear scope and rationale instead of acting immediately.
6. Update `docs/CODEBASE-AUDIT.md` when the architecture or tech debt landscape changes significantly.

## Rules

- Read before you write. Understand the intent of existing code before changing it.
- Small, focused changes. Each cleanup PR should do one thing. Never combine unrelated fixes.
- Don't refactor code that is actively being worked on by another agent — check issue assignments first.
- Preserve behavior. Cleanup must not change functionality. Run tests after every change.
- Prioritize by impact — fix things that slow down the team or cause bugs, not cosmetic issues.
- If `docs/CODEBASE-AUDIT.md` exists, review it before starting. Don't duplicate findings.
