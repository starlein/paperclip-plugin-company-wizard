# Skill: PR Workflow

When this skill is active, you work in feature branches and open PRs instead of committing directly to main. Follow the conventions in `docs/pr-conventions.md` in the project root.

## Feature Branch Flow

1. Pull latest main: `git pull origin main`
2. Create branch: `git checkout -b <prefix>-<N>/<short-description>`
3. Make your changes, commit with Conventional Commits format
4. Push branch: `git push -u origin <branch-name>`
5. Open PR: `gh pr create --title "<type>: <description>" --body "<template>"`
6. Set the originating issue's `executionPolicy` to gate the merge on review, ending with your own merge gate:
   - One `review` stage with the **Code Reviewer** as participant (always).
   - Additional `review` stages for any relevant domain reviewer that exists in the team (UI Designer for UI diffs, UX Researcher for flow changes, QA for logic/test-sensitive changes, DevOps for infra/deploy/dependency changes).
   - An `approval` stage with the **Product Owner** as participant (always) — the product sign-off.
   - A final `approval` stage with **yourself (the Engineer)** as participant — the **merge gate**. This stage exists so you are woken *last*, after every reviewer and the Product Owner have cleared, to perform the merge.
   - Resolve each role to its agentId first (look up active agents), then set the policy on the issue. Include the PR link in an issue comment so reviewers can find it.
7. Move the originating issue to `in_review`.
8. Wait for the issue to clear its review/approval stages. Each reviewer and the Product Owner records `approved` or `changes_requested`; verdicts may be mirrored as PR comments. A `changes_requested` routes the issue back to you — address it, push to the same branch, and that stage re-runs.
9. When the issue reaches your final **merge gate** stage (you are the current participant and every prior stage is approved): run `gh pr merge <number> --merge`, confirm the merge landed, **then** record `approved` on your stage — that closes the issue to `done`. Never record `approved` before the merge has actually succeeded, and never set the issue to `done` with the PR still open.

## Rules

- Never commit directly to main (except typos/comment-only/doc fixes with issue reference).
- One PR per issue. Keep changes focused.
- Always include `Closes [PREFIX-N]` in the PR body.
- If a reviewer requests changes, address them, push to the same branch, and re-request review (the stage re-runs).
- You are the merge owner — never ask reviewers to merge.
- **Your merge gate must be the last stage.** The Product Owner's `approval` is the product sign-off, not the final stage. If it were last, their verdict would auto-close the issue to `done` and you would never be woken to merge — leaving the PR open on GitHub. Always append your own merge-gate `approval` stage after the Product Owner's, and do the merge there before recording your verdict.
- Do not create separate child review issues and do not use @-mentions to request review; the executionPolicy stages are the governance signal.
- Do not wait for GitHub-native approving reviews when all agents share the same GitHub credential; GitHub rejects self-approval. The Paperclip executionPolicy stages are the required signal unless a separate non-author GitHub reviewer credential is explicitly available.
