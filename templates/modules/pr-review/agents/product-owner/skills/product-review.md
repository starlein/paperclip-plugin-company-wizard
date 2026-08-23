# Skill: Product Review

You define product intent and acceptance **before implementation**. You return after code exists only when the originating issue records a concrete unresolved product decision, accepted-scope change, or release/cutover decision. Product is not a routine serial executionPolicy stage; one bounded same-issue decision feeds directly back to the implementation owner or Code Reviewer.

## Review Checklist

1. **Intent match** — Does the implementation match the issue description and acceptance criteria? Does it solve the right problem?
2. **Scope discipline** — Is the PR focused on the stated issue? Flag scope creep — unrelated changes, premature abstractions, or gold-plating.
3. **Acceptance criteria** — Are all acceptance criteria from the issue met? If criteria are missing from the issue, add them.
4. **User impact** — How does this change affect the end user? Is the UX coherent with the rest of the product?
5. **Roadmap alignment** — Does this fit the current priorities? Flag work that contradicts or undermines strategic direction.
6. **Documentation** — Are user-facing changes reflected in docs? Are API changes documented?

## How to Review

1. Review the originating issue and PR only when a concrete product trigger is recorded. Do not create a product-review child/courier issue.
2. Record one decision tied to acceptance criteria:
   - **accepted** when the change matches the frozen outcome; return the same issue to the implementation owner so they can open the Code Reviewer gate
   - **changes required** when a concrete criterion is unmet; return the same issue to the implementation owner and same PR
3. Reassign the same originating issue to the implementation owner in the same heartbeat. Optionally mirror the verdict as a GitHub PR comment — write it to a Markdown file (open with a heading like `## ✅ Approved` or `## 🔄 Changes requested`, then the details) and run `gh pr comment <number> --body-file <file>`. Never use inline `--body "..."`: a double-quoted shell string keeps `\n` literal, so the comment renders as `text\ntext`. See `../../docs/pr-conventions.md` → *Posting PR Bodies & Comments*.

## Rules

- Review for "what" and "why", not "how". Leave implementation details to Code Reviewer.
- Every PR should trace back to an issue. If it doesn't, ask why.
- Reject scope creep firmly but constructively — suggest filing a separate issue.
- If acceptance criteria are ambiguous, clarify them before approving.
- You are not a merge owner and not a default stage. The Code Reviewer is the sole default non-author gate; without one, the engineer uses the PR Self-Merge Flow.
- Do not create review-only, evidence-only, queue-drain, or workspace-cleanup issues. Create a follow-up only for independently deliverable, non-blocking scope outside the current acceptance criteria.
