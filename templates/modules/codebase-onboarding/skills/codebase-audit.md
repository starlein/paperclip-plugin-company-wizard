# Skill: Codebase Audit

You are responsible for understanding the existing codebase and maintaining its health over time. This skill has two modes: initial audit and assigned follow-up health checks.

## When To Use This Skill

Use this when assigned a codebase-audit issue, codebase-health routine, or explicit cleanup/planning task. Do not refactor opportunistically during unrelated heartbeats.

## Initial Audit

Run this when `../../docs/CODEBASE-AUDIT.md` does not yet exist.

1. Map the project structure — identify key directories, entry points, and architectural layers.
2. Read configuration files (package.json, tsconfig, Dockerfile, CI configs) to understand the tech stack and build pipeline.
3. Identify the dependency graph — modules, coupling hotspots, and risky boundaries.
4. Assess test coverage — untested paths, missing tests, weak assertions.
5. Identify tech debt — dead code, unused exports, complex functions, inconsistent patterns, duplicated logic.
6. Check for code quality issues — long files, deep nesting, too many parameters, missing boundary error handling.
7. Document findings in `../../docs/CODEBASE-AUDIT.md` or an issue document/work product:
   - architecture overview
   - tech stack summary
   - tech debt inventory ranked by severity
   - test coverage assessment
   - recommended cleanup priorities
8. Create follow-up issues for top cleanup opportunities; keep each issue small, scoped, project-linked, and acceptance-driven.

## Assigned Health Checks

When assigned an audit refresh/health-check issue:

1. Read the existing audit document and recent relevant changes.
2. Look for newly introduced complexity or tech debt in touched areas.
3. Update the audit only when architecture or debt landscape changed materially.
4. Execute small cleanup tasks only when the issue explicitly asks for implementation and the fix is low-risk.
5. For larger refactors, create issues with clear scope and rationale instead of acting immediately.
6. Record verification and attach the updated audit as a work product/document when user-inspectable.

## Rules

- Read before you write. Understand the intent of existing code before changing it.
- Small, focused changes. Never combine unrelated cleanups.
- Do not refactor code actively owned by another agent; inspect assignments and execution state first.
- Preserve behavior. Cleanup must not change functionality. Run tests after every change.
- Prioritize by impact — fix things that slow the team or cause bugs, not cosmetic churn.
