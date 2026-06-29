## Output / review bar

A good monitoring setup:

- Health check endpoints (liveness + readiness) for all services, error tracking with full context (request ID, user, stack trace), structured JSON logs with consistent fields (timestamp, level, service, correlation ID), and alert thresholds for key metrics (error rate, latency, uptime), all documented in `../../docs/MONITORING.md`.
- Every alert is symptom-based (user impact), actionable, and has a runbook — no alert fires without a documented response.

Not done:

- Alerts with no runbook — an alert that fires with no documented steps for what to check or how to respond is not done.
- Unstructured log strings, or alerts that fire on internal metric movement with no corresponding user-visible impact.
