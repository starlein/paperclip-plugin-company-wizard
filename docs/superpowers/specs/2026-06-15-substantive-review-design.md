# Substantive Review — Design

**Date:** 2026-06-15
**Status:** Approved (brainstorming) — ready for implementation plan
**Topic:** Redesign the `pr-review` module's review concept so review delivers real value instead of ceremony.

## Problem

The current PR-review concept feels like theater. Two structural causes:

1. **Review-by-reading.** The `code-reviewer` role (`paperclipRole: "general"`, no native capability) reads a diff and records a verdict. An AI agent reading a sibling agent's code — same model, same shared GitHub account — tends to rubber-stamp. "Looks good" is self-approval in disguise.
2. **No fakeproof signal.** The binding governance signal today is a verdict recorded on the issue's `executionPolicy` stage. An agent can record `approved` without having executed anything. The only signal an author cannot beautify — CI (green/red), executed tests, a real security probe — is not the binding merge gate.

GitHub-native approvals are already (correctly) avoided in the current design, because all agents share one GitHub account and cannot formally approve their own work. So the fix is **not** GitHub-native review; it is anchoring the merge gate to something executed and verifiable.

## Leitprinzip

**The merge gate is "the tests for this change actually ran and passed." Nothing merges on opinion alone.**

Review-by-doing (executed tests, CI, a real probe) is substantive. Review-by-reading is advisory.

## Gate Model — Two Modes

Chosen **at assembly time** by whether the `ci-cd` module is among the active modules.

### CI present → hard gate
- CI (lint + test + build) being **green** is a required precondition to merge. Machine-verified; the author cannot fake it.
- QA's job shifts from "is this correct?" (CI + tests answer that) to **"do the tests actually cover this change, so that green CI is meaningful?"** Green CI on a change with no real tests is worthless — QA owns that judgment.
- The Engineer may only merge once CI is green.

### No CI → degraded gate (graceful fallback)
- There is no machine arbiter, so **QA becomes the CI surrogate**: QA checks out the branch, runs the test suite / build locally, and pastes the **real output** into the verdict.
- A verdict without execution evidence is **invalid**. This is review-by-doing, the honest fallback.
- The Engineer may only merge once QA's evidence-backed approval exists.

### Both modes
A blocking `approved` verdict **must cite concrete evidence** (command + result). A verdict without executed verification is invalid. This removes the "looks good" rubber-stamp — the second theater source.

### The hard gate lives on the Engineer merge-gate stage (QA-independent)
**Decision (preset-coverage):** of the 5 presets that ship `pr-review`, only `quality` staffs a QA agent. To keep the gate effective everywhere without forcing an extra agent into every preset, the **hard evidence precondition (CI green / tests-ran-with-output) is enforced on the Engineer's final merge-gate stage — always, regardless of whether QA is present.** The Engineer may not merge until that precondition is met.

QA, when present, is an **additional** substantive review stage on top (test adequacy in CI mode; run-the-tests in no-CI mode). When QA is absent, the merge-gate Engineer carries the full evidence burden (run the tests/build, paste output, or confirm CI green). The presets are **not** changed to add QA — `quality` remains the QA showcase preset.

## Reviewer Roles & Stage Order

The `executionPolicy` stages the Engineer sets on the originating issue, in order:

1. **review: QA** *(blocking)* — the substantive gate (test adequacy in CI mode; run-the-tests in no-CI mode).
2. **review: Security Engineer** *(blocking, conditional)* — added **only** when the change is security-relevant (auth, secrets, input boundaries, crypto, dependency changes, infra exposure). The Engineer adds this stage **per skill guidance**, not statically. Substantive probe, not a read. **Note:** `security-engineer` is not part of `pr-review` today — see *Security stage home* below.
3. **review: code-reviewer / domain (UI/UX/DevOps)** *(advisory, non-blocking)* — optional comments only.
4. **approval: Product Owner** — intent / scope / acceptance check. Light, non-technical.
5. **approval: Engineer** — merge gate, **always the last stage**. Carries the hard evidence precondition: merges only after CI is green (CI mode) or the tests/build have been run with output recorded (no-CI mode), then records `approved` → closes the issue to `done`. This precondition holds **even when no QA stage exists** — the Engineer is the backstop.

The hard gate (CI green / executed-tests evidence) sits as a **precondition over stage 5**, QA-independent. No merge without it.

### code-reviewer disposition
The `code-reviewer` role is **removed from the default review gate** but **kept available**. It becomes a non-binding, advisory reviewer (optional comments). The role and its `pr-review/agents/code-reviewer/` skills stay in the template tree for projects that want a second pair of eyes — they simply do not gate the merge.

### Security stage home
`security-engineer` is **not** part of `pr-review` today (not in `activatesWithRoles`, no `pr-review/agents/security-engineer/`; the only security-review skill lives in the separate `security-audit` module). To give the conditional security stage a real home (and avoid speculative wiring per the orphan-template preference), this change adds:
- `security-engineer` to `pr-review`'s `activatesWithRoles`.
- a PR-scoped `pr-review/agents/security-engineer/skills/pr-security-review.md` — focused on reviewing *this PR's diff* for security-relevant changes (distinct from the broader `security-audit` threat-modeling skill), with the same evidence requirement (state what was probed). **Named `pr-security-review.md`, not `security-review.md`, to avoid clobbering the `security-audit` capability skill of the same name when both modules are active** (the non-capability skill loop overwrites by filename).

If no Security Engineer is on the team, the stage is simply never added — graceful degradation, consistent with `resolveReviewGate` dropping absent roles.

## Mechanics (files to change)

- **`templates/modules/pr-review/module.meta.json`** — `reviewGate` slimmed to `{ "reviewers": ["qa"], "approver": "product-owner", "mergeGate": "engineer" }`. `code-reviewer` removed from `reviewers`. Security + domain reviewers are added conditionally by the Engineer (skill-guided), not hard-wired. Update the module `description`.
- **`src/logic/assemble.js`** (`resolveReviewGate` / `renderExecutionPolicy`) — add **CI-awareness**: when `ci-cd` is among the active modules, render a "CI green required before merge" precondition line into the executionPolicy sketch and BOOTSTRAP; otherwise render the "QA must run the tests/build and paste output" fallback line. Add the evidence-required note in both cases.
- **BOOTSTRAP.md text block** (the `moduleNames.includes('pr-review')` branch in `assemble.js`) — rewritten to reflect the new model with the CI / no-CI branch, the advisory code-reviewer, the conditional security stage, and the evidence requirement.
- **Skills:**
  - `pr-review/agents/qa/skills/qa-review.md` — rewritten: QA is now *the* gate, with the two explicit modes; no-CI mode mandates running the suite and pasting output; a verdict without execution evidence is invalid.
  - `pr-review/agents/code-reviewer/skills/code-review.md` — reframed as advisory: "Your verdict is non-binding; QA + CI gate the merge. You provide advisory comments."
  - **New:** `pr-review/agents/security-engineer/skills/pr-security-review.md` — PR-scoped security review with evidence requirement (see *Security stage home*). Add `security-engineer` to `pr-review`'s `activatesWithRoles`.
  - `pr-review/docs/pr-conventions.md` — Review Workflow + Merge Rules rewritten around CI-as-gate / QA-evidence / advisory code-reviewer / conditional security.
- **Tests:**
  - `src/logic/assemble.integration.test.js` — update reviewGate-resolution assertions; add CI-mode vs no-CI-mode assertions for the rendered executionPolicy / BOOTSTRAP text.
  - `tests/plugin.spec.ts` — adjust if any manifest/wording assertion is affected.

## Rollout

**New default.** This replaces the old `pr-review` model directly — no opt-in flag. Rationale: it is a *correction of a broken concept*, not an additive feature (the old model **is** the theater). No new setting, less maintenance burden, no two parallel review concepts to maintain.

(Contrast: persona enrichment was additive and therefore gated behind `enableEnrichedPersonas`. This is not additive.)

## Out of Scope

- Provisioning / hiring governance (the CEO's auto-approve hiring fallback) — a separate concern, deliberately not touched here.
- Collapsing the full role taxonomy toward Paperclip's 4 archetypes — not part of this change.
- GitHub-native approving reviews / branch protection requiring approvals — explicitly avoided (single shared account).

## Success Criteria

- With `ci-cd` active: BOOTSTRAP + executionPolicy guidance make CI-green a stated precondition to merge.
- Without `ci-cd`: QA is instructed to run tests and paste output; "approved" without evidence is documented as invalid.
- `code-reviewer` no longer appears as a blocking reviewer in the default gate, but remains available.
- QA's skill makes it the substantive gate in both modes.
- Tests assert both modes.
