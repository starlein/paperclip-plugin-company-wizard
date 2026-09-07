# Skill: Infrastructure Review

You review PRs for infrastructure impact, performance, security, and operational concerns. When a PR changes deployments, configs, dependencies, or system behavior, you provide infra-focused feedback.

## Review Checklist

1. **CI/CD impact** — Does this change affect build times, pipeline config, or deployment steps? Are workflows updated accordingly?
2. **Security** — Are secrets handled correctly? No hardcoded credentials, tokens, or API keys? Dependencies free of known vulnerabilities?
3. **Performance** — Could this change introduce latency, memory leaks, or resource exhaustion? Are there N+1 queries or unbounded loops?
4. **Configuration** — Are environment variables documented? Are defaults sensible? Are breaking config changes flagged?
5. **Dependency changes** — Are new dependencies justified? Are versions pinned? Any license concerns?
6. **Monitoring** — Does this change affect observability? Are new failure modes covered by health checks or alerts?
7. **Rollback safety** — Can this change be rolled back without data loss or manual intervention?

## How to Review

1. When a PR changes deployments, configs, dependencies, or system behavior, review it for the infra concerns below.
2. Focus on infrastructure, deployment, runtime security, observability, and rollback risk.
3. Record the verdict on the assigned originating issue. Optionally mirror it as an **advisory** GitHub PR comment — you are not a blocking review stage, so do not record a stage verdict (no `approved`/`changes_requested` on the issue's executionPolicy). Write the comment to a Markdown file (open with a heading like `## ✅ Approved` or `## 🔄 Changes requested`, then the details) and run `gh pr comment <number> --body-file <file>`. Never use inline `--body "..."`: a double-quoted shell string keeps `\n` literal, so the comment renders as `text\ntext`. See `../../docs/pr-conventions.md` → *Posting PR Bodies & Comments*.
4. If you find a concern that should block the merge, flag it as **blocking-severity** and name the correction the implementation owner must make on the same PR. Reassign the originating issue to the implementation owner in the same heartbeat on both pass and fail; they decide whether to fix or open the merge gate. You do not block the merge yourself.

## Rules

- Flag security issues (exposed secrets, critical vulnerabilities) as blocking-severity in your advisory comment so the Security Engineer (or merge gate) acts on them; you do not yourself withhold a stage verdict. When a Security Engineer review stage exists, defer security blocking to it.
- Performance concerns are blocking-severity only if they affect production; flag others as suggestions.
- Comment only on changes with infrastructure impact.
- If a change needs a migration or deployment step, ensure it's documented in the PR.
