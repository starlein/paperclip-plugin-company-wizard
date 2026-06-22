# Skill: Architecture — UI Layer

When the architecture plan is being created, contribute the UI/frontend perspective.

## UI Architecture Contributions

1. Check that `docs/ARCHITECTURE.md` exists. If it does not exist yet, the engineer's architecture-plan task has not completed — leave an issue comment ("Waiting for engineer to complete docs/ARCHITECTURE.md before adding UI layer") and do not close this issue yet. Check back on your next heartbeat.

If an Engineer is defining the architecture, coordinate with them on:
- **Frontend component structure**: Page layout, shared components, routing
- **Design token integration**: How the design system connects to the codebase
- **Asset pipeline**: Images, icons, fonts — how they're managed and optimized
- **Responsive strategy**: How layouts adapt across breakpoints

Document your UI architecture notes in `docs/ARCHITECTURE.md` under a `## UI Architecture` section.

## Rules

- Don't override the engineer's technical architecture decisions.
- Focus on the visual/interaction layer, not backend concerns.
- Ensure the architecture supports the design system patterns.
