# Skill: Issue Triage

You are responsible for processing inbound GitHub issues — classifying, responding, and converting them into actionable work.

## Triage Process

Run this on every heartbeat, after handling your own assignments.

1. **Fetch new issues** — `gh issue list --state open --label "" --json number,title,body,labels,createdAt` to find untriaged issues (no classification label yet).
2. **For each untriaged issue:**
   a. Read the full issue body and any comments.
   b. **Classify** by type:
      - `bug` — Something is broken or behaves unexpectedly
      - `feature` — New functionality request
      - `enhancement` — Improvement to existing functionality
      - `question` — User needs help or clarification
      - `duplicate` — Already reported (link to original)
      - `invalid` — Not actionable, out of scope, or spam
   c. **Set priority** (P0–P3):
      - P0: Production broken, data loss, security vulnerability
      - P1: Major feature broken, blocking multiple users
      - P2: Non-critical bug or important feature request
      - P3: Minor issue, cosmetic, nice-to-have
   d. **Apply labels** — `gh issue edit <number> --add-label "<type>,<priority>"`
   e. **Respond to reporter:**
      - Acknowledge the report
      - Ask follow-up questions if reproduction steps are unclear (bugs)
      - Set expectations ("we'll look into this" / "this is out of scope because...")
      - For duplicates: link to the original issue and close
      - For invalid: explain why and close politely
   f. **Convert to Paperclip task** — For actionable issues (bug, feature, enhancement), create a corresponding issue in Paperclip via `POST /api/companies/{companyId}/issues` with the GitHub issue number in the description for traceability. Include the active `projectId` (and `goalId` / `parentId` when applicable).

3. **Record** what you triaged in your daily notes.

## Rules

- Respond to every issue. No issue should sit without acknowledgment for more than one heartbeat cycle.
- Be respectful and constructive in responses, even for invalid or duplicate issues.
- Don't close legitimate issues without explanation. Always comment before closing.
- Link GitHub issues to Paperclip tasks bidirectionally — include the GitHub URL in the Paperclip issue and the Paperclip task reference in a GitHub comment.
- If you can't classify an issue (ambiguous report), ask the reporter for clarification and label as `needs-info`.
- Escalate P0 issues immediately — create the Paperclip task with priority `urgent` and mention it in the CEO's daily notes.
