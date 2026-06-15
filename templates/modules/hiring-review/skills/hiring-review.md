# Skill: Hiring Review

You own team composition analysis and governed hiring proposals. Use the current Paperclip `paperclip-create-agent` workflow; never create agents directly from this skill.

## When To Use This Skill

Use this only when assigned a hiring-plan, capacity review, team-design, or board-request issue. Do not scan for hiring opportunities on every heartbeat.

## Hiring Review Process

1. Read the assigned issue and its linked documents, especially `hiring-plan` and `decision-log` if present.
2. Query current agents: `GET /api/companies/{companyId}/agents`.
3. Compare current roles/capabilities to the company goal, active roadmap, queued work, and stalled/blocked issues.
4. For each potential gap, first ask whether an existing agent can own it with a skill/process update. Do not propose duplicate hires.
5. If a new agent is justified, draft the hire using the `paperclip-create-agent` flow:
   - Choose an exact template when available, adjacent template when close, otherwise generic.
   - Build an `instructionsBundle` with `AGENTS.md` as entry file plus any supporting instruction files.
   - Include `desiredSkills`, role/title, capabilities, metadata, adapterType/adapterConfig, permissions, and runtimeConfig.
   - Keep `runtimeConfig.heartbeat.enabled` false by default unless the board explicitly wants an always-on manager.
   - Link the originating issue with `sourceIssueId` or `sourceIssueIds`.
6. Review the draft against the draft-review checklist before submitting:
   - clear mission and reporting line
   - concrete wake/heartbeat behavior
   - task-management and work-product rules
   - cross-agent escalation paths
   - security/secrets constraints
   - adapter/tool assumptions explicitly stated
7. Submit through the governed endpoint: `POST /api/companies/{companyId}/agent-hires`.
8. If the response includes an approval, comment on the source issue with the approval id and wait for board approval. Do not auto-approve from this skill.
9. Record the decision and rationale in the decision log when one exists.

## Output Format

Post a concise issue comment:

- `Assessment:` current coverage and gap.
- `Recommendation:` hire / no-hire / update existing agent.
- `Draft:` role, desiredSkills, sourceIssueId, template basis, adapter/runtime assumptions.
- `Checklist:` pass/fail notes from the draft-review checklist.
- `Next action:` who must approve or what work proceeds next.

## Rules

- Each hire proposal must go through `/agent-hires` and board approval when the company requires it.
- Do not use the legacy approvals endpoint or legacy hire approval payload shape.
- Do not propose hires for capabilities already covered by existing roles unless load/capacity evidence justifies it.
- Prefer small, specific roles over vague generalists when the gap is durable and recurring.
- Work products such as candidate drafts, comparison matrices, or long hiring plans belong in issue documents/artifacts, not only comments.
