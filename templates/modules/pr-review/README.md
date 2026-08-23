# Module: pr-review

Adds a lean PR-based review workflow with one default non-author merge gate and risk-triggered specialist evidence.

## What it adds

- **Core role**: Code Reviewer (the sole default executionPolicy stage and non-author merge gate)
- **Extended roles** *(when present)*: Product Owner defines acceptance before implementation; QA, Security, UI/UX, and DevOps provide bounded evidence only for recorded risk triggers
- **Shared docs**: `docs/pr-conventions.md` and binding `docs/lean-delivery.md`
- **Engineer skill**: Feature-branch + PR workflow (overrides direct-to-base-ref from `github-repo`)
- **Reviewer skills**: Review checklists for each reviewer role, plus the Code Reviewer's merge-gate skill

## Dependencies

- Requires `github-repo` module

## How it works

1. Engineer resolves the project/worktree base ref first from `heartbeat-context` / project workspace metadata and uses it exactly as configured
2. Engineer creates a feature branch (`<prefix>-<N>/<short-description>`) from that base
3. Engineer opens a PR with Conventional Commits title, issue reference, and the matching base branch
4. Engineer sets exactly one `executionPolicy` approval stage: the Code Reviewer merge gate. The author is never a participant.
5. Product acceptance was already frozen before implementation. Triggered QA, Security, UI/UX, Product, or DevOps work records one bounded verdict on the originating issue; specialists are not a serial chain.
6. The Code Reviewer verifies the exact head/base and required company CI. Green CI is authoritative, so only a focused risk check is added; the complete local gate runs once only when CI is unavailable.
7. Corrections return to the implementation owner on the same issue, branch, and PR. Technical defects never route to the board user.
8. The Code Reviewer merges, confirms the target base, leaves workspace lifecycle to Paperclip, then records approval / closes the issue.

## Handover mechanism

The issue's native `executionPolicy` contains one Code Reviewer approval stage. Specialist evidence, CI repair, merge-conflict repair, and corrections stay on the same originating issue and PR. Do not create separate review, evidence, merge, queue-drain, status-repair, or workspace-cleanup subissues. Board interactions are reserved for irreducible product, legal, licensing, or residual-risk decisions.

## Best for

- Teams with multiple engineers
- Projects where quality and correctness matter
- Production systems

## Known limitations

- All agents sharing one GitHub account means GitHub-native approval flow doesn't work. Review governance happens through the issue's executionPolicy stages, not GitHub-required approving reviews.
- If a review stage's participant is not picked up, the CEO's stall-detection (if enabled) should catch it.
