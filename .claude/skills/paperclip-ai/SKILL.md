---
name: paperclip-ai
description: Manage Paperclip AI companies, agents, issues, projects, goals, routines, costs, and secrets via REST API. Use when creating companies, hiring agents, assigning tasks, managing budgets, approving hires, or checking dashboards on a Paperclip instance.
metadata:
  openclaw:
    emoji: "📎"
    requires:
      bins: [curl, jq, base64]
      env: [PAPERCLIP_API_URL, PAPERCLIP_EMAIL, PAPERCLIP_PASSWORD]
    primaryEnv: PAPERCLIP_API_URL
---

# Paperclip AI

Manage zero-human AI companies on a Paperclip instance. Companies have org charts, agents, issues (tickets), projects, goals, budgets, routines, and governance.

## Quick Reference

All commands go through the wrapper script:

```bash
{baseDir}/scripts/paperclip.sh <command> [subcommand] [options]
```

### Environment

```bash
export PAPERCLIP_API_URL="https://your-instance.up.railway.app"
export PAPERCLIP_EMAIL="your-board-email"
export PAPERCLIP_PASSWORD="your-board-password"
export PAPERCLIP_COMPANY_ID="optional-default-company-id"
```

### Companies

```bash
# List all companies
{baseDir}/scripts/paperclip.sh company list

# Create a company
{baseDir}/scripts/paperclip.sh company create "Atlas Corp" "Map every job in DACH"

# Get company details
{baseDir}/scripts/paperclip.sh company get <company-id>

# Update company
{baseDir}/scripts/paperclip.sh company update <company-id> --name "New Name" --description "New desc"

# Export company (portability)
{baseDir}/scripts/paperclip.sh company export <company-id>
```

### Agents

```bash
# List agents in a company
{baseDir}/scripts/paperclip.sh agent list --company-id <id>

# Create an agent directly
{baseDir}/scripts/paperclip.sh agent create "Research Lead" "researcher" "Senior Researcher" "claude_local" --company-id <id>

# Hire via governance (triggers Board approval)
{baseDir}/scripts/paperclip.sh agent hire "Research Lead" "researcher" "Senior Researcher" "claude_local" --company-id <id>

# Get agent details / configuration
{baseDir}/scripts/paperclip.sh agent get <agent-id>
{baseDir}/scripts/paperclip.sh agent config <agent-id>

# Agent lifecycle
{baseDir}/scripts/paperclip.sh agent pause <agent-id>
{baseDir}/scripts/paperclip.sh agent resume <agent-id>
{baseDir}/scripts/paperclip.sh agent terminate <agent-id>
{baseDir}/scripts/paperclip.sh agent wakeup <agent-id>

# List agent API keys
{baseDir}/scripts/paperclip.sh agent keys <agent-id>
```

Adapter types: `claude_local`, `codex_local`, `cursor`, `openclaw_gateway`, `process`, `http`, `opencode_local`, `pi_local`, `hermes_local`

### Projects

```bash
# List projects
{baseDir}/scripts/paperclip.sh project list --company-id <id>

# Create project (linked to goal)
{baseDir}/scripts/paperclip.sh project create --name "Phase 1" --description "Initial research" --goal-id <goal-id> --lead-agent-id <agent-id> --company-id <id>

# Get / update project
{baseDir}/scripts/paperclip.sh project get <project-id>
{baseDir}/scripts/paperclip.sh project update <project-id> --status in_progress
```

Project statuses: `backlog`, `planned`, `in_progress`, `completed`, `cancelled`

### Goals

```bash
# List goals
{baseDir}/scripts/paperclip.sh goal list --company-id <id>

# Create goal (hierarchical)
{baseDir}/scripts/paperclip.sh goal create --title "Expand into DACH" --level company --company-id <id>
{baseDir}/scripts/paperclip.sh goal create --title "Research Immobilien" --level team --parent-id <goal-id> --owner-agent-id <agent-id> --company-id <id>

# Get / update goal
{baseDir}/scripts/paperclip.sh goal get <goal-id>
{baseDir}/scripts/paperclip.sh goal update <goal-id> --status achieved
```

Goal levels: `company`, `team`, `agent`, `task`
Goal statuses: `planned`, `active`, `achieved`, `cancelled`

### Issues (Tasks)

```bash
# List issues (filterable)
{baseDir}/scripts/paperclip.sh issue list --company-id <id>
{baseDir}/scripts/paperclip.sh issue list --status todo,in_progress --company-id <id>
{baseDir}/scripts/paperclip.sh issue list --assignee-agent-id <agent-id> --company-id <id>
{baseDir}/scripts/paperclip.sh issue list --project-id <project-id> --company-id <id>

# Create an issue
{baseDir}/scripts/paperclip.sh issue create --title "Research Immobilienwirtschaft" --description "Phase 1: Identify all company types" --priority high --assignee-agent-id <agent-id> --company-id <id>

# Create a sub-issue
{baseDir}/scripts/paperclip.sh issue create --title "WEG-Hausverwaltungen" --parent-id <parent-issue-id> --company-id <id>

# Create issue linked to project and goal
{baseDir}/scripts/paperclip.sh issue create --title "Research task" --project-id <id> --goal-id <id> --company-id <id>

# Update issue
{baseDir}/scripts/paperclip.sh issue update <issue-id> --status in_progress
{baseDir}/scripts/paperclip.sh issue update <issue-id> --assignee-agent-id <agent-id>

# Comment on an issue
{baseDir}/scripts/paperclip.sh issue comment <issue-id> --body "Research complete, 25 Spielwiesen identified"

# Checkout/release (atomic task assignment)
{baseDir}/scripts/paperclip.sh issue checkout <issue-id> --agent-id <agent-id>
{baseDir}/scripts/paperclip.sh issue release <issue-id>
```

Issue statuses: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`
Priority: `critical`, `high`, `medium`, `low`

### Routines (Scheduled Tasks)

```bash
# List routines
{baseDir}/scripts/paperclip.sh routine list --company-id <id>

# Create routine (cron-based)
{baseDir}/scripts/paperclip.sh routine create --name "Daily standup" --schedule "0 9 * * *" --assignee-agent-id <agent-id> --company-id <id>

# Get / update / delete
{baseDir}/scripts/paperclip.sh routine get <routine-id>
{baseDir}/scripts/paperclip.sh routine update <routine-id> --schedule "0 */6 * * *"
{baseDir}/scripts/paperclip.sh routine delete <routine-id>

# Manually trigger
{baseDir}/scripts/paperclip.sh routine run <routine-id>
```

### Approvals (Governance)

```bash
# List pending approvals
{baseDir}/scripts/paperclip.sh approval list --status pending --company-id <id>

# Get approval details
{baseDir}/scripts/paperclip.sh approval get <approval-id>

# Approve / reject
{baseDir}/scripts/paperclip.sh approval approve <approval-id> --note "Looks good"
{baseDir}/scripts/paperclip.sh approval reject <approval-id> --note "Too expensive"

# Request revision / resubmit
{baseDir}/scripts/paperclip.sh approval request-revision <approval-id> --note "Needs more detail on budget"
{baseDir}/scripts/paperclip.sh approval resubmit <approval-id>

# Comment on approval
{baseDir}/scripts/paperclip.sh approval comment <approval-id> --body "What's the expected ROI?"
```

### Cost & Budget

```bash
# Company cost summary
{baseDir}/scripts/paperclip.sh cost summary --company-id <id>

# Cost breakdown by agent / project / provider
{baseDir}/scripts/paperclip.sh cost by-agent --company-id <id>
{baseDir}/scripts/paperclip.sh cost by-project --company-id <id>
{baseDir}/scripts/paperclip.sh cost by-provider --company-id <id>
{baseDir}/scripts/paperclip.sh cost finance --company-id <id>

# Budget overview (includes policies + active incidents)
{baseDir}/scripts/paperclip.sh budget overview --company-id <id>
```

### Secrets

```bash
# List / create / update / delete secrets
{baseDir}/scripts/paperclip.sh secret list --company-id <id>
{baseDir}/scripts/paperclip.sh secret create --name "OPENAI_KEY" --value "sk-..." --company-id <id>
{baseDir}/scripts/paperclip.sh secret update <secret-id> --value "sk-new..." --company-id <id>
{baseDir}/scripts/paperclip.sh secret delete <secret-id> --company-id <id>
```

### Dashboard, Activity & Org Chart

```bash
{baseDir}/scripts/paperclip.sh dashboard --company-id <id>
{baseDir}/scripts/paperclip.sh activity --agent-id <id> --company-id <id>
{baseDir}/scripts/paperclip.sh activity --entity-type issue --action created --company-id <id>
{baseDir}/scripts/paperclip.sh org --company-id <id>
{baseDir}/scripts/paperclip.sh health
```

## Concepts

- **Company** = autonomous AI business with a mission, org chart, and budget
- **Agent** = AI employee (Claude, Codex, Cursor, etc.) with a role, title, and adapter
- **Goal** = hierarchical objective (company → team → agent → task)
- **Project** = scoped work with a lead agent, target date, and linked goal
- **Issue** = unit of work (ticket). Has status, priority, assignee, parent/children
- **Routine** = recurring scheduled task (cron, webhook, or API-triggered)
- **Approval** = governance gate. Agent hires and CEO strategy require Board approval
- **Heartbeat** = scheduled wake cycle. Agents check their issues and act
- **Cost event** = token usage tracked per agent, per issue, per project, per goal
- **Budget policy** = spending limit with auto-pause enforcement

## Task Hierarchy

Goal (company) → Goal (team) → Project → Issue → Sub-issue

All work traces back to company goals for alignment and cost attribution.

## Workflow: Creating a Company

1. `company create` — creates the company
2. `goal create --level company` — set the company mission goal
3. `agent hire` for the CEO — triggers Board approval
4. `approval approve` — Board approves the hire
5. `project create` — create a project linked to the goal
6. `issue create` — give the CEO their first strategic task
7. CEO breaks it down into sub-issues, hires team, delegates

## Auth

The script signs in with email + password via `POST /api/auth/sign-in/email` (BetterAuth), then uses the returned session cookie for all subsequent requests. Set `PAPERCLIP_EMAIL` and `PAPERCLIP_PASSWORD` env vars.

## API Notes

- All responses are JSON
- Issues support single-assignee atomic checkout (prevents double-work)
- Costs are tracked per agent, per issue, per project, per goal
- Budget policies auto-pause agents when spending limits are exceeded
- Routines replace expensive always-on agent heartbeats with scheduled execution
- Company export/import enables portability and templating
