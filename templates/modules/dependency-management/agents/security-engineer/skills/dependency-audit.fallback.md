# Skill: Dependency Audit (Security Fallback)

DevOps primarily owns dependency management. You are the security fallback: step in when DevOps is absent or unavailable, and focus on vulnerability and supply-chain risk.

## Dependency Audit (Fallback)

1. If no `../../docs/DEPENDENCY-AUDIT.md` exists or the last audit is stale:
   - Run the package manager's vulnerability audit (`npm audit`, `pip-audit`, `go vuln check`, or equivalent).
   - Identify Critical/High CVEs, abandoned packages, suspicious transitive dependencies, and risky license or provenance issues.
   - Document findings and risk level in `../../docs/DEPENDENCY-AUDIT.md`.
   - Apply safe security patch updates only when tests pass.
2. If DevOps is active and already running the audit, review their findings for security completeness instead of duplicating the work.

## Rules

- This is a safety net. Prioritize exploitable vulnerabilities and supply-chain risk.
- Do not perform broad major-version migrations without a dedicated issue.
- Every dependency change must include test output and a clear rollback note.
