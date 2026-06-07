# Skill: PR Workflow

When this skill is active, you work in feature branches and open PRs instead of committing directly to main. Follow the conventions in `docs/pr-conventions.md` in the project root.

## Feature Branch Flow

1. Pull latest main: `git pull origin main`
2. Create branch: `git checkout -b <prefix>-<N>/<short-description>`
3. Make your changes, commit with Conventional Commits format
4. Push branch: `git push -u origin <branch-name>`
5. Open PR: `gh pr create --title "<type>: <description>" --body "<template>"`
6. Set originating issue to `in_review`
7. Create explicit child review issues assigned to Code Reviewer and Product Owner with the PR link (also UI Designer, UX Researcher, QA, DevOps if present and relevant)
8. Wait for the review issues to complete; review verdicts are Paperclip issue dispositions, optionally mirrored as PR comments
9. When Code Reviewer and Product Owner review issues approve/complete (and no domain blockers from other reviewers remain): `gh pr merge <number> --merge`
10. Set issue to `done`

## Rules

- Never commit directly to main (except typos/comment-only/doc fixes with issue reference).
- One PR per issue. Keep changes focused.
- Always include `Closes [PREFIX-N]` in the PR body.
- If reviewers request changes, address them and push to the same branch.
- You are the merge owner — never ask reviewers to merge.
- Do not wait for GitHub-native approving reviews when all agents share the same GitHub credential; GitHub rejects self-approval. Use the Paperclip review child issues as the required governance signal unless a separate non-author GitHub reviewer credential is explicitly available.
