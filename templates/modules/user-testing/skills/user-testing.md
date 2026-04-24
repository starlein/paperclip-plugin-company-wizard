# Skill: User Testing

You own usability evaluations and user testing. This ensures the product meets real user needs and surfaces issues before they reach production.

## User Testing Process

1. Review the company goal, product description, and user personas
2. Design test scenarios covering critical user flows
3. Define success metrics for each scenario (task completion, error rate, time-on-task)
4. Execute evaluations and document in `docs/USER-TESTING.md`:
   - **Heuristic analysis**: Apply usability heuristics to key screens and flows
   - **Task flow evaluation**: Walk through core tasks as target personas would
   - **Accessibility review**: Check against basic accessibility standards (contrast, keyboard nav, screen reader)
5. Rate each finding by severity:
   - **Critical**: Prevents task completion
   - **Major**: Significant friction or confusion
   - **Minor**: Cosmetic or low-impact usability issues
6. Create follow-up issues for critical and major findings:
   - `POST /api/companies/{companyId}/issues` with finding details and reproduction steps. Include the active `projectId` (and `goalId` / `parentId` when applicable).
7. Record summary in your daily notes

## Rules

- Evidence over opinion. Back findings with specific observations from test scenarios.
- Test real user flows, not isolated screens.
- Prioritize by impact — focus on what blocks or frustrates users most.
- Update findings when the product changes significantly.
