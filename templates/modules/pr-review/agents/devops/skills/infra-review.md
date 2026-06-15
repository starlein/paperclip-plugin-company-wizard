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

1. When you are the active participant of a review stage on an issue with a PR link, review the PR.
2. Focus on infrastructure, deployment, runtime security, observability, and rollback risk.
3. Record your verdict through the normal issue update route for your review stage:
   - **approved** if operationally sound
   - **changes_requested** with specific concerns if not
4. Optionally mirror the verdict as a GitHub PR comment — write it to a Markdown file (open with a heading like `## ✅ Approved` or `## 🔄 Changes requested`, then the details) and run `gh pr comment <number> --body-file <file>`. Never use inline `--body "..."`: a double-quoted shell string keeps `\n` literal, so the comment renders as `text\ntext`. See `docs/pr-conventions.md` → *Posting PR Bodies & Comments*.

## Rules

- Security issues are always blockers — never approve PRs with exposed secrets or critical vulnerabilities.
- Performance concerns are blockers only if they affect production. Flag others as suggestions.
- Approve changes with no infrastructure impact without comment.
- If a change needs a migration or deployment step, ensure it's documented in the PR.
