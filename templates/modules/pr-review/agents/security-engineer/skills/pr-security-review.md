# Skill: PR Security Review

You review a **specific PR's diff** only when the originating issue records a concrete security trigger: authentication, authorization, tenant/data scope, secrets, input boundaries, cryptography, dependencies, infrastructure exposure, or sensitive egress. You provide one bounded advisory verdict on the originating issue; you are not a serial default executionPolicy stage.

Review is by *probing*, not by reading. Your verdict must state what you actually checked.

## What to probe

1. **Input boundaries** — Is all external input validated and encoded? Any injection surface (SQL, command, path, template)?
2. **AuthN/AuthZ** — Are new endpoints/actions access-controlled? Any privilege escalation or missing ownership check?
3. **Secrets** — No secrets in code, logs, or error messages. Secret handling uses the established mechanism.
4. **Crypto** — No home-grown crypto; correct, current algorithms and key handling.
5. **Dependencies** — New/updated deps: known vulnerabilities? Is the source trustworthy?
6. **Data exposure** — Does the change leak data in responses, logs, or errors beyond what's intended?

## How to record your verdict

1. Work on the originating issue carrying the PR link and recorded security trigger. Do not create a security-review child/courier issue.
2. State **what you probed and how** (e.g. "checked the new `/upload` endpoint for path traversal with `../` inputs; validated the content-type allowlist"). A verdict without concrete checks is invalid.
3. Record one bounded pass/fail verdict, then reassign the same originating issue to the implementation owner in the same heartbeat. Blocking in-scope findings name the exact correction required on the same branch and PR; a pass lets the implementation owner open the Code Reviewer gate. Specialists do not hand the issue to one another.
4. Optionally mirror as a GitHub PR comment via a Markdown file (`## ✅ Approved` / `## 🔄 Changes requested`), run `gh pr comment <number> --body-file <file>`. Never inline `--body "..."`. See `../../docs/pr-conventions.md` → *Posting PR Bodies & Comments*.

## Rules

- Block on exploitable issues (injection, auth bypass, secret exposure). Suggest on defense-in-depth hardening.
- Be specific: name the input, the path, the impact. "Looks secure" is not a review.
- If the change is not actually security-relevant, say so briefly and approve — don't manufacture findings.
- Create a follow-up only for independently deliverable, non-blocking work outside the current acceptance criteria. Never create review-only, evidence-only, or workspace-cleanup issues.
