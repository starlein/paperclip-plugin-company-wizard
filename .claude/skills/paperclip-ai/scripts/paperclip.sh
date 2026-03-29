#!/usr/bin/env bash
# paperclip.sh — CLI wrapper for the Paperclip AI REST API
# Usage: paperclip.sh <command> [options]
#
# Env vars (required):
#   PAPERCLIP_API_URL      — Base URL (e.g. https://your-instance.up.railway.app)
#   PAPERCLIP_EMAIL        — Board user email
#   PAPERCLIP_PASSWORD     — Board user password
#
# Env vars (optional):
#   PAPERCLIP_COMPANY_ID   — Default company ID (can override per command with --company-id)

set -euo pipefail

API_URL="${PAPERCLIP_API_URL:?Set PAPERCLIP_API_URL}"
EMAIL="${PAPERCLIP_EMAIL:?Set PAPERCLIP_EMAIL}"
PASSWORD="${PAPERCLIP_PASSWORD:?Set PAPERCLIP_PASSWORD}"
COMPANY_ID="${PAPERCLIP_COMPANY_ID:-}"
SESSION_COOKIE=""

# --- helpers ---

sign_in() {
  local header_file http_code
  header_file=$(mktemp)
  trap "rm -f '$header_file'" RETURN
  http_code=$(curl -sS -o /dev/null -D "$header_file" -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "Origin: ${API_URL}" \
    -d "$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" '{email: $e, password: $p}')" \
    "${API_URL}/api/auth/sign-in/email") || true
  if [[ "$http_code" -ge 400 ]] && [[ "$http_code" != "302" ]]; then
    echo "Error: sign-in failed (HTTP ${http_code})" >&2
    return 1
  fi
  # Extract session cookies from Set-Cookie headers
  SESSION_COOKIE=$(grep -i '^set-cookie:' "$header_file" \
    | sed 's/^[Ss]et-[Cc]ookie: *//; s/;.*//' \
    | tr '\n' '; ' | sed 's/; $//')
  if [[ -z "$SESSION_COOKIE" ]]; then
    echo "Error: sign-in succeeded but no session cookie received" >&2
    return 1
  fi
}

api() {
  local method="$1" path="$2"
  shift 2
  # Sign in on first API call
  if [[ -z "$SESSION_COOKIE" ]]; then
    sign_in
  fi
  local response http_code
  response=$(curl -sS -w "\n%{http_code}" -X "$method" \
    -H "Cookie: ${SESSION_COOKIE}" \
    -H "Content-Type: application/json" \
    -H "Origin: ${API_URL}" \
    "$@" \
    "${API_URL}${path}") || true
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  if [[ "$http_code" -ge 400 ]]; then
    echo "Error: HTTP ${http_code}" >&2
    echo "$body" >&2
    return 1
  fi
  echo "$body"
}

require_company() {
  if [[ -z "$COMPANY_ID" ]]; then
    echo "Error: --company-id required or set PAPERCLIP_COMPANY_ID" >&2
    exit 1
  fi
}

require_jq() {
  if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not installed" >&2
    exit 1
  fi
}

usage() {
  cat <<'EOF'
paperclip.sh — Paperclip AI API Client

COMPANY COMMANDS
  company list                              List all companies
  company get <id>                          Get company details
  company create <name> [description]       Create a new company
  company update <id> --name/--description  Update a company
  company export <id>                       Export company (portability)

AGENT COMMANDS
  agent list                                List agents (requires --company-id)
  agent get <id>                            Get agent details
  agent create <name> <role> [opts]         Create an agent directly
  agent hire <name> <role> [opts]           Hire via governance (Board approval)
  agent pause <id>                          Pause agent
  agent resume <id>                         Resume agent
  agent terminate <id>                      Terminate agent
  agent wakeup <id>                         Wake up agent
  agent keys <id>                           List agent API keys
  agent config <id>                         Get agent configuration

PROJECT COMMANDS
  project list                              List projects
  project get <id>                          Get project details
  project create --name "..." [opts]        Create project
  project update <id> [opts]                Update project

GOAL COMMANDS
  goal list                                 List goals
  goal get <id>                             Get goal details
  goal create --title "..." [opts]          Create goal
  goal update <id> [opts]                   Update goal

ISSUE COMMANDS
  issue list [--status X] [--assignee-agent-id X]
  issue get <id>
  issue create --title "..." [opts]
  issue update <id> [--status X] [--title X]
  issue comment <id> --body "..."
  issue checkout <id> --agent-id <id>
  issue release <id>

ROUTINE COMMANDS
  routine list                              List routines
  routine get <id>                          Get routine details
  routine create --name "..." [opts]        Create routine
  routine update <id> [opts]                Update routine
  routine delete <id>                       Delete routine
  routine run <id>                          Manually trigger routine

APPROVAL COMMANDS
  approval list [--status pending]
  approval get <id>
  approval approve <id> [--note "..."]
  approval reject <id> [--note "..."]
  approval request-revision <id> [--note]   Request revision
  approval resubmit <id>                    Resubmit after revision
  approval comment <id> --body "..."        Comment on approval

COST & BUDGET COMMANDS
  cost summary                              Company cost summary
  cost by-agent                             Cost breakdown by agent
  cost by-project                           Cost breakdown by project
  cost by-provider                          Cost breakdown by provider
  cost finance                              Finance summary
  budget overview                           Budget overview (policies + incidents)

SECRET COMMANDS
  secret list                               List secrets
  secret create --name "..." --value "..."  Create secret
  secret update <id> --value "..."          Update secret
  secret delete <id>                        Delete secret

OTHER COMMANDS
  dashboard                                 Get company dashboard
  activity [--agent-id X]                   Activity log
  org                                       Org chart (JSON)
  health                                    Instance health check

OPTIONS (global)
  --company-id <id>                         Override PAPERCLIP_COMPANY_ID
EOF
}

# --- parse global options ---

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --company-id) COMPANY_ID="$2"; shift 2;;
    --help|-h) usage; exit 0;;
    *) POSITIONAL+=("$1"); shift;;
  esac
done
set -- "${POSITIONAL[@]}"

# --- commands ---

cmd="${1:-help}"
sub="${2:-}"

case "$cmd" in

  # ======================== COMPANY ========================
  company)
    case "$sub" in
      list)
        api GET "/api/companies"
        ;;
      get)
        api GET "/api/companies/${3:?company-id required}"
        ;;
      create)
        require_jq
        local_name="${3:?company name required}"
        local_desc="${4:-}"
        payload=$(jq -n --arg name "$local_name" --arg desc "$local_desc" \
          '{name: $name} + (if $desc != "" then {description: $desc} else {} end)')
        api POST "/api/companies" -d "$payload"
        ;;
      update)
        require_jq
        company_id="${3:?company-id required}"
        shift 3
        name="" desc=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --name) name="$2"; shift 2;;
            --description) desc="$2"; shift 2;;
            *) shift;;
          esac
        done
        payload=$(jq -n --arg name "$name" --arg desc "$desc" \
          '(if $name != "" then {name: $name} else {} end) +
           (if $desc != "" then {description: $desc} else {} end)')
        api PATCH "/api/companies/${company_id}" -d "$payload"
        ;;
      export)
        local export_id="${3:-$COMPANY_ID}"
        [[ -z "$export_id" ]] && { echo "Error: company-id required (positional or --company-id)" >&2; exit 1; }
        api POST "/api/companies/${export_id}/export"
        ;;
      *) echo "Usage: company list|get|create|update|export"; exit 1;;
    esac
    ;;

  # ======================== AGENT ========================
  agent)
    case "$sub" in
      list)
        require_company
        api GET "/api/companies/${COMPANY_ID}/agents"
        ;;
      get)
        api GET "/api/agents/${3:?agent-id required}"
        ;;
      create)
        require_company
        require_jq
        local_name="${3:?agent name required}"
        local_role="${4:?agent role required}"
        local_title="${5:-$local_role}"
        local_adapter="${6:-claude_local}"
        payload=$(jq -n \
          --arg name "$local_name" \
          --arg role "$local_role" \
          --arg title "$local_title" \
          --arg adapter "$local_adapter" \
          '{name: $name, role: $role, title: $title, adapterType: $adapter}')
        api POST "/api/companies/${COMPANY_ID}/agents" -d "$payload"
        ;;
      hire)
        require_company
        require_jq
        local_name="${3:?agent name required}"
        local_role="${4:?agent role required}"
        local_title="${5:-$local_role}"
        local_adapter="${6:-claude_local}"
        payload=$(jq -n \
          --arg name "$local_name" \
          --arg role "$local_role" \
          --arg title "$local_title" \
          --arg adapter "$local_adapter" \
          '{name: $name, role: $role, title: $title, adapterType: $adapter}')
        api POST "/api/companies/${COMPANY_ID}/agent-hires" -d "$payload"
        ;;
      pause)
        api POST "/api/agents/${3:?agent-id required}/pause"
        ;;
      resume)
        api POST "/api/agents/${3:?agent-id required}/resume"
        ;;
      terminate)
        api POST "/api/agents/${3:?agent-id required}/terminate"
        ;;
      wakeup)
        api POST "/api/agents/${3:?agent-id required}/wakeup"
        ;;
      keys)
        api GET "/api/agents/${3:?agent-id required}/keys"
        ;;
      config)
        api GET "/api/agents/${3:?agent-id required}/configuration"
        ;;
      instructions-get)
        api GET "/api/agents/${3:?agent-id required}/instructions-bundle"
        ;;
      instructions-set)
        require_jq
        agent_id="${3:?agent-id required}"
        shift 3
        file_path="" content=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --path) file_path="$2"; shift 2;;
            --content) content="$2"; shift 2;;
            --file) content="$(cat "$2")"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$file_path" ]] && file_path="AGENTS.md"
        [[ -z "$content" ]] && { echo "Error: --content or --file required" >&2; exit 1; }
        payload=$(jq -n --arg path "$file_path" --arg content "$content" \
          '{path: $path, content: $content}')
        api PUT "/api/agents/${agent_id}/instructions-bundle/file" -d "$payload"
        ;;
      *) echo "Usage: agent list|get|create|hire|pause|resume|terminate|wakeup|keys|config|instructions-get|instructions-set"; exit 1;;
    esac
    ;;

  # ======================== PROJECT ========================
  project)
    case "$sub" in
      list)
        require_company
        api GET "/api/companies/${COMPANY_ID}/projects"
        ;;
      get)
        api GET "/api/projects/${3:?project-id required}"
        ;;
      create)
        require_company
        require_jq
        shift 2
        name="" desc="" goal_id="" lead_id="" target_date=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --name) name="$2"; shift 2;;
            --description) desc="$2"; shift 2;;
            --goal-id) goal_id="$2"; shift 2;;
            --lead-agent-id) lead_id="$2"; shift 2;;
            --target-date) target_date="$2"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$name" ]] && { echo "Error: --name required" >&2; exit 1; }
        payload=$(jq -n \
          --arg name "$name" --arg desc "$desc" \
          --arg goalId "$goal_id" --arg leadId "$lead_id" \
          --arg targetDate "$target_date" \
          '{name: $name} +
           (if $desc != "" then {description: $desc} else {} end) +
           (if $goalId != "" then {goalId: $goalId} else {} end) +
           (if $leadId != "" then {leadAgentId: $leadId} else {} end) +
           (if $targetDate != "" then {targetDate: $targetDate} else {} end)')
        api POST "/api/companies/${COMPANY_ID}/projects" -d "$payload"
        ;;
      update)
        require_jq
        project_id="${3:?project-id required}"
        shift 3
        name="" desc="" status="" lead_id=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --name) name="$2"; shift 2;;
            --description) desc="$2"; shift 2;;
            --status) status="$2"; shift 2;;
            --lead-agent-id) lead_id="$2"; shift 2;;
            *) shift;;
          esac
        done
        payload=$(jq -n \
          --arg name "$name" --arg desc "$desc" \
          --arg status "$status" --arg leadId "$lead_id" \
          '(if $name != "" then {name: $name} else {} end) +
           (if $desc != "" then {description: $desc} else {} end) +
           (if $status != "" then {status: $status} else {} end) +
           (if $leadId != "" then {leadAgentId: $leadId} else {} end)')
        api PATCH "/api/projects/${project_id}" -d "$payload"
        ;;
      *) echo "Usage: project list|get|create|update"; exit 1;;
    esac
    ;;

  # ======================== GOAL ========================
  goal)
    case "$sub" in
      list)
        require_company
        api GET "/api/companies/${COMPANY_ID}/goals"
        ;;
      get)
        api GET "/api/goals/${3:?goal-id required}"
        ;;
      create)
        require_company
        require_jq
        shift 2
        title="" desc="" level="" parent_id="" owner_id=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --title) title="$2"; shift 2;;
            --description) desc="$2"; shift 2;;
            --level) level="$2"; shift 2;;
            --parent-id) parent_id="$2"; shift 2;;
            --owner-agent-id) owner_id="$2"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$title" ]] && { echo "Error: --title required" >&2; exit 1; }
        payload=$(jq -n \
          --arg title "$title" --arg desc "$desc" \
          --arg level "$level" --arg parentId "$parent_id" \
          --arg ownerId "$owner_id" \
          '{title: $title} +
           (if $desc != "" then {description: $desc} else {} end) +
           (if $level != "" then {level: $level} else {} end) +
           (if $parentId != "" then {parentId: $parentId} else {} end) +
           (if $ownerId != "" then {ownerAgentId: $ownerId} else {} end)')
        api POST "/api/companies/${COMPANY_ID}/goals" -d "$payload"
        ;;
      update)
        require_jq
        goal_id="${3:?goal-id required}"
        shift 3
        title="" desc="" status=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --title) title="$2"; shift 2;;
            --description) desc="$2"; shift 2;;
            --status) status="$2"; shift 2;;
            *) shift;;
          esac
        done
        payload=$(jq -n \
          --arg title "$title" --arg desc "$desc" --arg status "$status" \
          '(if $title != "" then {title: $title} else {} end) +
           (if $desc != "" then {description: $desc} else {} end) +
           (if $status != "" then {status: $status} else {} end)')
        api PATCH "/api/goals/${goal_id}" -d "$payload"
        ;;
      *) echo "Usage: goal list|get|create|update"; exit 1;;
    esac
    ;;

  # ======================== ISSUE ========================
  issue)
    case "$sub" in
      list)
        require_company
        shift 2
        query=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --status) query+="status=${2}&"; shift 2;;
            --assignee-agent-id) query+="assigneeAgentId=${2}&"; shift 2;;
            --match) query+="match=${2}&"; shift 2;;
            --project-id) query+="projectId=${2}&"; shift 2;;
            *) shift;;
          esac
        done
        api GET "/api/companies/${COMPANY_ID}/issues?${query}"
        ;;
      get)
        api GET "/api/issues/${3:?issue-id required}"
        ;;
      create)
        require_company
        require_jq
        shift 2
        title="" desc="" priority="" assignee="" parent="" project_id="" goal_id=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --title) title="$2"; shift 2;;
            --description) desc="$2"; shift 2;;
            --priority) priority="$2"; shift 2;;
            --assignee-agent-id) assignee="$2"; shift 2;;
            --parent-id) parent="$2"; shift 2;;
            --project-id) project_id="$2"; shift 2;;
            --goal-id) goal_id="$2"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$title" ]] && { echo "Error: --title required" >&2; exit 1; }
        payload=$(jq -n \
          --arg title "$title" --arg desc "$desc" \
          --arg priority "$priority" --arg assignee "$assignee" \
          --arg parent "$parent" --arg projectId "$project_id" \
          --arg goalId "$goal_id" \
          '{title: $title} +
           (if $desc != "" then {description: $desc} else {} end) +
           (if $priority != "" then {priority: $priority} else {} end) +
           (if $assignee != "" then {assigneeAgentId: $assignee} else {} end) +
           (if $parent != "" then {parentId: $parent} else {} end) +
           (if $projectId != "" then {projectId: $projectId} else {} end) +
           (if $goalId != "" then {goalId: $goalId} else {} end)')
        api POST "/api/companies/${COMPANY_ID}/issues" -d "$payload"
        ;;
      update)
        require_jq
        issue_id="${3:?issue-id required}"
        shift 3
        status="" title="" desc="" priority="" assignee=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --status) status="$2"; shift 2;;
            --title) title="$2"; shift 2;;
            --description) desc="$2"; shift 2;;
            --priority) priority="$2"; shift 2;;
            --assignee-agent-id) assignee="$2"; shift 2;;
            *) shift;;
          esac
        done
        payload=$(jq -n \
          --arg status "$status" --arg title "$title" \
          --arg desc "$desc" --arg priority "$priority" \
          --arg assignee "$assignee" \
          '(if $status != "" then {status: $status} else {} end) +
           (if $title != "" then {title: $title} else {} end) +
           (if $desc != "" then {description: $desc} else {} end) +
           (if $priority != "" then {priority: $priority} else {} end) +
           (if $assignee != "" then {assigneeAgentId: $assignee} else {} end)')
        api PATCH "/api/issues/${issue_id}" -d "$payload"
        ;;
      comment)
        require_jq
        issue_id="${3:?issue-id required}"
        shift 3
        body=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --body) body="$2"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$body" ]] && { echo "Error: --body required" >&2; exit 1; }
        payload=$(jq -n --arg body "$body" '{body: $body}')
        api POST "/api/issues/${issue_id}/comments" -d "$payload"
        ;;
      checkout)
        require_jq
        issue_id="${3:?issue-id required}"
        shift 3
        agent_id=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --agent-id) agent_id="$2"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$agent_id" ]] && { echo "Error: --agent-id required" >&2; exit 1; }
        payload=$(jq -n --arg agentId "$agent_id" '{agentId: $agentId}')
        api POST "/api/issues/${issue_id}/checkout" -d "$payload"
        ;;
      release)
        api POST "/api/issues/${3:?issue-id required}/release"
        ;;
      *) echo "Usage: issue list|get|create|update|comment|checkout|release"; exit 1;;
    esac
    ;;

  # ======================== ROUTINE ========================
  routine)
    case "$sub" in
      list)
        require_company
        api GET "/api/companies/${COMPANY_ID}/routines"
        ;;
      get)
        api GET "/api/routines/${3:?routine-id required}"
        ;;
      create)
        require_company
        require_jq
        shift 2
        name="" desc="" schedule="" assignee=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --name) name="$2"; shift 2;;
            --description) desc="$2"; shift 2;;
            --schedule) schedule="$2"; shift 2;;
            --assignee-agent-id) assignee="$2"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$name" ]] && { echo "Error: --name required" >&2; exit 1; }
        payload=$(jq -n \
          --arg name "$name" --arg desc "$desc" \
          --arg schedule "$schedule" --arg assignee "$assignee" \
          '{name: $name} +
           (if $desc != "" then {description: $desc} else {} end) +
           (if $schedule != "" then {schedule: $schedule} else {} end) +
           (if $assignee != "" then {assigneeAgentId: $assignee} else {} end)')
        api POST "/api/companies/${COMPANY_ID}/routines" -d "$payload"
        ;;
      update)
        require_jq
        routine_id="${3:?routine-id required}"
        shift 3
        name="" desc="" schedule="" status=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --name) name="$2"; shift 2;;
            --description) desc="$2"; shift 2;;
            --schedule) schedule="$2"; shift 2;;
            --status) status="$2"; shift 2;;
            *) shift;;
          esac
        done
        payload=$(jq -n \
          --arg name "$name" --arg desc "$desc" \
          --arg schedule "$schedule" --arg status "$status" \
          '(if $name != "" then {name: $name} else {} end) +
           (if $desc != "" then {description: $desc} else {} end) +
           (if $schedule != "" then {schedule: $schedule} else {} end) +
           (if $status != "" then {status: $status} else {} end)')
        api PATCH "/api/routines/${routine_id}" -d "$payload"
        ;;
      delete)
        api DELETE "/api/routines/${3:?routine-id required}"
        ;;
      run)
        api POST "/api/routines/${3:?routine-id required}/run"
        ;;
      *) echo "Usage: routine list|get|create|update|delete|run"; exit 1;;
    esac
    ;;

  # ======================== APPROVAL ========================
  approval)
    case "$sub" in
      list)
        require_company
        shift 2
        query=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --status) query+="status=${2}&"; shift 2;;
            *) shift;;
          esac
        done
        api GET "/api/companies/${COMPANY_ID}/approvals?${query}"
        ;;
      get)
        api GET "/api/approvals/${3:?approval-id required}"
        ;;
      approve)
        require_jq
        approval_id="${3:?approval-id required}"
        shift 3
        note=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --note) note="$2"; shift 2;;
            *) shift;;
          esac
        done
        payload=$(jq -n --arg note "$note" \
          'if $note != "" then {decisionNote: $note} else {} end')
        api POST "/api/approvals/${approval_id}/approve" -d "$payload"
        ;;
      reject)
        require_jq
        approval_id="${3:?approval-id required}"
        shift 3
        note=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --note) note="$2"; shift 2;;
            *) shift;;
          esac
        done
        payload=$(jq -n --arg note "$note" \
          'if $note != "" then {decisionNote: $note} else {} end')
        api POST "/api/approvals/${approval_id}/reject" -d "$payload"
        ;;
      request-revision)
        require_jq
        approval_id="${3:?approval-id required}"
        shift 3
        note=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --note) note="$2"; shift 2;;
            *) shift;;
          esac
        done
        payload=$(jq -n --arg note "$note" \
          'if $note != "" then {decisionNote: $note} else {} end')
        api POST "/api/approvals/${approval_id}/request-revision" -d "$payload"
        ;;
      resubmit)
        api POST "/api/approvals/${3:?approval-id required}/resubmit"
        ;;
      comment)
        require_jq
        approval_id="${3:?approval-id required}"
        shift 3
        body=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --body) body="$2"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$body" ]] && { echo "Error: --body required" >&2; exit 1; }
        payload=$(jq -n --arg body "$body" '{body: $body}')
        api POST "/api/approvals/${approval_id}/comments" -d "$payload"
        ;;
      *) echo "Usage: approval list|get|approve|reject|request-revision|resubmit|comment"; exit 1;;
    esac
    ;;

  # ======================== COST & BUDGET ========================
  cost)
    require_company
    case "$sub" in
      summary)
        api GET "/api/companies/${COMPANY_ID}/costs/summary"
        ;;
      by-agent)
        api GET "/api/companies/${COMPANY_ID}/costs/by-agent"
        ;;
      by-project)
        api GET "/api/companies/${COMPANY_ID}/costs/by-project"
        ;;
      by-provider)
        api GET "/api/companies/${COMPANY_ID}/costs/by-provider"
        ;;
      finance)
        api GET "/api/companies/${COMPANY_ID}/costs/finance-summary"
        ;;
      *) echo "Usage: cost summary|by-agent|by-project|by-provider|finance"; exit 1;;
    esac
    ;;

  budget)
    require_company
    case "$sub" in
      overview)
        api GET "/api/companies/${COMPANY_ID}/budgets/overview"
        ;;
      *) echo "Usage: budget overview"; exit 1;;
    esac
    ;;

  # ======================== SECRET ========================
  secret)
    require_company
    case "$sub" in
      list)
        api GET "/api/companies/${COMPANY_ID}/secrets"
        ;;
      create)
        require_jq
        shift 2
        name="" value=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --name) name="$2"; shift 2;;
            --value) value="$2"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$name" ]] && { echo "Error: --name required" >&2; exit 1; }
        [[ -z "$value" ]] && { echo "Error: --value required" >&2; exit 1; }
        payload=$(jq -n --arg name "$name" --arg value "$value" \
          '{name: $name, value: $value}')
        api POST "/api/companies/${COMPANY_ID}/secrets" -d "$payload"
        ;;
      update)
        require_jq
        secret_id="${3:?secret-id required}"
        shift 3
        value=""
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --value) value="$2"; shift 2;;
            *) shift;;
          esac
        done
        [[ -z "$value" ]] && { echo "Error: --value required" >&2; exit 1; }
        payload=$(jq -n --arg value "$value" '{value: $value}')
        api PATCH "/api/companies/${COMPANY_ID}/secrets/${secret_id}" -d "$payload"
        ;;
      delete)
        api DELETE "/api/companies/${COMPANY_ID}/secrets/${3:?secret-id required}"
        ;;
      *) echo "Usage: secret list|create|update|delete"; exit 1;;
    esac
    ;;

  # ======================== DASHBOARD ========================
  dashboard)
    require_company
    api GET "/api/companies/${COMPANY_ID}/dashboard"
    ;;

  # ======================== ACTIVITY ========================
  activity)
    require_company
    shift 1
    query=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --agent-id) query+="agentId=${2}&"; shift 2;;
        --entity-type) query+="entityType=${2}&"; shift 2;;
        --entity-id) query+="entityId=${2}&"; shift 2;;
        --action) query+="action=${2}&"; shift 2;;
        *) shift;;
      esac
    done
    api GET "/api/companies/${COMPANY_ID}/activity?${query}"
    ;;

  # ======================== ORG CHART ========================
  org)
    require_company
    api GET "/api/companies/${COMPANY_ID}/org"
    ;;

  # ======================== HEALTH ========================
  health)
    api GET "/api/health"
    ;;

  # ======================== HELP ========================
  help|--help|-h)
    usage
    ;;

  *)
    echo "Unknown command: $cmd" >&2
    usage
    exit 1
    ;;
esac
