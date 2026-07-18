export function routineUsesProjectWorkspace(routine: unknown): boolean;

export function routineProjectPayload(
  routine: unknown,
  mainProjectId?: string,
  options?: { sync?: boolean },
): { projectId?: string | null };
