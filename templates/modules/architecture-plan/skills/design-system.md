# Skill: Design System (Engineer Primary)

You are establishing the project's design system foundations when no UI Designer is available. Your output should be practical and hand-off-ready — define the minimum tokens and patterns needed for consistent development, and document them so a UI Designer can refine them later.

## Steps

1. Read `docs/TECH-STACK.md` if it exists to understand the frontend framework and styling approach.
2. Read `docs/BRAND-IDENTITY.md` if it exists for color palette, typography, and brand direction.
3. If `docs/DESIGN-SYSTEM.md` does not exist, create it using `docs/design-system-template.md` as a starting point.
4. Define the minimum viable token set:
   - **Colors**: primary, secondary, background, surface, text, error/warning/success. Use the brand palette if available, otherwise choose accessible defaults (WCAG AA contrast ratio ≥ 4.5:1 for text).
   - **Typography**: 2–3 font sizes (body, heading, small), font family (system stack if no brand font specified), line heights.
   - **Spacing**: a 4px base grid — common values: 4, 8, 12, 16, 24, 32, 48, 64px.
5. Define 3–5 core component patterns (button, input, card, navigation item) with their states (default, hover, active, disabled, error). Document as usage rules, not full component code.
6. Write token definitions as CSS custom properties or the equivalent for the project's framework.
7. Mark the document as **provisional** — created by engineer as primary; a UI Designer should review and extend.
8. Create a follow-up issue: "Review and extend design system" assigned to the UI Designer if one is ever added to the team.
9. Mark this issue done.

## Rules

- Keep it practical over perfect. Consistent tokens are more valuable than a comprehensive design system.
- Do not create visual assets (icons, illustrations) — document where placeholders should go.
- Reference `docs/ARCHITECTURE.md` for the component hierarchy if it exists.
- If `docs/DESIGN-SYSTEM.md` already exists (a UI Designer ran first), review it for engineering feasibility and add implementation notes — do not overwrite their work.
