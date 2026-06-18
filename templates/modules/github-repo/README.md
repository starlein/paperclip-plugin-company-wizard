# Module: github-repo

Enables the Engineer to work in a GitHub repository.

## What it adds

- **Shared docs**: `docs/git-workflow.md` — commit conventions, branch rules
- **Engineer skill**: Git workflow instructions for working in a repo
- **Foundation issue**: `Prepare GitHub repository` is marked critical and ordered before normal implementation work. The assignee verifies an already-provisioned git workspace/remote or creates and pushes the repository before closing it.

## Variants

- **direct-to-base-ref** (default): Engineer works on a feature branch, then merges to the base branch and pushes. No PRs, no code review gate — the engineer merges their own work and hands off to the Product Owner for acceptance review via `in_review` status reassignment. Fast iteration for solo or small teams.
- When combined with `pr-review` module: switches to feature-branch + PR workflow with executionPolicy review stages and a non-author merge gate.

## Best for

- Solo engineer shipping quickly
- Prototypes and MVPs
- Projects where speed > process

## Example

A company building a web app with one engineer. The engineer picks up issues, implements them on feature branches, merges to base, pushes, and reassigns to the Product Owner for acceptance review. CI runs on push.
