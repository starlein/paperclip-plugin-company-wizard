# Product Backlog

_This is the living backlog for the company. The backlog owner maintains this document alongside the issue tracker._

## Current Milestone

**Milestone:** _(name of the current milestone from the roadmap)_
**Status:** _(on track / at risk / blocked)_
**Target:** _(what "done" looks like for this milestone)_

## Roadmap

Break the company goal into milestones. Each milestone is a coherent chunk of value that can be delivered and validated.

| # | Milestone | Status | Key Deliverables |
|:--|:----------|:-------|:-----------------|
| 1 | _(name)_ | _(planned / active / done)_ | _(what ships)_ |
| 2 | | | |
| 3 | | | |

## Issue Labels

These categories must exist as Paperclip labels. Create them via `POST /api/companies/{companyId}/labels` with `{ "name": "...", "color": "..." }` before creating your first issues. Attach labels to every issue via `labelIds`.

| Label | Color | Use for |
|:------|:------|:--------|
| feature | `0075ca` | New user-facing capability |
| bug | `d73a4a` | Defect or regression |
| chore | `7057ff` | Refactoring, cleanup, dependency updates |
| spike | `006b75` | Research or investigation with a time-box |
| blocked | `e4e669` | Cannot proceed, needs unblocking |

Add more labels as the project evolves (e.g., `docs`, `design`, `security`). Pick distinct hex colors. Fetch existing labels: `GET /api/companies/{companyId}/labels`.

## Backlog Snapshot

_Summary of current backlog health. Update on each heartbeat cycle._

- **Unassigned todo issues:** _(count)_
- **In-progress issues:** _(count)_
- **Health:** _(healthy / thin / empty / bloated — see backlog-process.md)_

## Decisions Log

Record significant backlog decisions so context isn't lost:

| Date | Decision | Rationale |
|:-----|:---------|:----------|
| | | |

## Notes

_(Anything relevant to backlog strategy: deferred items, external dependencies, scope changes, feedback from other agents.)_
