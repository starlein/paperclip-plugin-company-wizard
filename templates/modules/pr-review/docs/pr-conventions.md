# PR Conventions

## Branch Naming

```
<prefix>-<N>/<short-description>
```

Where `<prefix>` is the company issue prefix (lowercase) and `<N>` is the issue number.

Examples: `yes-6/add-auth-endpoint`, `yes-12/fix-game-loop`

## PR Title

Use Conventional Commits format:

```
<type>: <short description>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`

Rules: lowercase after colon, no period, under 72 chars.

## PR Body Template

```markdown
## What changed
<Brief description of the changes>

## Why
<Motivation and context>

## How to test
<Steps to verify the changes>

## Related
Closes [PREFIX-N]
```

## Posting PR Bodies & Comments

Always pass Markdown through a **file** (`--body-file`), never an inline `--body "..."`. A double-quoted shell argument does **not** turn `\n` into a real newline, so an inline body renders on GitHub as literal `text\ntext\ntext` instead of formatted Markdown. Write the body to a file first:

```bash
# Real newlines + full Markdown (headings, lists, code blocks) preserved.
cat > /tmp/pr-body.md <<'EOF'
## What changed
...
EOF

gh pr create  --title "<type>: <description>" --body-file /tmp/pr-body.md
gh pr comment <number> --body-file /tmp/pr-body.md
```

Every PR comment opens with a Markdown heading stating the verdict (`## ✅ Approved`, `## 🔄 Changes requested`, or `## 💬 Review notes`), followed by a short summary and bullet points or code blocks.

## Labels

Apply one primary label: `feature`, `bug`, `docs`, `chore`, `infra`, `agent`.

## Review Workflow

Review runs through the issue's native `executionPolicy` (stages), not separate child issues. The gate is **executed verification, not opinion**.

1. **Engineer** opens the PR on GitHub and adds the PR link as an issue comment.
2. **Engineer** sets the originating issue's `executionPolicy` stages, in order:
   - a `review` stage for **QA** when a QA agent is on the team (test adequacy / running the tests),
   - a `review` stage for the **Security Engineer** *only when the change is security-relevant* (auth, secrets, input boundaries, crypto, dependencies, infra exposure),
   - an `approval` stage for the **Product Owner** (intent, scope, acceptance),
   - a final `approval` stage for the **Engineer** as the merge gate.
   Resolve each role to its agentId.
3. **Engineer** sets the issue to `in_review`.
4. **QA** (when present) reviews and records `approved`/`changes_requested` with executed evidence (see *Merge Rules*).
5. **Security Engineer** (when present as a stage) probes the security-relevant change and records a verdict stating what was checked.
6. **Code Reviewer** and other domain reviewers may add **advisory, non-blocking** PR comments. They do not gate the merge.
7. **Product Owner** reviews for intent match, scope discipline, and acceptance criteria, and records the `approval` verdict.
8. **Engineer** owns the final `approval` stage (merge gate): once reviewers and the Product Owner have approved, the engineer satisfies the hard gate (CI green, or runs the tests/build and pastes the output), merges the PR, confirms the merge landed, and only then records `approved` — which closes the issue to `done`. The merge must happen before the issue is `done`.

## Review Roles

- **QA** (`review` stage, when present): the substantive gate. Test coverage, regression risk, and validation — backed by tests that actually ran.
- **Security Engineer** (`review` stage, only when the change is security-relevant): probes the diff for injection, auth, secrets, crypto, dependency, and exposure issues.
- **Product Owner** (`approval` stage): intent alignment, scope discipline, acceptance criteria.
- **Engineer** (`approval` stage, last): the merge gate and hard-gate backstop — see *Merge Rules*.
- **Code Reviewer / domain reviewers** (advisory): optional, non-blocking comments on correctness, clarity, design, accessibility, UX. They never gate the merge.

## Merge Rules

The hard gate is **executed verification**, enforced on the Engineer's merge-gate stage and independent of which reviewers are present:

- **With CI:** CI (lint/test/build) must be **green** before the Engineer merges. This is machine-verified and cannot be skipped.
- **Without CI:** the Engineer must run the full test suite and build locally and paste the real output into the merge-gate verdict before merging. (When QA is present, QA already produced this evidence; the Engineer confirms it.)
- A verdict that does not cite executed verification — green CI, or pasted test/build output — is not valid.
- The Product Owner's `approval` stage must be approved.
- QA's `review` stage (when present) and the Security Engineer's `review` stage (when added) must be approved.
- The Code Reviewer and other domain reviewers are advisory — blocking only when they escalate a concern that QA, the Security Engineer, or the Engineer then acts on.
- No force pushes.
- Merge using `gh pr merge <number> --merge`.
- The Engineer is the merge owner — reviewers never merge.
- The engineer's merge gate must be the **last** `approval` stage. If the Product Owner's approval were last, it would auto-close the issue to `done` and the merge would be skipped, leaving the PR open on GitHub.
- Do not configure GitHub branch protection to require approving reviews unless the project has distinct non-author GitHub reviewer credentials; all agents using one GitHub account cannot formally approve their own PRs.

## Dev Cycle Rules

**Requires PR**: code logic, APIs, DB schema, agent configs, infrastructure
**Direct-to-main OK**: typos, comment-only changes, minor doc fixes (must reference issue)
