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
