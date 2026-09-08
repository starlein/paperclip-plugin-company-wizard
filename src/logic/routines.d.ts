export function routineUsesProjectWorkspace(routine: unknown): boolean;

export function routineProjectPayload(
  routine: unknown,
  mainProjectId?: string,
  options?: { sync?: boolean },
): { projectId?: string | null };

export function routineTitle(routine: unknown): string;

export const ROUTINE_CONCURRENCY_POLICIES: string[];
export const DEFAULT_ROUTINE_CONCURRENCY_POLICY: string;

export function routineConcurrencyPolicy(routine: unknown): string;
