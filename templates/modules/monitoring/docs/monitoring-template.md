# Monitoring

## Observability Strategy

_Describe the overall approach to observability for this project. What are the critical paths? What does "healthy" look like? What are the known failure modes?_

## Health Checks

| Endpoint | Interval | Expected Response |
|----------|----------|-------------------|
| _/healthz_ | _30s_ | _200 OK_ |
| _/readyz_ | _30s_ | _200 OK_ |
| _..._ | _..._ | _..._ |

## Error Tracking

_Describe how errors are captured, where they are reported, and how they are triaged. Include the tool/service used (e.g., Sentry, Datadog, custom) and any filtering or grouping rules._

## Logging

_Describe the structured logging format and conventions._

All logs must be structured JSON with at minimum:
- `timestamp` — ISO 8601
- `level` — debug, info, warn, error
- `service` — the emitting service name
- `correlationId` — request or trace ID for linking related log entries
- _...additional fields as needed..._

## Alerting Rules

| Metric | Threshold | Action |
|--------|-----------|--------|
| _Error rate_ | _> 1% over 5 min_ | _Page on-call engineer_ |
| _P95 latency_ | _> 2s over 5 min_ | _Page on-call engineer_ |
| _Health check failure_ | _3 consecutive failures_ | _Page on-call engineer_ |
| _..._ | _..._ | _..._ |

## Dashboards

_List the dashboards and what each one covers. One dashboard per concern._

- _API Performance_ — _request rate, latency percentiles, error rate_
- _Infrastructure_ — _CPU, memory, disk, network_
- _Business Metrics_ — _sign-ups, active users, key conversion events_
- _..._
