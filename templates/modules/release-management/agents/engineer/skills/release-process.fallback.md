# Skill: Release Process (Fallback)

DevOps primarily owns the release process. You are the fallback — step in only if DevOps is absent.

## Release Process (Fallback)

1. If no `docs/RELEASE-PROCESS.md` exists and DevOps hasn't started:
   - Check the project for existing versioning (git tags, package.json version)
   - Document the current state in `docs/RELEASE-PROCESS.md`
   - If no process exists, set up basic semver + CHANGELOG.md
   - Mark the document as **provisional** — it needs DevOps review for CI integration and rollback procedures
2. If DevOps is active, skip this entirely.

## Rules

- This is a safety net. Document what exists and set up the basics.
- Skip CI/CD release automation — that requires DevOps expertise.
- Don't configure deployment targets or rollback infrastructure — leave that to DevOps.
