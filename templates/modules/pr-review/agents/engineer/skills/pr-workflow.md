# Skill: PR Workflow

When this skill is active, you work in feature branches and open PRs instead of committing directly to main. Follow the conventions in `docs/pr-conventions.md` in the project root.

## Feature Branch Flow

1. Resolve the project/worktree base ref from the issue's `heartbeat-context` / project workspace metadata before branching. Use the configured `repoRef`, `defaultRef`, or `executionWorkspacePolicy.workspaceStrategy.baseRef` exactly as Paperclip provides it. Never guess from your shell's current branch and never rewrite the configured ref to `main`, `master`, or `origin/*`.
2. Fetch and update the base:
   - external: `git fetch origin`, then branch from the configured base ref
   - local: update from the configured local branch
3. Create branch from that base: `git checkout -b <prefix>-<N>/<short-description> <base-ref>`
4. Make your changes, commit with Conventional Commits format
5. Push branch: `git push -u origin <branch-name>`
6. Open PR against the same resolved base: derive the GitHub base branch from the configured ref (for example, strip the remote prefix only when the ref is remote-tracking), write the body (PR Body Template in `docs/pr-conventions.md`) to a file, then `gh pr create --base <github-base-branch> --head <branch-name> --title "<type>: <description>" --body-file <file>`. Never inline `--body "..."` — a double-quoted shell string keeps `\n` literal and the PR renders as `text\ntext` (see *Posting PR Bodies & Comments*).
7. Set the originating issue's `executionPolicy` to gate the merge on review, ending with your own merge gate:
   - One `review` stage with **QA** when a QA agent exists (test adequacy / executed verification).
   - One `review` stage with the **Security Engineer** only when the change is security-relevant (auth, secrets, input boundaries, crypto, dependencies, infra exposure).
   - Additional `review` stages only for domain reviewers that should block this specific change. Code Reviewer and other specialists are advisory by default unless explicitly configured as participants.
   - An `approval` stage with the **Product Owner** as participant (always) — the product sign-off.
   - A final `approval` stage with **yourself (the Engineer)** as participant — the **merge gate**. This stage exists so you are woken *last*, after every reviewer and the Product Owner have cleared, to perform the merge.
   - Resolve each role to its agentId first (look up active agents), then set the policy on the issue. Include the PR link in an issue comment so reviewers can find it.
8. Move the originating issue to `in_review`.
9. Wait for the issue to clear its review/approval stages. Each reviewer and the Product Owner records `approved` by PATCHing the issue toward `done`, or `changes_requested` by PATCHing it back to `in_progress`; Paperclip stores the reviewer/approver decision metadata on the issue. Verdicts may be mirrored as PR comments. A `changes_requested` routes the issue back to you — address it, push to the same branch, and that stage re-runs.
10. When the issue reaches your final **merge gate** stage (you are the current participant and every prior stage is approved): run `gh pr merge <number> --merge`, confirm the merge landed into the configured project base, then close/archive the isolated execution workspace if one exists and close-readiness allows it. **Only after merge and workspace close/cleanup succeeds** record `approved` on your stage — that closes the issue to `done`. Never record `approved` before the merge has actually succeeded, and never set the issue to `done` with the PR still open or an execution workspace still active.

## Rules

- Never commit directly to main (except typos/comment-only/doc fixes with issue reference).
- One PR per issue. Keep changes focused.
- Always include `Closes [PREFIX-N]` in the PR body.
- If a reviewer requests changes, address them, push to the same branch, and re-request review (the stage re-runs).
- You are the merge owner — never ask reviewers to merge.
- Before creating a PR or merging, verify the PR base matches the configured project/worktree base. If the base is wrong, retarget the PR before review/merge.
- **Your merge gate must be the last stage.** The Product Owner's `approval` is the product sign-off, not the final stage. If it were last, their verdict would auto-close the issue to `done` and you would never be woken to merge — leaving the PR open on GitHub. Always append your own merge-gate `approval` stage after the Product Owner's, and do the merge there before recording your verdict.
- Do not create separate child review issues and do not use @-mentions to request review; the executionPolicy stages are the governance signal.
- Do not wait for GitHub-native approving reviews when all agents share the same GitHub credential; GitHub rejects self-approval. The Paperclip executionPolicy stages are the required signal unless a separate non-author GitHub reviewer credential is explicitly available.
- If Paperclip created an isolated execution workspace for this issue, do not leave it behind. Use the current execution workspace id from `heartbeat-context`, check close-readiness, and archive it after the PR is merged and the tree is clean. If archive/cleanup is blocked, leave the issue `blocked` or `in_review` with the exact cleanup blocker instead of marking `done`. If this issue runs in the shared project workspace, do not invent isolated-worktree cleanup.
