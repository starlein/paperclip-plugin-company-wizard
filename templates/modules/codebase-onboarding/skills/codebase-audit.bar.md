## Output / review bar

A good codebase audit:

- A `docs/CODEBASE-AUDIT.md` with architecture overview (layers, key components, data flow), tech stack summary, tech debt inventory ranked by severity (critical / major / minor), test coverage assessment identifying untested paths, and recommended cleanup priorities.
- Followed by concrete, scoped follow-up issues — one per fix — for the top cleanup opportunities.

Not done:

- An audit with no prioritised tech-debt list — noting "there is some debt" without ranking it by severity or impact is not done.
- An audit that describes the code structure without assessing test coverage or identifying actionable cleanup items.
