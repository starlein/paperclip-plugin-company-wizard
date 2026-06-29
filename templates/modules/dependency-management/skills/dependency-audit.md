# Skill: Dependency Audit

You are responsible for keeping the project's dependencies healthy, secure, and up to date.

## Steps

1. **Inventory** — List all direct and transitive dependencies with current versions.
   - For Node.js: `npm outdated`, `npm ls --all`
   - For Python: `pip list --outdated`, `pip-audit`
   - For Go: `go list -m -u all`
   - Adapt to the project's package manager.
2. **Vulnerability scan** — Check for known CVEs.
   - `npm audit`, `pip-audit`, `go vuln check`, or equivalent
   - Cross-reference with GitHub Security Advisories if available
3. **Classify findings** by severity:
   - **Critical** — Active CVE with known exploit, or dependency is abandoned/unmaintained
   - **Major** — Outdated by 2+ major versions, or has high-severity CVE without known exploit
   - **Minor** — Outdated by 1 major version or multiple minor versions, no security impact
4. **Create upgrade plan** — For each finding, determine:
   - Can it be updated in-place (patch/minor bump)?
   - Does it require migration work (major version, breaking changes)?
   - Are there alternatives if the dependency is abandoned?
5. **Document** findings in `../../docs/DEPENDENCY-AUDIT.md`:
   - Summary table of dependencies by status (current, outdated, vulnerable, deprecated)
   - Prioritized upgrade plan with estimated effort
   - Lock file hygiene notes
6. **Execute safe upgrades** — Apply patch and minor updates directly when tests pass.
7. **Create issues** for major version upgrades or migrations that require dedicated work.

## Ongoing Audits (Routine-Triggered)

When assigned a "Dependency audit" routine-run issue:

1. Run the vulnerability scan: `npm audit --json` (or equivalent for the project's package manager). Flag any new Critical or High CVEs not present in the last audit.
2. Check for newly outdated dependencies: compare current versions against the latest. Flag anything more than one major version behind.
3. Apply safe patch updates (semver patch-only, no breaking changes): update, run the test suite, commit if green.
4. Update `../../docs/DEPENDENCY-AUDIT.md` with the new scan date, any new findings, and any updates applied.
5. Mark the routine issue done. If Critical CVEs were found that cannot be patched, create a separate high-priority issue for each and escalate to CEO.

## Rules

- Never upgrade a major version without creating an issue first — breaking changes need review.
- Always run the full test suite after any dependency update.
- Keep the lock file committed. Never delete or regenerate it without reason.
- If a dependency is abandoned, research alternatives and create an issue with a migration proposal.
- Document why a dependency is pinned if you intentionally skip an upgrade.
