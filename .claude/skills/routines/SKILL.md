---
name: routines
description: >
  Set up and manage Paperclip Routines — recurring scheduled tasks that replace
  expensive always-on heartbeats. Use to create cron-based, webhook-triggered,
  or API-triggered routines for agents, reducing token spend while keeping agents
  responsive. Covers routine CRUD, triggers, concurrency policies, and
  suggested routine patterns for common agent roles.
---

# Routines — Recurring Agent Tasks

Routines are Paperclip's scheduling primitive. Instead of agents burning tokens on
timer heartbeats polling for work, routines fire **only when needed** — on a cron
schedule, webhook, or explicit API call — and create a targeted heartbeat run for
the assigned agent.

## Why Routines > Always-On Heartbeats

| Approach | Token cost | Responsiveness |
|----------|-----------|----------------|
| Heartbeat every 5 min | ~288 runs/day, most idle | High but wasteful |
| Routines (cron + webhook) | Only fires when scheduled or triggered | Same responsiveness, fraction of the cost |

The key insight: **clean up heartbeats = token reducing = cheaper**.

## Quick Start

### 1. Find your IDs

```bash
# Company ID
curl -s "$PAPERCLIP_API_URL/api/agents/me" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '.companyId, .id'

# Agents in company
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/agents" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '.[] | {id, name, role}'

# Projects
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/projects" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '.[] | {id, name}'
```

### 2. Create a routine

```bash
curl -s -X POST "$PAPERCLIP_API_URL/api/companies/{companyId}/routines" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Daily standup check",
    "description": "CEO reviews all in_progress issues and nudges stalled agents",
    "assigneeAgentId": "{ceo-agent-id}",
    "projectId": "{project-id}",
    "priority": "medium",
    "status": "active",
    "concurrencyPolicy": "skip_if_active",
    "catchUpPolicy": "skip_missed"
  }'
```

### 3. Add a cron trigger

```bash
curl -s -X POST "$PAPERCLIP_API_URL/api/routines/{routineId}/triggers" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "schedule",
    "cronExpression": "0 9 * * 1-5",
    "timezone": "Europe/Amsterdam"
  }'
```

### 4. Or add a webhook trigger (for external events)

```bash
curl -s -X POST "$PAPERCLIP_API_URL/api/routines/{routineId}/triggers" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "webhook",
    "signingMode": "bearer"
  }'
```

The response includes a `publicId` and signing secret. External systems POST to:
`POST /api/routine-triggers/public/{publicId}/fire`

### 5. Manual run (testing)

```bash
curl -s -X POST "$PAPERCLIP_API_URL/api/routines/{routineId}/run" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source": "manual"}'
```

## Suggested Routine Patterns

### CEO Agent

| Routine | Schedule | Why |
|---------|----------|-----|
| Morning standup | `0 9 * * 1-5` | Review stalled issues, nudge idle agents, check backlog health |
| End-of-day wrap | `0 17 * * 1-5` | Summarize progress, update roadmap, plan tomorrow |
| Weekly retro | `0 10 * * 1` | Run retrospective, check velocity trends |
| Backlog grooming | `0 14 * * 3` | Ensure 3+ unassigned issues exist, create from roadmap if needed |

### Engineer Agent

| Routine | Schedule | Why |
|---------|----------|-----|
| PR check | `0 */4 * * 1-5` | Check for review comments, merge approved PRs |
| CI/deploy monitor | webhook | Trigger on GitHub Actions / Railway deploy events |
| Dependency audit | `0 10 * * 1` | Weekly check for outdated/vulnerable deps |

### PM Agent

| Routine | Schedule | Why |
|---------|----------|-----|
| Triage new issues | `0 9,14 * * 1-5` | Prioritize and assign incoming issues |
| Sprint review | `0 16 * * 5` | Friday sprint summary |
| Stakeholder update | `0 11 * * 3` | Mid-week status digest |

### Cross-cutting

| Routine | Schedule | Why |
|---------|----------|-----|
| GitHub webhook relay | webhook | On push/PR events, wake the engineer |
| Sentry/error alert relay | webhook | On new error, wake the engineer |
| Daily backup verification | `0 3 * * *` | Verify latest DB backup is fresh |

## Concurrency Policies

Choose based on routine behavior:

| Policy | Use when |
|--------|----------|
| `coalesce_if_active` (default) | Idempotent checks — if agent is already running, the new trigger adds nothing |
| `skip_if_active` | Same as coalesce but cleaner — just drop it |
| `always_enqueue` | Every trigger matters (e.g., each webhook payload is unique work) |

## Catch-Up Policies

| Policy | Use when |
|--------|----------|
| `skip_missed` (default) | Agent was down; the missed check isn't worth running late |
| `enqueue_missed_with_cap` | Missed runs should still execute (e.g., missed deploy checks) |

## Managing Routines

```bash
# List all routines
curl -s "$PAPERCLIP_API_URL/api/companies/{companyId}/routines" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '.[] | {id, title, status, assigneeAgentId}'

# Pause a routine
curl -s -X PATCH "$PAPERCLIP_API_URL/api/routines/{routineId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'

# Resume
curl -s -X PATCH "$PAPERCLIP_API_URL/api/routines/{routineId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'

# Archive (permanent)
curl -s -X PATCH "$PAPERCLIP_API_URL/api/routines/{routineId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "archived"}'

# Check run history
curl -s "$PAPERCLIP_API_URL/api/routines/{routineId}/runs?limit=10" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" | jq '.[] | {id, status, createdAt}'

# Update trigger schedule
curl -s -X PATCH "$PAPERCLIP_API_URL/api/routine-triggers/{triggerId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cronExpression": "0 10 * * 1-5"}'

# Disable a trigger without deleting
curl -s -X PATCH "$PAPERCLIP_API_URL/api/routine-triggers/{triggerId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Delete a trigger
curl -s -X DELETE "$PAPERCLIP_API_URL/api/routine-triggers/{triggerId}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

## Webhook Integration Examples

### GitHub → Engineer wake on push

1. Create routine with webhook trigger
2. In GitHub repo settings → Webhooks, add:
   - URL: `{PAPERCLIP_PUBLIC_URL}/api/routine-triggers/public/{publicId}/fire`
   - Content type: `application/json`
   - Events: Push, Pull request
   - Secret: the signing secret from trigger creation

### Railway → Engineer wake on deploy

Same pattern — Railway supports deploy webhooks that POST to your routine trigger URL.

## Agent Access Rules

| Operation | Agent (own) | Agent (other) | Board |
|-----------|-------------|---------------|-------|
| List / Get | yes | yes (read-only) | yes |
| Create | yes (self-assign only) | no | yes |
| Update | yes | no | yes |
| Triggers CRUD | yes | no | yes |
| Manual run | yes | no | yes |
| Reassign | no | no | yes |

## Migration: Heartbeat → Routines

To convert an always-on heartbeat agent to routine-based:

1. **Identify the agent's recurring tasks** from their HEARTBEAT.md
2. **Create a routine for each distinct recurring concern** (standup, triage, deploy check, etc.)
3. **Add appropriate triggers** — cron for time-based, webhook for event-based
4. **Reduce or stop the heartbeat interval** — routines handle the scheduling now
5. **Keep one low-frequency fallback heartbeat** (e.g., every 2 hours) as a safety net for anything routines don't cover
6. **Monitor run history** to verify routines fire correctly before fully removing heartbeats

## Full API Reference

See `skills/paperclip/references/api-reference.md` for the complete endpoint list and
the Routines API doc at `docs/api/routines.md` in the Paperclip source.
