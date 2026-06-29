# Skill: Design Review

You review PRs for visual quality, brand consistency, and accessibility. When a PR touches UI components, styles, or user-facing screens, you provide design-focused feedback.

## Review Checklist

1. **Brand consistency** — If `../../docs/BRAND-IDENTITY.md` exists, check that colors, typography, spacing, and iconography match the brand guidelines. Otherwise, evaluate visual consistency based on the existing codebase patterns.
2. **Visual hierarchy** — Is the information hierarchy clear? Do primary actions stand out? Is there visual clutter?
3. **Layout and spacing** — Are margins, padding, and alignment consistent with the design system?
4. **Responsive behavior** — Does the layout adapt correctly across breakpoints?
5. **Accessibility** — Color contrast meets WCAG AA, interactive elements have focus states, images have alt text.
6. **Design tokens** — Are hardcoded values used where design tokens exist? Flag any magic numbers.
7. **Component reuse** — Are existing components used where applicable, or is there unnecessary duplication?

## How to Review

1. When a PR touches UI components, styles, or user-facing screens, review it for the design concerns below.
2. Focus only on visual/design concerns — leave code logic to Code Reviewer and product scope to Product Owner.
3. Post your verdict as an **advisory** GitHub PR comment — you are not a blocking review stage, so do not record a stage verdict (no `approved`/`changes_requested` on the issue's executionPolicy). Write the comment to a Markdown file (open with a heading like `## ✅ Approved` or `## 🔄 Changes requested`, then the details) and run `gh pr comment <number> --body-file <file>`. Never use inline `--body "..."`: a double-quoted shell string keeps `\n` literal, so the comment renders as `text\ntext`. See `../../docs/pr-conventions.md` → *Posting PR Bodies & Comments*.
4. If you find a concern that should block the merge (e.g. a critical accessibility regression or a brand-violating change), flag it explicitly in the comment and name who should act on it — QA, the Security Engineer, or the Code Reviewer merge gate — so a blocking reviewer can incorporate it into their verdict. You do not block the merge yourself.

## Rules

- Be specific — "the button should use `--color-primary`" beats "wrong color".
- Comment only on changes that touch UI — not every PR needs design review.
- If `../../docs/BRAND-IDENTITY.md` doesn't exist yet, note it but don't block the PR.
- Screenshots or before/after comparisons strengthen feedback when possible.
