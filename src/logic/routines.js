/**
 * Control-plane routines can opt out of the main project so their scheduled
 * issues do not inherit an isolated git-worktree policy.
 */
export function routineUsesProjectWorkspace(routine) {
  return routine?.useProjectWorkspace !== false;
}

/**
 * Build the project fields for routine create/update payloads.
 *
 * On update, a detached routine must explicitly send projectId: null so a
 * previously provisioned project link is removed. Project-scoped routines omit
 * the field during sync so the existing resolved project id is preserved.
 */
export function routineProjectPayload(routine, mainProjectId, { sync = false } = {}) {
  if (!routineUsesProjectWorkspace(routine)) {
    return sync ? { projectId: null } : {};
  }
  return mainProjectId ? { projectId: mainProjectId } : {};
}

/**
 * Resolve a routine template's display title. Module/preset metadata may carry
 * either `title` (current) or the legacy `name` key, so every consumer —
 * BOOTSTRAP.md rendering and provisioning alike — must accept both or the
 * routine is rendered/created with an undefined title.
 */
export function routineTitle(routine) {
  for (const key of ['title', 'name']) {
    const value = routine?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Paperclip's `createRoutineSchema` accepts only these concurrency policies; an
 * unknown value (e.g. the legacy `forbid`, or anything a custom template source
 * ships) is rejected with a 400, which would silently drop the routine and its
 * cron trigger. Map the known legacy spelling and fall back to the wizard
 * default so a bad template value degrades instead of losing the routine.
 */
export const ROUTINE_CONCURRENCY_POLICIES = [
  'coalesce_if_active',
  'always_enqueue',
  'skip_if_active',
];

export const DEFAULT_ROUTINE_CONCURRENCY_POLICY = 'skip_if_active';

const LEGACY_ROUTINE_CONCURRENCY_POLICIES = {
  // "forbid" predates Paperclip's enum and meant "never run two at once",
  // which is exactly `skip_if_active`.
  forbid: 'skip_if_active',
};

export function routineConcurrencyPolicy(routine) {
  const raw =
    typeof routine?.concurrencyPolicy === 'string' ? routine.concurrencyPolicy.trim() : '';
  if (ROUTINE_CONCURRENCY_POLICIES.includes(raw)) return raw;
  return LEGACY_ROUTINE_CONCURRENCY_POLICIES[raw] ?? DEFAULT_ROUTINE_CONCURRENCY_POLICY;
}
