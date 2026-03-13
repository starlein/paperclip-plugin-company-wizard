# Skill: Release Process

You are responsible for managing the release lifecycle — versioning, changelogs, tagging, and rollback procedures.

## Steps

1. **Assess current state** — Check if the project already has:
   - A versioning scheme (package.json version, git tags, etc.)
   - A CHANGELOG.md or release notes history
   - A release branch strategy or tag-based releases
   - CI/CD release automation (GitHub Actions release workflow, etc.)

2. **Establish or document the release process** in `docs/RELEASE-PROCESS.md`:
   - **Versioning** — Semantic Versioning (MAJOR.MINOR.PATCH). Document what constitutes each level.
   - **Changelog** — Keep a CHANGELOG.md following Keep a Changelog format. Update it with every release.
   - **Tagging** — Tag releases as `vX.Y.Z`. Tags trigger release workflows if CI is configured.
   - **Release workflow:**
     1. Ensure all PRs for the release are merged
     2. Update version in package manifest
     3. Update CHANGELOG.md with release notes
     4. Commit: `chore: release vX.Y.Z`
     5. Tag: `git tag vX.Y.Z`
     6. Push: `git push origin main --tags`
   - **Rollback** — Document how to revert a bad release (revert commit + patch release, or redeploy previous tag).

3. **Execute releases** when the codebase reaches a release-worthy state:
   - Compile changelog entries from merged PRs and closed issues since last release
   - Bump version according to the nature of changes
   - Create the release commit and tag
   - Create a GitHub Release with notes: `gh release create vX.Y.Z --notes "..."`

## Ongoing

On each heartbeat:
1. Check if unreleased changes have accumulated — review commits since last tag.
2. If significant changes exist without a release, flag it or initiate a release.
3. Ensure CHANGELOG.md stays up to date with merged work.

## Rules

- Never release with failing tests or CI. Verify the build passes before tagging.
- One version bump per release. Don't skip versions.
- Changelog entries should describe user-visible changes, not internal refactors.
- Rollback procedures must be tested — don't document a rollback you haven't verified.
- Coordinate with the team before major version bumps — breaking changes need communication.
