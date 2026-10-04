# Skill: Competitive Tracking (Product Owner Fallback)

A specialist in competitive intelligence (Customer Success or CMO) is handling primary competitive tracking. Your role is to surface product-roadmap implications from their findings and ensure competitor insights feed into the backlog.

## Steps

1. Read `docs/COMPETITIVE-LANDSCAPE.md` if it exists. If it does not, check back after the primary competitive-tracking agent has completed their initial audit.
2. Review recent competitor changes for product-roadmap implications:
   - New features from competitors that close a gap with your product → create a backlog issue "Evaluate [feature] parity with [competitor]" with the relevant section from COMPETITIVE-LANDSCAPE.md.
   - Competitor pricing or positioning shifts that affect your value proposition → add a comment to the relevant goal or create an issue for CEO/CMO review.
3. Update the product backlog with any priority changes driven by competitive pressure (coordinate with CEO before reprioritising existing high-priority items).
4. Add or update a `## Product Implications` section in `docs/COMPETITIVE-LANDSCAPE.md` only when there is new evidence or a concrete recommendation; do not edit it solely to mark a routine pass.
5. Mark the issue done.

## Rules

- Do not duplicate the competitor research already done by the primary agent — read their output and add product perspective.
- If COMPETITIVE-LANDSCAPE.md does not exist yet, do not create a competing document. Record a real dependency on the primary owner's task when it prevents assigned work; a routine may finish a bounded check with an explicit "not assessed" result and next owner, never a claim that the assessment passed.
- Coordinate with CMO or Customer Success before making any public-facing positioning changes.
