## Output / review bar

A good architecture plan:

- A `docs/ARCHITECTURE.md` with a system overview (text/ASCII component diagram), data flow through the system, API boundaries (internal and external), deployment model, and key decisions recorded in ADR style with rationale.
- Decomposed into concrete implementation issues for foundational scaffolding so work can start incrementally.

Not done:

- A diagram with no data flow or failure modes — components drawn without explaining how data moves or what happens when a dependency is unavailable.
- Decisions recorded without rationale — "we use a monorepo" with no explanation of why that fits the requirements.
