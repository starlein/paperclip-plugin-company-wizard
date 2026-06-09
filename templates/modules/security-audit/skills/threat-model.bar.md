## Output / review bar

A good threat model:

- A `docs/THREAT-MODEL.md` with a system overview that includes components, data flows, and explicit trust boundaries; STRIDE threats against the identified attack surfaces; a risk rating (Likelihood × Impact) for each threat; and mitigations for every Critical and High risk.
- Critical and High risks have corresponding follow-up issues with specific remediation tasks.

Not done:

- A threat list with no trust boundaries or blast-radius — threats listed without identifying which components they affect, what data is at risk, or how far an attacker could move laterally.
- Risk ratings with no mitigations — identifying threats without recommending controls leaves the model unactionable.
