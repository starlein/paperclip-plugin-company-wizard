# Skill: QA Review

In standard PR review, you are the QA executionPolicy review stage when present and not the author. If `docs/lean-delivery.md` exists, you instead provide **bounded QA evidence on the originating issue** only for a concrete browser, integration, release, cutover, or regression risk; you are not a serial default executionPolicy stage in that mode. Review is by *doing*, not by reading: your verdict must rest on tests that actually ran.

## How you verify

Run the smallest tests that prove coverage and the triggered risk. If required company CI is green on the exact reviewed head, cite it and do not repeat the complete suite. Without CI, record focused QA evidence and leave the complete local gate to the merge owner; do not duplicate it. Beyond green/red, ensure the tests *mean something*:
- New code paths and edge cases are covered by tests you ran.
- Tests assert behavior, not implementation.
- Regression risk is covered.
Record a bounded pass/fail verdict on the originating issue. If coverage is inadequate, return that same issue to the implementation owner with the specific missing cases.

**Required CI available:** confirm the exact-head required checks and add only the focused evidence the risk trigger needs. **Without required CI:** run the relevant local checks, expanding to the complete local gate only when you are the only available verifier. Existing required repository checks remain binding without the `ci-cd` module; only optional, non-required checks are advisory.

Replace `<branch>` with the PR branch name and substitute your project's actual test and build commands:

```bash
git fetch origin && git checkout <branch>
<the project's test command>   # e.g. pnpm test, pytest, go test ./...
<the project's build command>  # e.g. pnpm build
```

Record a bounded `pass` comment only if the checks pass and coverage is adequate; otherwise record a bounded `fail` comment with the failing output and gaps. In lean delivery, these are evidence comments, not `approved` / `changes_requested` executionPolicy verdicts; return the issue as described below. In standard mode, record the corresponding verdict only when QA is the active stage participant.

## Review checklist

1. **Test coverage** — new code paths and edge cases covered?
2. **Regression risk** — could this break existing behavior? Is the affected area covered?
3. **Error handling** — failure modes handled and tested?
4. **Boundary conditions** — empty/null/max/concurrent inputs respected?
5. **Data validation** — input validated at boundaries; API contracts enforced?
6. **Test quality** — tests assert behavior; readable and maintainable?
7. **Manual test plan** — for hard-to-automate changes, is a manual plan documented in the PR?

## How to record your verdict

1. Work on the originating issue carrying the PR link and either an active QA stage (standard mode) or explicit QA trigger (lean mode); do not create a QA-only child/courier issue.
2. **Standard active QA stage:** record `approved` or `changes_requested` with exact-head evidence through the executionPolicy and let Paperclip route the next action. Do not manually reassign or close the issue. **Lean/advisory handoff:** record concise evidence and a pass/fail verdict, then reassign the same originating issue to the implementation owner in the same heartbeat. On failure, name the exact correction required on the same PR. On pass, the implementation owner opens the Code Reviewer merge gate (or takes the documented self-merge path); QA is never inserted as a serial policy stage in lean delivery.
3. Optionally mirror the verdict as a GitHub PR comment via a Markdown file: open with a heading (`## ✅ Approved` / `## 🔄 Changes requested`), then details, and run `gh pr comment <number> --body-file <file>`. Never inline `--body "..."` — a double-quoted shell string keeps `\n` literal. See `../../docs/pr-conventions.md` → *Posting PR Bodies & Comments*.

## Rules

- A verdict that does not cite exact-head verification is invalid.
- Be constructive — suggest specific test cases, don't just say "needs more tests".
- Flag untested critical paths as blockers; untested non-critical paths as suggestions.
- Approve trivial changes (docs, comments, config) without ceremony.
- Do not create review-only, evidence-only, status-repair, or workspace-cleanup issues.
