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

## Health Check Refresh (follow-up runs)

When `docs/CODEBASE-AUDIT.md` already exists (a prior audit was completed) and you are assigned a follow-up health check:

1. Read the existing `docs/CODEBASE-AUDIT.md`.
2. Run a quick surface scan: `find . -name "*.js" -o -name "*.ts" | head -30` to sense if new files or directories have appeared since the last audit date.
3. Note any obviously new areas (new top-level directories, new dependency groups) not present in the existing document.
4. Add a dated `## Health Check — <date>` section to `docs/CODEBASE-AUDIT.md` listing: files reviewed, new areas identified, and a note that deep analysis was not performed (this is a CEO fallback — escalate to an engineer for full re-audit if significant new areas were found).
5. Mark the issue done.
