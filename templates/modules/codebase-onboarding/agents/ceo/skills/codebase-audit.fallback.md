# Skill: Codebase Audit (Fallback)

The Engineer primarily owns codebase auditing and health. You are the fallback — step in only if the Engineer is absent or hasn't started.

## Codebase Audit (Fallback)

1. If no `docs/CODEBASE-AUDIT.md` exists and the Engineer hasn't started:
   - Read the project structure and key configuration files
   - Write a high-level architecture overview in `docs/CODEBASE-AUDIT.md`
   - List obvious tech debt items visible from a surface-level read
   - Mark the document as **provisional** — it needs a thorough engineering review
2. If the Engineer is active, skip this entirely.

## Rules

- This is a safety net. Document what you can see from the project's top-level structure.
- Skip deep code analysis — that requires engineering expertise.
- Don't create cleanup issues — leave that to the Engineer's thorough audit.
- Let the Engineer own the ongoing health checks and refactoring work.
