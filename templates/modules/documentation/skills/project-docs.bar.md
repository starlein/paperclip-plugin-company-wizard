## Project Documentation — Done Bar

**Done:**
- All documentation targets specified in the issue have been created or updated.
- Verify applicable setup commands in a safe disposable environment and record actual results. Never execute destructive or production steps without explicit approval and a safe authorized scope merely to satisfy this bar. Clearly distinguish executed checks from static review; disclose missing credentials, infrastructure, approval, or other prerequisites.
- API documentation matches the current implementation — no documented endpoints or parameters that no longer exist, no undocumented endpoints that do.
- No content is duplicated across files — each fact appears in exactly one place; other files reference it rather than copying.
- Internal links (cross-references between docs) are valid — no broken anchors or references to non-existent files.

**Not done:**
- Required setup verification is still unproven: persist dependency `blockedByIssueIds` or an own-agent `unblockDescriptor`; for human authorization use a saved pending interaction plus `in_review`. A disclosed, out-of-scope path may remain unexecuted with its limitation documented; do not claim it passed or execute unsafe commands to close the issue.
- API docs were not updated after a breaking change.
- A section is marked "TODO" or "coming soon" without a follow-up issue.
