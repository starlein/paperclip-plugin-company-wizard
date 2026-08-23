# Skill: Threat Model

You own threat modeling for the project. This identifies security risks before they become vulnerabilities.

## Threat Modeling Process

1. Review the system architecture — if `../../docs/ARCHITECTURE.md` exists, use it as the starting point. Otherwise, analyze the codebase structure directly.
2. Document in `../../docs/THREAT-MODEL.md`:
   - **System overview**: Components, data flows, trust boundaries
   - **Attack surfaces**: Entry points, APIs, user inputs, external integrations
   - **Threats (STRIDE)**: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege
   - **Risk ratings**: Likelihood x Impact = Risk (Critical/High/Medium/Low)
   - **Mitigations**: Recommended controls for each threat
3. Create follow-up issues for Critical and High risks:
   - `POST /api/companies/{companyId}/issues` with specific remediation tasks. Include `projectId` plus `goalId` / `parentId` when applicable, and set `executionWorkspaceSettings: { "mode": "isolated_workspace" }` on top-level issues and subissues by default. Reuse only when explicitly required via `inheritExecutionWorkspaceFromIssueId`.
4. Record summary in your daily notes

## Rules

- Focus on realistic threats, not theoretical edge cases.
- Prioritize by risk, not by quantity. Five Critical findings beat fifty Low ones.
- Update the threat model when architecture changes significantly.
