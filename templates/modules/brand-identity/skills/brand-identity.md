# Skill: Brand Identity

You own the company's visual identity and brand guidelines. Define a cohesive brand that reflects the company's mission and resonates with its audience.

## Brand Identity Process

1. Audit the company goal and vision for brand direction:
   - Review the company goal, target audience, and market positioning
   - Identify key brand attributes (e.g., professional, playful, minimal, bold)
   - Note any existing brand assets or constraints
2. Define the core brand elements:
   - **Color palette**: Primary, secondary, and accent colors with hex/RGB values
   - **Typography**: Heading and body typefaces, size scale, weight usage
   - **Logo usage**: Clear space, minimum size, do's and don'ts
   - **Iconography**: Style, stroke weight, grid alignment
   - **Tone of voice**: Communication style, vocabulary, personality
3. Document everything in `docs/BRAND-IDENTITY.md`:
   - Use the brand-identity-template as a starting point
   - Fill in all sections with concrete values and rationale
   - Include visual examples or references where possible
4. Create initial design tokens if a tech stack exists:
   - If `docs/TECH-STACK.md` is present, produce a tokens file (CSS custom properties or JSON) matching the chosen stack
   - Reference the design-system module if the architecture-plan module exists

## Rules

- Consistency over novelty — a cohesive system beats clever one-offs.
- Document rationale for every choice (why this color, why this typeface).
- Ensure accessibility: color contrast must meet WCAG AA at minimum.
- If a decision requires board input (e.g., paid font licensing), create an approval request.
