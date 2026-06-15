# Module: pr-review

Adds a PR-based review workflow with dedicated reviewer roles.

## What it adds

- **Core roles**: Product Owner (approval) and Engineer (final merge gate)
- **Extended roles** *(when present)*: QA (substantive review), Security Engineer (security-relevant review), Code Reviewer/UI/UX/DevOps advisory or domain review when explicitly configured
- **Shared docs**: `docs/pr-conventions.md` — PR format, review workflow, merge rules
- **Engineer skill**: Feature-branch + PR workflow (overrides direct-to-main from `github-repo`)
- **Reviewer skills**: Review checklists for each reviewer role

## Dependencies

- Requires `github-repo` module

## How it works

1. Engineer resolves the project/worktree base ref first from `heartbeat-context` / project workspace metadata and uses it exactly as configured
2. Engineer creates a feature branch (`<prefix>-<N>/<short-description>`) from that base
3. Engineer opens a PR with Conventional Commits title, issue reference, and the matching base branch
4. Engineer sets the originating issue's `executionPolicy`: review stages for QA/domain reviewers as needed, an approval stage for the Product Owner, and a final Engineer merge-gate approval stage (roles resolved to agentIds); the PR link is added as an issue comment
5. QA reviews with executed evidence when present
6. Security Engineer reviews security-relevant changes when present
7. Product Owner reviews for intent alignment, scope discipline, acceptance criteria
8. Code Reviewer and domain reviewers may add advisory PR comments unless explicitly added as executionPolicy participants
9. DevOps reviews infrastructure impact when explicitly added as a stage
10. Engineer merges when all stages are approved (no `changes_requested` outstanding), confirms the PR landed on the correct base, closes/archives any isolated worktree that Paperclip created, and only then records the final approval / closes the issue

## Handover mechanism

The issue's native `executionPolicy` (`review`/`approval` stages). Each reviewer is the active participant of a stage and records an `approved` / `changes_requested` decision through the normal issue update route; Paperclip stores the reviewer/approver audit trail on the issue (`reviewed_by` / `approved_by` metadata where exposed). The decision may be mirrored as a GitHub PR comment. Do not create separate review subissues. If a reviewer doesn't wake, the CEO's stall-detection (if enabled) will catch it.

## Best for

- Teams with multiple engineers
- Projects where quality and correctness matter
- Production systems

## Known limitations

- All agents sharing one GitHub account means GitHub-native approval flow doesn't work. Review governance happens through the issue's executionPolicy stages, not GitHub-required approving reviews.
- If a review stage's participant is not picked up, the CEO's stall-detection (if enabled) should catch it.
