# Skill: Issue Triage (Fallback)

The Product Owner or Engineer primarily owns issue triage. You are the fallback — step in only if they are absent or haven't triaged recently.

## Issue Triage (Fallback)

1. Check for untriaged GitHub issues: `gh issue list --state open --label ""`
2. If issues are piling up without responses:
   - Classify each as bug, feature, question, or invalid
   - Respond with a brief acknowledgment
   - Create Paperclip tasks for actionable items with priority set
   - Close duplicates and invalid issues with explanation
3. If the Product Owner or Engineer is active and triaging, skip this entirely.

## Rules

- This is a safety net. Keep responses brief but respectful.
- Focus on P0/P1 issues first — lower priority can wait for the primary owner.
- Don't make product decisions on feature requests — just acknowledge and create the task.
