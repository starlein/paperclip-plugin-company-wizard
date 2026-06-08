# PR Conventions

## Branch Naming

```
<prefix>-<N>/<short-description>
```

Where `<prefix>` is the company issue prefix (lowercase) and `<N>` is the issue number.

Examples: `yes-6/add-auth-endpoint`, `yes-12/fix-game-loop`

## PR Title

Use Conventional Commits format:

```
<type>: <short description>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`

Rules: lowercase after colon, no period, under 72 chars.

## PR Body Template

```markdown
## What changed
<Brief description of the changes>

## Why
<Motivation and context>

## How to test
<Steps to verify the changes>

## Related
Closes [PREFIX-N]
```

## Labels

Apply one primary label: `feature`, `bug`, `docs`, `chore`, `infra`, `agent`.

## Review Workflow

Review runs through the issue's native `executionPolicy` (stages), not separate child issues:

1. **Engineer** opens the PR on GitHub.
2. **Engineer** sets the originating issue's `executionPolicy`: a `review` stage for the Code Reviewer, optional `review` stages for relevant domain reviewers (UI Designer / UX Researcher / QA / DevOps), and a final `approval` stage for the Product Owner. Reviewer/approver roles are resolved to agentIds. The PR link is added as an issue comment.
3. **Engineer** sets the originating issue to `in_review`.
4. **Code Reviewer** reviews for correctness, security, code style, simplicity and records `approved` / `changes_requested` on the review stage.
5. **Domain reviewers** (when present as stages) review their concern and record their verdict.
6. **Product Owner** reviews for intent match, scope discipline, acceptance criteria, and records the final `approval` verdict.
7. Verdicts are recorded on the stages and may be mirrored as PR comments.
8. **Engineer** merges when all stages are approved (no `changes_requested` outstanding), then sets the originating issue to `done`.

## Review Roles

- **Code Reviewer** (`review` stage): Correctness, security, style, simplicity.
- **Domain reviewers** (`review` stages, when relevant): UI Designer (visual/brand/accessibility), UX Researcher (flows/usability), QA (coverage/regression), DevOps (infra/security/rollback).
- **Product Owner** (`approval` stage): Intent alignment, scope discipline, acceptance criteria — the final sign-off.

Reviewers may also add a PR comment, but GitHub-native approving reviews require distinct non-author GitHub credentials and are optional.

## Merge Rules

- Code Reviewer `review` stage and Product Owner `approval` stage must be approved (required)
- Other reviewers provide advisory feedback — blocking only for their domain-critical issues (e.g., security for DevOps, accessibility for UI Designer)
- CI must pass
- Do not configure GitHub branch protection to require approving reviews unless the project has distinct non-author GitHub reviewer credentials; all agents using one GitHub account cannot formally approve their own PRs
- No force pushes
- Merge using `gh pr merge <number> --merge`
- Engineer is the merge owner — reviewers never merge

## Dev Cycle Rules

**Requires PR**: code logic, APIs, DB schema, agent configs, infrastructure
**Direct-to-main OK**: typos, comment-only changes, minor doc fixes (must reference issue)
