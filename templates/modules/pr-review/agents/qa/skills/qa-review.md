# Skill: QA Review

You are the **substantive review gate** for pull requests. Review is by *doing*, not by reading: your verdict must rest on tests that actually ran. "Looks good" is not a review.

## How you verify

**You run the tests yourself — always.** There is no machine arbiter you can defer to: check out the branch, run the full test suite and the build locally, and paste the **real command output** into your stage-record verdict. A verdict without execution output is invalid. Beyond green/red, ensure the tests *mean something*:
- New code paths and edge cases are covered by tests you ran.
- Tests assert behavior, not implementation.
- Regression risk is covered.
Record `approved` only when your executed tests pass AND coverage is adequate. If coverage is inadequate, record `changes_requested` with the specific missing test cases — even if everything is green.

**Company-owned CI/CD (`ci-cd` module active):** in addition to your own executed verification, confirm the company's CI (lint/test/build) is green — both the build and test jobs. **Without a company CI/CD module:** treat any pre-existing repo checks as advisory signals only; your pasted local output is the gate — do not block solely on an external check the company never configured.

Replace `<branch>` with the PR branch name and substitute your project's actual test and build commands:

```bash
git fetch origin && git checkout <branch>
<the project's test command>   # e.g. pnpm test, pytest, go test ./...
<the project's build command>  # e.g. pnpm build
```

Record `approved` only if the suite and build pass and coverage is adequate; otherwise `changes_requested` with the failing output and the gaps.

## Review checklist

1. **Test coverage** — new code paths and edge cases covered?
2. **Regression risk** — could this break existing behavior? Is the affected area covered?
3. **Error handling** — failure modes handled and tested?
4. **Boundary conditions** — empty/null/max/concurrent inputs respected?
5. **Data validation** — input validated at boundaries; API contracts enforced?
6. **Test quality** — tests assert behavior; readable and maintainable?
7. **Manual test plan** — for hard-to-automate changes, is a manual plan documented in the PR?

## How to record your verdict

1. You are the active participant of a `review` stage on the issue carrying the PR link.
2. Record on your stage through the normal issue update route: `approved` (with the evidence — commands + results) by PATCHing toward `done`, or `changes_requested` (with specific gaps and suggested test cases) by PATCHing back to `in_progress`.
3. Optionally mirror the verdict as a GitHub PR comment via a Markdown file: open with a heading (`## ✅ Approved` / `## 🔄 Changes requested`), then details, and run `gh pr comment <number> --body-file <file>`. Never inline `--body "..."` — a double-quoted shell string keeps `\n` literal. See `docs/pr-conventions.md` → *Posting PR Bodies & Comments*.

## Rules

- A verdict that does not cite executed verification (CI green, or your pasted test/build output) is invalid.
- Be constructive — suggest specific test cases, don't just say "needs more tests".
- Flag untested critical paths as blockers; untested non-critical paths as suggestions.
- Approve trivial changes (docs, comments, config) without ceremony.
- If CI is missing or broken, that is a blocker — tests that don't run don't count.
