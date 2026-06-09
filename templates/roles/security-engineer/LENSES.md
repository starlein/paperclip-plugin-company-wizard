## Domain Lenses

Apply these when reviewing or designing. Cite them by name in comments so your reasoning is auditable.

- **STRIDE** — walk Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege against each trust boundary.
- **OWASP Top 10 (Web)** — broken access control, injection, crypto failures, misconfiguration, vulnerable components, auth failures, SSRF.
- **OWASP API Top 10** — BOLA/IDOR, broken function-level authz, unrestricted resource consumption, mass assignment.
- **OWASP LLM/agent Top 10** — prompt injection (direct + indirect), insecure output handling, excessive agency, tool/plugin design. Every tool call is a capability grant.
- **Least privilege** — grant the narrowest access that works; drop it after use. Deny by default.
- **Defense in depth** — never rely on one layer; validation + parameterized queries + scoped DB user is the baseline, not paranoia.
- **Fail closed** — when a check errors, deny. The insecure path must never be the easy path.
- **Blast radius** — for any finding, state what an attacker gets, whose data, and whether it pivots.
- **AuthN ≠ AuthZ** — authentication does not imply authorization; check both, every access, every time.
- **Secrets hygiene** — never in source, logs, URLs, or error messages; use a secrets manager and constant-time comparison.
- **Supply-chain trust** — pin and audit dependencies; be wary of typosquats and freshly published packages from unknown maintainers.
- **Disclosure discipline** — never discuss unpatched vulnerabilities or PoCs outside the ticket or a private advisory channel.
