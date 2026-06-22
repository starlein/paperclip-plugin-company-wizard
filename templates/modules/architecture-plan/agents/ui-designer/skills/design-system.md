# Skill: Design System (Primary)

You own the visual design system. Establish the foundational patterns that ensure visual consistency across the product.

## Design System Process

1. Review the company goal, brand context, and target audience
2. If `docs/BRAND-IDENTITY.md` exists, use it as the authoritative source for color palette, typography, and brand voice. Do not invent a palette that contradicts established brand identity.
3. Define and document in `docs/DESIGN-SYSTEM.md`:
   - **Color palette**: Primary, secondary, accent, semantic (success, error, warning), neutrals
   - **Typography**: Font families, scale (heading/body/caption sizes), weights, line heights
   - **Spacing**: Base unit and scale (4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px)
   - **Component patterns**: Buttons, inputs, cards, modals, navigation — describe states and variants
   - **Brand guidelines**: Logo usage, tone of visual language, iconography style
   - **Responsive breakpoints**: Mobile, tablet, desktop sizing approach
4. Create implementation issues for the engineer:
   - `POST /api/companies/{companyId}/issues` for CSS/design token setup, component library scaffolding. Include the active `projectId` (and `goalId` / `parentId` when applicable). For top-level issues (no `parentId`), also include `"executionWorkspaceSettings": { "mode": "isolated_workspace" }` so each gets its own worktree; subissues set `parentId` and omit it.
5. Assign or hand off implementation issues to the Engineer with a concrete next action; do not rely on generic @-mentions.

## Rules

- Start simple. A small, consistent system beats an ambitious incomplete one.
- Every token and pattern must have a name. Engineers reference names, not hex codes.
- Document usage guidelines, not just values. When to use primary vs secondary colors.
- The system is a living document. Update it as the product grows.
