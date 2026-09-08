# Skill: Dependency Audit (Fallback)

DevOps or Security Engineer primarily owns dependency management. You are the fallback — step in only if they are absent.

## Dependency Audit (Fallback)

1. If no `docs/DEPENDENCY-AUDIT.md` exists and no one else has started:
   - Run the package manager's built-in audit command (`npm audit`, `pip-audit`, etc.)
   - Apply safe patch-level updates that don't break tests
   - Document current dependency state in `docs/DEPENDENCY-AUDIT.md`
   - Mark the document as **provisional** — it needs a security/ops review for CVE prioritization
2. If DevOps or Security Engineer is active, skip this entirely.

## Rules

- This is a safety net. Run the audit and apply safe patches only.
- Skip major version upgrades — those need dedicated planning.
- Don't make migration decisions — leave those to the primary owner.
