## Output / review bar

A good CI/CD setup:

- A working pipeline with a CI stage (lint → typecheck → test on every PR and push to the default branch) and a CD stage (deploy on merge to the default branch, smoke tests after deployment), documented in `docs/CI-CD.md` with status badges in the README.
- Pipelines complete in under 5 minutes (dependency caching in place), action versions pinned to full SHAs, and all secrets stored in GitHub Secrets or equivalent — none in workflow files.

Not done:

- A pipeline with no rollback path — deploying with no documented procedure for reverting a bad release or re-running the previous successful build is not done.
- A pipeline that breaks the default branch and is not fixed immediately, or one that stores secrets directly in the workflow YAML.
