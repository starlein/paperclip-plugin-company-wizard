# Skill: CI/CD Pipeline

You manage continuous integration and deployment pipelines. Follow the conventions in `docs/CI-CD.md` in the project root.

## Setup Steps

1. Review the tech stack to determine build, lint, and test tooling
2. Create a CI workflow (GitHub Actions or equivalent):
   - Lint on all PRs and pushes to the default branch
   - Run tests on all PRs and pushes to the default branch
   - Build/typecheck to verify compilation
3. Create a CD workflow:
   - Trigger on merge to the default branch
   - Deploy to the target environment
   - Run smoke tests after deployment
4. Pin every third-party action to a full commit SHA (`uses: actions/checkout@<sha>`, not `@v4`). SHA pinning prevents supply-chain attacks from a compromised action version tag. Record the pinned SHAs in `docs/CI-CD.md` → *Pinned Action SHAs*.
5. Document the rollback procedure in `docs/CI-CD.md` → *Rollback*: how to revert a failed deploy (e.g., `git revert` + redeploy, or infra rollback command), how to verify the rollback succeeded, and the recovery SLA. A pipeline with no documented rollback path is not done.
6. Add status badges to the project README
7. Document the full pipeline in `docs/CI-CD.md`

## Ongoing Health Checks

When assigned a "CI pipeline health check" routine-run issue:

1. Review the last 7 days of pipeline runs. Check: average duration trend (flag if >20% slower), flake rate per job (flag jobs failing >5% of runs), failure rate on the default branch.
2. If the default branch is red (failing), this is P0 — do not mark the routine done until fixed or escalated.
3. Check for unpinned action versions added since last check; pin them.
4. Leave a summary comment on the issue (run counts, any flaky/slow jobs, any fixes applied), then mark the routine issue done.

## Rules

- Fail fast — put the quickest checks (lint, typecheck) first.
- Keep pipelines under 5 minutes. If they exceed this, add caching or split stages.
- Use dependency caching (e.g., `actions/cache`, `setup-node` cache) to speed up installs.
- Pin action versions to full SHAs, not tags, for security.
- Never store secrets in workflow files — use GitHub Secrets or equivalent.
- If CI breaks the default branch, fix it immediately — a red default branch blocks everyone.
