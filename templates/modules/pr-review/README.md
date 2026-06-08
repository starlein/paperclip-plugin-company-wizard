# Module: pr-review

Adds a PR-based review workflow with dedicated reviewer roles.

## What it adds

- **Core roles**: Code Reviewer, Product Owner (required reviewers)
- **Extended roles** *(when present)*: UI Designer (design review), UX Researcher (UX review), QA (quality review), DevOps (infra review)
- **Shared docs**: `docs/pr-conventions.md` — PR format, review workflow, merge rules
- **Engineer skill**: Feature-branch + PR workflow (overrides direct-to-main from `github-repo`)
- **Reviewer skills**: Review checklists for each reviewer role

## Dependencies

- Requires `github-repo` module

## How it works

1. Engineer creates a feature branch (`<prefix>-<N>/<short-description>`)
2. Engineer opens a PR with Conventional Commits title and issue reference
3. Engineer sets the originating issue's `executionPolicy`: a `review` stage for the Code Reviewer, optional `review` stages for relevant domain reviewers, and a final `approval` stage for the Product Owner (roles resolved to agentIds); the PR link is added as an issue comment
4. Code Reviewer reviews for correctness, security, style, simplicity
5. Product Owner reviews for intent alignment, scope discipline, acceptance criteria
6. UI Designer reviews for visual consistency, brand compliance *(when present)*
7. UX Researcher reviews for usability and user flow integrity *(when present)*
8. QA reviews for test coverage, edge cases, regression risk *(when present)*
9. DevOps reviews for infrastructure impact, security, performance *(when present)*
10. Engineer merges when all stages are approved (no `changes_requested` outstanding)

## Handover mechanism

The issue's native `executionPolicy` (`review`/`approval` stages). Each reviewer is the active participant of a stage and records an `approved` / `changes_requested` verdict, optionally mirrored as a GitHub PR comment. If a reviewer doesn't wake, the CEO's stall-detection (if enabled) will catch it.

## Best for

- Teams with multiple engineers
- Projects where quality and correctness matter
- Production systems

## Known limitations

- All agents sharing one GitHub account means GitHub-native approval flow doesn't work. Review governance happens through the issue's executionPolicy stages, not GitHub-required approving reviews.
- If a review stage's participant is not picked up, the CEO's stall-detection (if enabled) should catch it.
