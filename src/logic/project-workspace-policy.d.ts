import type { ProjectExecutionWorkspacePolicy } from '../ui/context/WizardContext';

export function normalizeExecutionWorkspacePolicy(
  value: unknown,
): ProjectExecutionWorkspacePolicy | undefined;
export function executionWorkspacePolicyFields(
  policy: ProjectExecutionWorkspacePolicy,
): [string, string][];
