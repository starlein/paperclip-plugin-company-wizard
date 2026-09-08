## Output / review bar

A good security review:

- A `docs/SECURITY-REVIEW.md` with findings that include: severity (Critical / High / Medium / Low), exact file path and line number, the evidence (code snippet or reproduction step), and a specific recommended fix.
- A dependency report with CVE details from `npm audit` or equivalent. Critical and High findings have follow-up issues created.

Not done:

- A finding with no exploit path, blast radius, or concrete fix — "there may be an injection risk here" without a reproduction path, affected data scope, or remediation is not done.
- A review that flags secrets exposure as anything lower than Critical.
