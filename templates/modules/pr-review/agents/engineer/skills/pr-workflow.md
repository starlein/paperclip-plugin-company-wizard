# Skill: PR Workflow

When this skill is active, you work in feature branches and open PRs instead of committing directly to main. Follow the conventions in `docs/pr-conventions.md` in the project root.

## Feature Branch Flow

1. Pull latest main: `git pull origin main`
2. Create branch: `git checkout -b <prefix>-<N>/<short-description>`
3. Make your changes, commit with Conventional Commits format
4. Push branch: `git push -u origin <branch-name>`
5. Open PR: `gh pr create --title "<type>: <description>" --body "<template>"`
6. Set the originating issue's `executionPolicy` to gate the merge on review:
   - One `review` stage with the **Code Reviewer** as participant (always).
   - Additional `review` stages for any relevant domain reviewer that exists in the team (UI Designer for UI diffs, UX Researcher for flow changes, QA for logic/test-sensitive changes, DevOps for infra/deploy/dependency changes).
   - A final `approval` stage with the **Product Owner** as participant (always).
   - Resolve each role to its agentId first (look up active agents), then set the policy on the issue. Include the PR link in an issue comment so reviewers can find it.
7. Move the originating issue to `in_review`.
8. Wait for the issue to clear its stages. Each reviewer records `approved` or `changes_requested` on their stage; verdicts may be mirrored as PR comments.
9. When all stages are approved (no `changes_requested` outstanding): `gh pr merge <number> --merge`, then set the issue to `done`.

## Rules

- Never commit directly to main (except typos/comment-only/doc fixes with issue reference).
- One PR per issue. Keep changes focused.
- Always include `Closes [PREFIX-N]` in the PR body.
- If a reviewer requests changes, address them, push to the same branch, and re-request review (the stage re-runs).
- You are the merge owner — never ask reviewers to merge.
- Do not create separate child review issues and do not use @-mentions to request review; the executionPolicy stages are the governance signal.
- Do not wait for GitHub-native approving reviews when all agents share the same GitHub credential; GitHub rejects self-approval. The Paperclip executionPolicy stages are the required signal unless a separate non-author GitHub reviewer credential is explicitly available.
