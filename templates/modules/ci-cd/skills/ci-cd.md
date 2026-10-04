# Skill: CI/CD Pipeline

You manage continuous integration and deployment pipelines. Read company reference docs through the paths in your generated `AGENTS.md` → **Shared Documentation**, resolved relative to that instruction file, not the shell CWD. Project commands and outputs belong in the actual project/execution workspace from issue/project metadata, which may be separate from the company directory. `docs/CI-CD.md` is a project deliverable, not a shipped company reference: read it if it exists; otherwise create it as part of this task after inspecting the project. All output paths below are relative to that project workspace. Do not copy company docs into the repository or hard-code absolute paths.

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
- Aim for under 5 minutes as an optimization target, not a universal completion blocker. For larger or slower suites, document a justified measured baseline and agreed runtime budget, with caching or split stages as measurable optimization follow-ups.
- Use dependency caching (e.g., `actions/cache`, `setup-node` cache) to speed up installs.
- Pin action versions to full SHAs, not tags, for security.
- Never store secrets in workflow files — use GitHub Secrets or equivalent.
- If CI breaks the default branch, fix it immediately — a red default branch blocks everyone.
- Repair CI, stale bases, conflicts, branch protection, packaging, and deployment mechanics on the existing originating issue and PR. Do not open a replacement PR or a queue-drain/release-wrapper issue to escape an operational blocker.
- Do not poll ordinary Paperclip review stages, PR-capacity waits, or workspace cleanup. Rely on their owner/blocker/wake path. Use a bounded external-service monitor only for a named transition such as a running CI job, no more often than every 15 minutes unless the issue defines a tighter SLA, with attempt/timeout bounds and comments only on state changes or the terminal checkpoint.
