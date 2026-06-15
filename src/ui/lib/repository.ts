import type { WizardProject } from '../context/WizardContext';

export type RepositoryMode = 'new' | 'external';

function resolveWorkspaceSourceType(project: WizardProject | null | undefined): string | undefined {
  const sourceType = project?.workspace?.sourceType || project?.workspaceSourceType;
  return typeof sourceType === 'string' ? sourceType.trim() : undefined;
}

/** Derives the repository mode from a project's current workspace config. */
export function getRepositoryMode(project: WizardProject | null | undefined): RepositoryMode {
  const workspace = project?.workspace;
  const sourceType = resolveWorkspaceSourceType(project);
  if (
    sourceType === 'git_repo' ||
    workspace?.repoUrl ||
    project?.repoUrl ||
    (typeof sourceType === 'string' && sourceType !== 'local_path' && sourceType.length > 0)
  ) {
    return 'external';
  }
  return 'new';
}

export function isExternalRepository(project: WizardProject | null | undefined): boolean {
  const sourceType = resolveWorkspaceSourceType(project);
  return (
    (typeof sourceType === 'string' && sourceType !== 'local_path' && sourceType.length > 0) ||
    Boolean(project?.workspace?.repoUrl || project?.repoUrl)
  );
}

export function getRepositoryUrl(project: WizardProject | null | undefined): string {
  return project?.workspace?.repoUrl || project?.repoUrl || '';
}

export function getRepositoryRef(
  project: WizardProject | null | undefined,
  mode: RepositoryMode,
): string {
  const configured =
    project?.workspace?.defaultRef ||
    project?.workspace?.repoRef ||
    project?.defaultRef ||
    project?.repoRef ||
    '';
  return configured || (mode === 'new' ? 'main' : '');
}

export function normalizeExternalRepoRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^[A-Za-z0-9._:/-]+$/.test(trimmed) ? trimmed : '';
}

export function normalizeNewRepoBranch(value: string): string {
  const raw = value.trim().replace(/^origin\//, '') || 'main';
  return /^[A-Za-z0-9._/-]+$/.test(raw) ? raw : 'main';
}

/**
 * Builds the repository-related fields of a project from the chosen mode.
 *
 * Repository selection deliberately carries NO `executionWorkspacePolicy`.
 * Isolated worktrees are an instance/project policy and are applied by the
 * assembler only when Paperclip's isolated-workspace experiment is enabled.
 */
export function repositoryProjectFields(
  mode: RepositoryMode,
  repoUrl: string,
  repoRef: string,
): Pick<
  WizardProject,
  | 'repoUrl'
  | 'repoRef'
  | 'defaultRef'
  | 'workspace'
  | 'executionWorkspacePolicy'
  | 'workspaceSourceType'
> {
  if (mode === 'external') {
    const ref = normalizeExternalRepoRef(repoRef);
    const url = repoUrl.trim();
    return {
      workspaceSourceType: 'git_repo',
      repoUrl: url,
      ...(ref ? { repoRef: ref, defaultRef: ref } : { repoRef: undefined, defaultRef: undefined }),
      workspace: {
        sourceType: 'git_repo',
        repoUrl: url,
        ...(ref ? { repoRef: ref, defaultRef: ref } : {}),
        isPrimary: true,
      },
      executionWorkspacePolicy: undefined,
    };
  }

  const branch = normalizeNewRepoBranch(repoRef);
  return {
    workspaceSourceType: 'local_path',
    repoUrl: undefined,
    repoRef: undefined,
    defaultRef: branch,
    workspace: {
      sourceType: 'local_path',
      defaultRef: branch,
      setupCommand: `git init -b ${branch}`,
      isPrimary: true,
    },
    executionWorkspacePolicy: undefined,
  };
}
