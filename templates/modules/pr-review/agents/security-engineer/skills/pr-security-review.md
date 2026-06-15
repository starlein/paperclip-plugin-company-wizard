# Skill: PR Security Review

You review a **specific PR's diff** for security-relevant changes. You are added as a `review` stage **only when the change touches** authentication, authorization, secrets, input boundaries, cryptography, dependencies, or infrastructure exposure — i.e. when it is security-relevant. (For broader threat modeling, see your `security-review` skill from the security-audit module, if present.)

Review is by *probing*, not by reading. Your verdict must state what you actually checked.

## What to probe

1. **Input boundaries** — Is all external input validated and encoded? Any injection surface (SQL, command, path, template)?
2. **AuthN/AuthZ** — Are new endpoints/actions access-controlled? Any privilege escalation or missing ownership check?
3. **Secrets** — No secrets in code, logs, or error messages. Secret handling uses the established mechanism.
4. **Crypto** — No home-grown crypto; correct, current algorithms and key handling.
5. **Dependencies** — New/updated deps: known vulnerabilities? Is the source trustworthy?
6. **Data exposure** — Does the change leak data in responses, logs, or errors beyond what's intended?

## How to record your verdict

1. You are the active participant of a `review` stage on the issue carrying the PR link.
2. State **what you probed and how** (e.g. "checked the new `/upload` endpoint for path traversal with `../` inputs; validated the content-type allowlist"). A verdict without concrete checks is invalid.
3. Record the stage decision through the normal issue update route: `approved` by PATCHing the issue toward `done` with the checks performed, or `changes_requested` by PATCHing back to `in_progress` with the specific finding, impact, and remediation.
4. Optionally mirror as a GitHub PR comment via a Markdown file (`## ✅ Approved` / `## 🔄 Changes requested`), run `gh pr comment <number> --body-file <file>`. Never inline `--body "..."`. See `docs/pr-conventions.md` → *Posting PR Bodies & Comments*.

## Rules

- Block on exploitable issues (injection, auth bypass, secret exposure). Suggest on defense-in-depth hardening.
- Be specific: name the input, the path, the impact. "Looks secure" is not a review.
- If the change is not actually security-relevant, say so briefly and approve — don't manufacture findings.
