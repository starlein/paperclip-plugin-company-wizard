---
name: setup-routines
description: >
  Analyze a Paperclip company's issue history, agent health, recurring failure
  patterns, and project architecture to design and provision tailored routines
  with cron/webhook triggers. Replaces expensive always-on heartbeats with
  targeted, data-driven scheduled runs. Use when setting up routines for a new
  or existing company, or when optimizing token spend on agent heartbeats.
---

# Setup Routines — Data-Driven Routine Provisioning

This skill analyzes a Paperclip company's **actual operational data** to design
routines that match real needs — not generic templates. The goal: replace
expensive always-on heartbeats with targeted routines that fire only when needed.

**Heartbeats cost tokens. Routines save money.**

## Analysis Framework

Before creating a single routine, run the full diagnostic. Each step feeds
signal into the routine design.

### Phase 1: Company Health Snapshot

Pull the dashboard for a quick pulse check.

```bash
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/dashboard" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

Extract:
- **Agent error count** — agents in `error` state need a recovery routine
- **Open vs done ratio** — high open count with low velocity = bottleneck
- **Blocked count** — chronic blockers need an escalation routine
- **Budget utilization** — high utilization = routines must be lean
- **Pending approvals** — stalled approvals need a nudge routine

### Phase 2: Issue Archaeology

Query completed and open issues to find **recurring patterns**.

```bash
# Recent completed issues — look for repeat categories
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/issues?status=done&limit=100" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

# Open issues — find unassigned or stalled work
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/issues?status=todo,in_progress,blocked&limit=50" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

**Pattern mining — look for these signals in issue titles and descriptions:**

| Signal | What to look for | Routine type |
|--------|-----------------|--------------|
| Repeated bug category | Multiple issues with same root cause (e.g., "fix lint", "CI broken", "runtime error") | **Preventive check** — catch before it recurs |
| Unassigned high-priority | `todo` issues with `high`/`critical` priority and no assignee | **Triage routine** for PM/CEO |
| Stalled in-progress | `in_progress` issues with no recent comments/activity | **Stall detector** for CEO |
| Deploy-related issues | Issues mentioning deploy, Railway, Vercel, CI/CD | **Post-deploy verification** with webhook trigger |
| API integration issues | Issues about external API failures, rate limits, auth | **API health check** routine |
| Error/crash issues | Runtime errors, hydration, crashes, 500s | **Runtime health patrol** |
| Security issues | Auth bugs, secrets leaked, CORS, CSP | **Security audit** periodic routine |
| Performance issues | Lighthouse, Core Web Vitals, bundle size | **Performance regression check** |

**Frequency analysis — count issues per category:**

```python
# Mental model for categorization (do this analysis in your head):
# Group done issues by theme:
#   CI/build failures: N issues → if N >= 3, needs a routine
#   Runtime crashes: N issues → if N >= 3, needs a routine
#   API integration: N issues → if N >= 2, needs a routine
#   Deploy issues: N issues → if N >= 2, needs a routine
#   Unassigned backlog: N items → if N >= 3 high-pri, needs triage routine
```

### Phase 3: Agent Diagnostics

```bash
# List agents with status
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/agents" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

Check each agent for:
- **Error state** — needs recovery routine (critical priority)
- **Idle with open assignments** — might be stuck, needs nudge
- **Budget near limit** — routines for this agent should be conservative
- **Role-specific needs** — CEO needs oversight routines, Engineer needs technical checks

### Phase 4: Project & Infrastructure Context

```bash
# Project details including workspace/repo
curl -s "$PAPERCLIP_API_URL/api/projects/{projectId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

Check for:
- **GitHub repo** → can wire webhook triggers for push/PR events
- **Railway/Vercel deployment** → can wire deploy webhook triggers
- **External API dependencies** (Suno, Stripe, etc.) → need health check routines
- **Database** → migration safety checks post-deploy

### Phase 5: Activity Timeline Analysis

```bash
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/activity?limit=50" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

Look for:
- **Activity gaps** — long periods with no activity = agents might be stuck
- **Burst patterns** — many issues created/closed at once = reactive mode (routines should prevent this)
- **Error clusters** — multiple failures in a short window = systemic issue

## Routine Design Rules

### Priority Assignment

| Routine concern | Priority | Rationale |
|----------------|----------|-----------|
| Agent error recovery | `critical` | Dead agents = zero productivity |
| CI/build health | `high` | Broken builds block all deploys |
| Runtime error patrol | `high` | User-facing failures |
| Unassigned high-pri triage | `high` | Blocking features rot in backlog |
| API health check | `medium` | External dependency, catch early |
| Deploy verification | `medium` | Post-deploy safety net |
| Stall detection | `medium` | Prevents silent work stoppage |
| Performance/security audit | `low` | Important but not urgent |
| Backlog grooming | `low` | Housekeeping |

### Schedule Design

| Routine type | Recommended schedule | Why |
|-------------|---------------------|-----|
| Critical recovery | `0 8,12,17 * * 1-5` (3x/day) | Fast recovery from errors |
| Build/CI guard | Webhook on push + `0 10,16 * * 1-5` fallback | Catch failures at source |
| Runtime patrol | `0 */3 * * *` (every 3h) | Catch crashes between deploys |
| Triage | `0 9,14 * * 1-5` (2x/day) | Morning + afternoon assignment windows |
| Deploy verify | Webhook on deploy + `0 11 * * 1-5` fallback | Verify each deploy + daily check |
| API health | `0 9 * * 1-5` (daily) | Morning sanity check |
| Stall detection | `0 10 * * 1,3,5` (3x/week) | Catch multi-day stalls |
| Audit (perf/security) | `0 10 * * 1` (weekly) | Low-urgency, high-value |

### Concurrency Policy Selection

| Routine nature | Policy | Rationale |
|---------------|--------|-----------|
| Health checks, patrols | `skip_if_active` | Idempotent — if already checking, new trigger adds nothing |
| Webhook-driven (each payload matters) | `always_enqueue` | Each push/deploy is a distinct event to verify |
| Triage, grooming | `coalesce_if_active` | Merge overlapping triage windows |

### Trigger Layering

Best practice: **webhook + cron fallback** for event-driven routines.

- Webhook fires immediately on the event (push, deploy, error alert)
- Cron fires daily/periodically as a safety net if webhook misses
- This gives you both real-time response AND guaranteed coverage

## Provisioning Procedure

After analysis, create routines in this order:

1. **Critical first** — agent recovery, CI health
2. **High priority** — runtime patrol, triage
3. **Medium** — API checks, deploy verification
4. **Low** — audits, grooming

For each routine:

```bash
# Step 1: Create the routine
ROUTINE=$(curl -s -X POST "$PAPERCLIP_API_URL/api/companies/{companyId}/routines" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "...",
    "description": "... include specific issue references that motivated this routine ...",
    "assigneeAgentId": "...",
    "projectId": "...",
    "priority": "...",
    "status": "active",
    "concurrencyPolicy": "skip_if_active",
    "catchUpPolicy": "skip_missed"
  }')
ROUTINE_ID=$(echo "$ROUTINE" | jq -r '.id')

# Step 2: Add triggers
# Cron trigger
curl -s -X POST "$PAPERCLIP_API_URL/api/routines/$ROUTINE_ID/triggers" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind": "schedule", "cronExpression": "...", "timezone": "Europe/Amsterdam"}'

# Webhook trigger (if event-driven)
curl -s -X POST "$PAPERCLIP_API_URL/api/routines/$ROUTINE_ID/triggers" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind": "webhook", "signingMode": "bearer"}'

# Step 3: Test with manual run
curl -s -X POST "$PAPERCLIP_API_URL/api/routines/$ROUTINE_ID/run" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual"}'
```

## Routine Description Best Practices

**Always include in the description:**

1. **What** the routine checks/does
2. **Why** it exists — reference specific past issues by identifier (e.g., "Recurring: SUNAA-141, SUNAA-142, SUNAA-143 — lint errors breaking CI pipeline")
3. **What success looks like** — the agent knows when the check passes
4. **What failure triggers** — what should the agent do if the check fails

This context is injected into the agent's heartbeat when the routine fires,
so a well-written description = fewer wasted tokens figuring out what to do.

## Verification Checklist

After provisioning all routines:

```bash
# List all active routines with triggers
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/routines" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

# For each routine, verify triggers exist
curl -s "$PAPERCLIP_API_URL/api/routines/{routineId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"

# Fire a manual test run on the most critical routine
curl -s -X POST "$PAPERCLIP_API_URL/api/routines/{routineId}/run" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual"}'

# Verify the run created an issue
curl -s "$PAPERCLIP_API_URL/api/routines/{routineId}/runs?limit=1" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

## Output Summary Template

After completing setup, report:

```
## Routines Provisioned for {Company}

### Analysis Summary
- Issues analyzed: {N done} + {N open}
- Recurring patterns found: {list}
- Agents in error: {list}
- Unassigned high-priority: {count}

### Routines Created
| # | Title | Agent | Priority | Triggers | Rationale |
|---|-------|-------|----------|----------|-----------|
| 1 | ...   | ...   | ...      | ...      | Based on {issue pattern} |

### Webhook URLs (wire into external services)
- CI guard: POST {url} (GitHub push events)
- Deploy verify: POST {url} (Railway deploy events)

### Token Savings Estimate
- Previous: ~{N} heartbeats/day at ~{cost} tokens each
- Now: ~{N} targeted routine runs/day
- Estimated reduction: {X}%
```

## Ongoing Maintenance

Routines aren't set-and-forget. Review monthly:

1. **Check run history** — routines that never find issues can be reduced in frequency
2. **Check for new patterns** — new recurring issue categories may need new routines
3. **Adjust schedules** — align with team's actual working hours and deploy cadence
4. **Archive stale routines** — if the underlying problem was permanently fixed

```bash
# Quick health check on all routines
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/routines" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '.[] | select(.status=="active") | {title, lastTriggeredAt, lastEnqueuedAt}'
```

## API Quick Reference

| Action | Method | Endpoint |
|--------|--------|----------|
| List routines | GET | `/api/companies/:companyId/routines` |
| Create routine | POST | `/api/companies/:companyId/routines` |
| Update routine | PATCH | `/api/routines/:routineId` |
| Add trigger | POST | `/api/routines/:routineId/triggers` |
| Update trigger | PATCH | `/api/routine-triggers/:triggerId` |
| Delete trigger | DELETE | `/api/routine-triggers/:triggerId` |
| Manual run | POST | `/api/routines/:routineId/run` |
| Run history | GET | `/api/routines/:routineId/runs?limit=50` |
| Fire webhook | POST | `/api/routine-triggers/public/:publicId/fire` |
| Rotate secret | POST | `/api/routine-triggers/:triggerId/rotate-secret` |

## Auth Note (Local Docker)

If calling from outside the container (host machine), you need a board API key.
Generate one via the Paperclip UI or by inserting a hashed key into the
`board_api_keys` table. Agent API keys (`PAPERCLIP_API_KEY`) work from inside
heartbeat runs but agents can only create routines assigned to themselves.
