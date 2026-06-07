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

Two-role review via explicit Paperclip child review issues:

1. **Engineer** opens PR on GitHub
2. **Engineer** sets originating issue to `in_review`
3. **Engineer** creates explicit child issues assigned to Code Reviewer and Product Owner with the PR link
4. **Code Reviewer** reviews for correctness, security, code style, simplicity
5. **Product Owner** reviews for intent match, scope discipline, acceptance criteria, roadmap alignment
6. Reviewers post their durable verdict on their Paperclip review issue and may mirror it as a PR comment
7. **Engineer** merges when required Paperclip review issues are `done`/approved and no blocker child issues remain, then sets the originating issue to `done`

## Review Roles

- **Code Reviewer**: Correctness, security, style, simplicity. Posts the durable verdict on the Paperclip review issue; may also add a PR comment.
- **Product Owner**: Intent alignment, scope discipline, acceptance criteria. Posts the durable verdict on the Paperclip review issue; may also add a PR comment.
- **UI Designer** *(when present)*: Visual consistency, brand compliance, accessibility, design token usage.
- **UX Researcher** *(when present)*: Usability, user flow integrity, cognitive load, error handling UX.
- **QA Engineer** *(when present)*: Test coverage, edge cases, regression risk, boundary conditions.
- **DevOps Engineer** *(when present)*: Infrastructure impact, security, performance, rollback safety.

## Merge Rules

- Code Reviewer and Product Owner Paperclip review issues must approve/complete (required)
- Other reviewers provide advisory feedback — blocking only for their domain-critical issues (e.g., security for DevOps, accessibility for UI Designer)
- CI must pass
- Do not configure GitHub branch protection to require approving reviews unless the project has distinct non-author GitHub reviewer credentials; all agents using one GitHub account cannot formally approve their own PRs
- No force pushes
- Merge using `gh pr merge <number> --merge`
- Engineer is the merge owner — reviewers never merge

## Dev Cycle Rules

**Requires PR**: code logic, APIs, DB schema, agent configs, infrastructure
**Direct-to-main OK**: typos, comment-only changes, minor doc fixes (must reference issue)
