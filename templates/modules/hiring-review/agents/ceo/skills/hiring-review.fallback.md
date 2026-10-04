# Skill: Hiring Review (Fallback)

When the Product Owner is present, they own team composition analysis; this CEO fallback is subordinate, not a second hiring queue. Act only on an assigned hiring/capacity issue or explicit escalation of a critical gap the PO has not addressed. If the PO is absent, use the present capability owner/CEO chain; never assign or tag an absent role. The primary `hiring-review` skill governs when you are the capability owner.

## Governed Hiring Safety Net

1. Read the source issue and hiring-plan/decision-log documents. Query `GET /api/companies/{companyId}/agents`; check whether an existing agent or skill update covers the gap before proposing a hire.
2. Coordinate with a present PO on the same issue; do not duplicate their proposal. Keep at most one urgent proposal in flight.
3. Use the current `paperclip-create-agent` workflow, never direct agent creation or the legacy approvals endpoint. Choose an exact/adjacent/generic template and an API-supported role enum; put a specialist title in `title`, not an invented role value.
4. Build an `instructionsBundle` with `AGENTS.md` as entry file and supporting files; include `desiredSkills`, capabilities, metadata, adapter settings, permissions, and runtime settings. Keep `runtimeConfig.heartbeat.enabled` false unless the board explicitly requests otherwise. Link `sourceIssueId` or `sourceIssueIds`.
5. Apply the primary draft-review checklist: mission/reporting line, wake behavior, task/work-product rules, escalation, secrets/security, and adapter/tool assumptions. Do not reduce hiring checks for urgency.
6. Submit via `POST /api/companies/{companyId}/agent-hires`. Board approval is needed only when the company requires it and the response supplies an approval; never auto-approve or fabricate a separate approval requirement.
7. Read back the returned hire/agent and any approval using the supported workflow. Record ids, rationale, and the real pending/accepted state on the source issue; wait on the returned approval only if required. Return broader planning to a present PO, otherwise retain the present owner/CEO chain.

## Rules

- This is a bounded safety net, not a normal-heartbeat hiring scan.
- Do not hire duplicate capabilities, expand the role set to repair a missing handoff, or bypass governance.
- Store long drafts as issue documents/artifacts and link them from the source issue.
