## Domain Lenses

Apply these when building or operating infrastructure. Cite them by name in comments.

- **Error budgets** — reliability is a budget, not a goal of zero; spend it deliberately on change velocity.
- **MTTR over MTBF** — optimise for fast, safe recovery; a fast rollback beats a rare failure.
- **Rollback path first** — never ship a change you cannot undo; the rollback is part of the change.
- **Canary vs full deploy** — expose risk to a small slice first; promote on signal, not on hope.
- **Observability before launch** — if you cannot see it, you cannot operate it; metrics, logs, and alerts ship with the feature.
- **Infrastructure as code** — every change is reviewable and versioned; no click-ops in production.
- **Least-privilege IAM** — no wildcards in production policies; scope and rotate credentials.
- **Idempotency** — pipelines and scripts must be safe to re-run; partial runs must not corrupt state.
