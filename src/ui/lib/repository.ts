import type { WizardProject } from '../context/WizardContext';

export type RepositoryMode = 'new' | 'external' | 'directory';

function resolveWorkspaceSourceType(project: WizardProject | null | undefined): string | undefined {
  const sourceType = project?.workspace?.sourceType || project?.workspaceSourceType;
  return typeof sourceType === 'string' ? sourceType.trim() : undefined;
}

/** Derives the repository mode from a project's current workspace config. */
export function getRepositoryMode(project: WizardProject | null | undefined): RepositoryMode {
  const workspace = project?.workspace;
  const sourceType = resolveWorkspaceSourceType(project);
  if (workspace?.setupCommand === null && sourceType === 'local_path') return 'directory';
  if (
    sourceType === 'git_repo' ||
    workspace?.repoUrl ||
    project?.repoUrl ||
    (typeof sourceType === 'string' && sourceType !== 'local_path' && sourceType.length > 0)
  ) {
    return 'external';
  }
  if (workspace?.setupCommand === null && (!sourceType || sourceType === 'local_path'))
    return 'directory';
  return 'new';
}

export function isExternalRepository(project: WizardProject | null | undefined): boolean {
  if (getRepositoryMode(project) === 'directory') return false;
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
 * Unchanged workspace saves preserve the operator's executionWorkspacePolicy.
 * Mode/repository changes do not synthesize one: the assembler supplies defaults
 * for new projects while existing project policy remains operator-controlled.
 */
export function repositoryProjectFields(
  mode: RepositoryMode,
  repoUrl: string,
  repoRef: string,
  existing?: WizardProject | null,
): Pick<
  WizardProject,
  | 'repoUrl'
  | 'repoRef'
  | 'defaultRef'
  | 'workspace'
  | 'executionWorkspacePolicy'
  | 'workspaceSourceType'
> {
  const sameMode = existing && getRepositoryMode(existing) === mode;
  if (
    sameMode &&
    mode !== 'directory' &&
    repoUrl === getRepositoryUrl(existing) &&
    repoRef === getRepositoryRef(existing, mode)
  ) {
    return {
      workspaceSourceType: existing.workspaceSourceType,
      repoUrl: existing.repoUrl,
      repoRef: existing.repoRef,
      defaultRef: existing.defaultRef,
      workspace: existing.workspace,
      executionWorkspacePolicy: existing.executionWorkspacePolicy,
    };
  }
  const sameRepository =
    sameMode && (mode !== 'external' || repoUrl.trim() === getRepositoryUrl(existing).trim());
  const retainedWorkspace =
    sameRepository || (mode !== 'external' && existing && !isExternalRepository(existing))
      ? { ...existing?.workspace }
      : {};
  delete retainedWorkspace.repoUrl;
  delete retainedWorkspace.repoRef;
  delete retainedWorkspace.defaultRef;
  delete retainedWorkspace.setupCommand;
  if (mode === 'directory') {
    return {
      workspaceSourceType: 'local_path',
      repoUrl: undefined,
      repoRef: undefined,
      defaultRef: undefined,
      workspace: {
        ...retainedWorkspace,
        sourceType: 'local_path',
        setupCommand: null,
        isPrimary: sameMode ? (existing.workspace?.isPrimary ?? true) : true,
      },
      executionWorkspacePolicy: sameMode ? existing.executionWorkspacePolicy : undefined,
    };
  }
  if (mode === 'external') {
    const ref = normalizeExternalRepoRef(repoRef);
    const url = repoUrl.trim();
    return {
      workspaceSourceType: 'git_repo',
      repoUrl: url,
      ...(ref ? { repoRef: ref, defaultRef: ref } : { repoRef: undefined, defaultRef: undefined }),
      workspace: {
        ...retainedWorkspace,
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
      ...retainedWorkspace,
      sourceType: 'local_path',
      defaultRef: branch,
      setupCommand: `git init -b ${branch}`,
      isPrimary: true,
    },
    executionWorkspacePolicy: undefined,
  };
}
