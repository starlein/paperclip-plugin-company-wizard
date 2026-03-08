# CI/CD Pipeline

## Pipeline Overview

_Describe the CI/CD setup, tooling (e.g., GitHub Actions), and overall strategy._

## CI Workflow

Runs on: _PRs and pushes to main_

| Stage      | Trigger             | What it does                        |
|------------|---------------------|-------------------------------------|
| Lint       | _PR, push to main_  | _Run linter (e.g., ESLint)_        |
| Test       | _PR, push to main_  | _Run test suite_                    |
| Build      | _PR, push to main_  | _Compile/typecheck the project_     |

## CD Workflow

Runs on: _merge to main_

| Stage      | Trigger             | What it does                        |
|------------|---------------------|-------------------------------------|
| Deploy     | _merge to main_     | _Deploy to target environment_      |
| Smoke Test | _after deploy_      | _Verify deployment is healthy_      |

## Environment Variables

| Variable   | Where set           | Purpose                             |
|------------|---------------------|-------------------------------------|
| _VAR_NAME_ | _GitHub Secrets_    | _Description_                       |

## Deployment Targets

- **Production**: _URL or environment description_
- **Staging**: _URL or environment description (if applicable)_

## Rollback Procedure

1. _Identify the failing deployment_
2. _Revert the merge commit or re-deploy the previous known-good commit_
3. _Verify rollback via smoke tests_
4. _Investigate root cause before re-deploying the fix_
