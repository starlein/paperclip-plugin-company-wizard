# Module: github-repo

Enables the Engineer to work in a GitHub repository.

## What it adds

- **Shared docs**: `docs/git-workflow.md` — commit conventions, branch rules
- **Engineer skill**: Git workflow instructions for working in a repo

## Variants

- **direct-to-main** (default): Engineer commits directly on main. No branches, no PRs. Fast iteration for solo engineer setups.
- When combined with `pr-review` module: switches to feature-branch workflow automatically.

## Best for

- Solo engineer shipping quickly
- Prototypes and MVPs
- Projects where speed > process

## Example

A company building a web app with one engineer. The engineer picks up issues, implements them, commits to main, and marks the issue done. CI runs on push.
