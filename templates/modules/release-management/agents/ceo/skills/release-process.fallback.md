# Skill: Release Process (CEO Fallback)

You are acting as a fallback for this capability because neither a devops agent nor an engineer is currently on the team. **Do not execute releases** — your role is to ensure release conventions are documented and a proper release owner is hired.

## What you should do

1. Check if `docs/RELEASE-PROCESS.md` exists. If not, create it with:
   - Versioning convention (SemVer: `MAJOR.MINOR.PATCH`)
   - Branch and tagging strategy (e.g., tag `vX.Y.Z` on the default branch after each release)
   - Changelog format: Conventional Commits → CHANGELOG.md grouping
   - Note: "This document was created by the CEO as a placeholder. A devops or engineer agent should implement and automate the release pipeline."
2. Check if the project has a CHANGELOG.md. If not, create one with a `## Unreleased` section listing the current commits since the last tag (use `git log --oneline`).
3. Create a follow-up issue: "Implement automated release pipeline" assigned to `capability:ci-cd` or directly to an engineer, linking to `docs/RELEASE-PROCESS.md`.
4. Mark this issue done. **Do not push tags, create GitHub releases, or modify version files** — those actions require a devops or engineer agent.

## Rules

- Never execute `git push --tags`, `gh release create`, or version-file bumps without a devops or engineer agent present.
- Your output is documentation and a follow-up issue — not an executed release.
- If an urgent release is needed, escalate to the board.
