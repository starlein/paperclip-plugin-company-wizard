# Module: pr-review

Adds PR-based review with role-based executionPolicy stages. Select the optional `lean-delivery` module during setup to use one merge gate and risk-triggered specialist evidence instead.

## What it adds

- **Core role**: Code Reviewer (the final executionPolicy stage and non-author merge gate)
- **Extended roles** *(when present)*: QA review, Security review for security-relevant changes, then Product Owner approval; UI/UX and DevOps advisory. Lean delivery replaces QA/Security/Product stages with triggered evidence before the merge gate.
- **Shared docs**: `docs/pr-conventions.md`. Only selecting `lean-delivery` adds the binding `docs/lean-delivery.md` contract.
- **Engineer skill**: Feature-branch + PR workflow (overrides direct-to-base-ref from `github-repo`)
- **Reviewer skills**: Review checklists for each reviewer role, plus the Code Reviewer's merge-gate skill

## Dependencies

- Requires `github-repo` module

## How it works

1. Engineer resolves the project/worktree base ref first from `heartbeat-context` / project workspace metadata and uses it exactly as configured
2. Engineer creates a feature branch (`<prefix>-<N>/<short-description>`) from that base
3. Engineer opens a PR with Conventional Commits title, issue reference, and the matching base branch
4. Engineer sets the selected `executionPolicy`: standard QA → Security (when triggered) → Product → Code Reviewer, omitting absent roles; lean delivery uses only the Code Reviewer. The author is never a participant. Without an eligible non-author Code Reviewer, set no stages and self-merge.
5. Standard review stages advance through native verdicts. In lean delivery, acceptance is frozen before implementation and triggered specialists return bounded evidence to the implementation owner before review begins, rather than forming a serial chain.
6. The Code Reviewer verifies the exact head/base and required company CI. Green CI is authoritative, so only a focused risk check is added; the complete local gate runs once only when CI is unavailable.
7. Corrections return to the implementation owner on the same issue, branch, and PR. Technical defects never route to the board user.
8. The Code Reviewer merges, confirms the target base, leaves workspace lifecycle to Paperclip, then records approval / closes the issue.

## Handover mechanism

The issue's native `executionPolicy` ends with a Code Reviewer approval/merge stage. In standard mode, QA/Security/Product record verdicts only on their active stages and Paperclip wakes the next participant. In lean delivery, those specialists return the issue by assignment to the implementation owner before the sole merge stage. Evidence and corrections stay on the same originating issue and PR. Board interactions are reserved for genuine human decisions.

## Best for

- Teams with multiple engineers
- Projects where quality and correctness matter
- Production systems

## Known limitations

- All agents sharing one GitHub account means GitHub-native approval flow doesn't work. Review governance happens through the issue's executionPolicy stages, not GitHub-required approving reviews.
- If a review stage's participant is not picked up, the CEO's stall-detection (if enabled) should catch it.
