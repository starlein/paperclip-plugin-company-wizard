# Skill: PR Workflow

When this skill is active, you work in feature branches and open PRs instead of committing directly to the base ref. Follow the conventions in `docs/pr-conventions.md` in the project root.

## Feature Branch Flow

1. Resolve the project/worktree base ref from the issue's `heartbeat-context` / project workspace metadata before branching. Use the configured `repoRef`, `defaultRef`, or `executionWorkspacePolicy.workspaceStrategy.baseRef` exactly as Paperclip provides it. Never guess from your shell's current branch and never rewrite the configured ref to `main`, `master`, or `origin/*`. If no base ref is configured anywhere, use the repository's actual default branch — whatever `origin/HEAD` points at, regardless of name (`main`/`master`/`trunk`/…); fall back to `main` then `master` only if the remote advertises no default HEAD. See `docs/git-workflow.md` → *Resolving the default branch*. Never hard-code `main`.
2. Fetch and update the base:
   - external: `git fetch origin`, then branch from the configured base ref
   - local: update from the configured local branch
3. Create branch from that base: `git checkout -b <prefix>-<N>/<short-description> <base-ref>`
4. **Verify you are on the feature branch** before making changes: `git branch --show-current` must print your branch name, not the base ref. If it prints the base ref name, you forgot step 3 — create the branch now.
5. Make your changes, commit with Conventional Commits format
6. **Verify the current branch one more time**, then push: `git push -u origin <branch-name>`. The branch name in the push command must match `git branch --show-current`. Never push the base ref as a feature branch — if `git branch --show-current` returns the base ref name, stop and create a feature branch first.
7. Open PR against the same resolved base: derive the GitHub base branch from the configured ref (for example, strip the remote prefix only when the ref is remote-tracking), write the body (PR Body Template in `docs/pr-conventions.md`) to a file, then `gh pr create --base <github-base-branch> --head <branch-name> --title "<type>: <description>" --body-file <file>`. Never inline `--body "..."` — a double-quoted shell string keeps `\n` literal and the PR renders as `text\ntext` (see *Posting PR Bodies & Comments*).
8. **Register the PR as a Paperclip work product** so it is visible on the issue and board (creating it on GitHub alone does not surface it in Paperclip):
   ```
   POST /api/issues/{issueId}/work-products
   Headers: Authorization: Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
   {
     "type": "pull_request",
     "provider": "github",
     "externalId": "<PR number>",
     "url": "<full PR URL>",
     "title": "<PR title>",
     "status": "ready_for_review",
     "isPrimary": true
   }
   ```
   `title` and `url` are required (`url` must be the full PR URL). If the issue runs in an isolated worktree, also pass `"executionWorkspaceId"` from `heartbeat-context`. When the PR later merges, update it with `PATCH /api/work-products/{id}` and `"status": "merged"`.
9. **Only if a code-reviewer is present on the team:** Set the originating issue's `executionPolicy` to gate the merge on review, ending with the Code Reviewer as the merge gate. If no code-reviewer is assigned to this company, skip steps 9–11 entirely and go directly to the self-merge path at step 12. Setting up executionPolicy stages without an eligible non-author merge gate will stall the issue permanently (`422 No eligible approval participant`).
   - One `review` stage with **QA** when a QA agent exists (test adequacy / executed verification).
   - One `review` stage with the **Security Engineer** only when the change is security-relevant (auth, secrets, input boundaries, crypto, dependencies, infra exposure).
   - Domain reviewers (UI Designer, UX Researcher, DevOps) are advisory — they post PR comments and may flag a concern for QA, the Security Engineer, or the merge gate to act on. They are never themselves a review stage.
   - An `approval` stage with the **Product Owner** when a Product Owner is on the team — the product sign-off. If no Product Owner is present, omit this stage.
   - A final `approval` stage with the **Code Reviewer** as participant — the **merge gate**. The Code Reviewer is woken *last*, after every reviewer and the Product Owner have cleared, to satisfy the hard verification gate and merge the PR. If the team has no Code Reviewer, do not set executionPolicy stages at all — use the self-merge path at step 12 instead.
   - **Never list yourself (the issue's executor) as a participant in any stage.** Paperclip excludes the original executor to prevent self-review; a stage whose only participant is you has no eligible participant and the issue stalls in `in_review` forever (`422 No eligible approval participant is configured for this issue`).
   - Resolve each role to its agentId first (look up active agents), then set the policy on the issue. Include the PR link in an issue comment so reviewers can find it.
10. Move the originating issue to `in_review`.
11. Wait for the issue to clear its review/approval stages. Each reviewer and the Product Owner records `approved` by PATCHing the issue toward `done`, or `changes_requested` by PATCHing it back to `in_progress`; Paperclip stores the reviewer/approver decision metadata on the issue. Verdicts may be mirrored as PR comments. A `changes_requested` routes the issue back to you — address it, push to the same branch, and that stage re-runs.
12. **Merging the PR — two paths:**
    - **Code Reviewer present (PR-Gate mode):** You do not merge your own PR. The Code Reviewer (the non-author merge gate) lands it after every prior stage approves, satisfies the hard verification gate (green CI or pasted test/build output), and records the final `approved` that closes the issue to `done`. Your job is to respond to `changes_requested`: when a stage routes the issue back to you, address the feedback, push to the same branch, and the stage re-runs. If `changes_requested` is due to a merge conflict (the Code Reviewer will say so), see *Resolving merge conflicts* below.
    - **No code-reviewer present (PR Self-Merge Flow):** You already skipped steps 9–11. Before merging, check `gh pr view <N> --json mergeable,mergeStateStatus` — if the PR is `CONFLICTING` or `DIRTY`, resolve the conflict first (see *Resolving merge conflicts* below). Then merge: `gh pr merge <N> --merge` once CI is green (or you have pasted test/build output if no CI). All other review roles (qa, product-owner, security-engineer, ui-designer, ux-researcher, devops) may leave advisory comments on the PR, but none block the merge — there are no executionPolicy stages. Update the Paperclip work product to `"status": "merged"` and archive any isolated worktree.

## Resolving merge conflicts

When `gh pr merge` fails or `gh pr view` reports `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY`:

1. `git fetch origin`
2. `git checkout <branch-name>`
3. `git rebase origin/<base-ref>` — resolve all conflicts, then `git rebase --continue`
4. Run the full check suite (lint, typecheck, tests) to confirm nothing broke.
5. `git push --force-with-lease origin <branch-name>`
6. Confirm the PR is no longer conflicting: `gh pr view <N> --json mergeable` should return `MERGEABLE`.
7. Leave an issue comment noting the rebase, then continue with the merge step.

Never leave a PR with unresolved conflicts without either resolving them or explicitly routing the issue back (`changes_requested`) with a comment explaining the blocker. A dirty PR sitting in `in_review` stalls the entire chain.

## Rules

- Never commit directly to the base ref (except typos/comment-only/doc fixes with issue reference).
- One PR per issue. Keep changes focused.
- Always include `Closes [PREFIX-N]` in the PR body.
- If a reviewer requests changes, address them, push to the same branch, and re-request review (the stage re-runs).
- When a code-reviewer is present: the Code Reviewer is the merge owner; you cannot merge your own PR (Paperclip excludes the executor). When no code-reviewer is present: you are the merge owner; skip executionPolicy stages and merge via `gh pr merge <N> --merge` yourself.
- Before creating a PR, verify the PR base matches the configured project/worktree base. If the base is wrong, retarget the PR before review.
- **The merge gate must be the last stage, and it must be a non-author.** The Product Owner's `approval` is the product sign-off, not the final stage: if it were last, their verdict would auto-close the issue to `done` with the PR still open on GitHub. Append a final merge-gate `approval` stage for the **Code Reviewer** after the Product Owner's. Never make yourself the merge gate — Paperclip excludes the executor, so that stage stalls with `422 No eligible approval participant`. If no Code Reviewer is on the team, do not set executionPolicy stages; use the self-merge path instead.
- Do not create separate child review issues and do not use @-mentions to request review; the executionPolicy stages are the governance signal.
- Do not wait for GitHub-native approving reviews when all agents share the same GitHub credential; GitHub rejects self-approval. The Paperclip executionPolicy stages are the required signal unless a separate non-author GitHub reviewer credential is explicitly available.
- Post-merge cleanup of any isolated execution workspace belongs to the merge-gate agent (they archive it from `heartbeat-context` when landing the PR). You only clean up your own worktree if you abandon a branch or the issue is cancelled before review. If this issue runs in the shared project workspace, do not invent isolated-worktree cleanup.
- **Never push the base ref as if it were a feature branch.** Before `git push -u origin <branch-name>`, confirm that `git branch --show-current` matches `<branch-name>`. If it prints the base ref name instead, you are on the wrong branch — create or switch to the feature branch first.
