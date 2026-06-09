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
  return (
    project?.workspace?.defaultRef ||
    project?.workspace?.repoRef ||
    project?.defaultRef ||
    project?.repoRef ||
    (mode === 'external' ? 'origin/main' : 'main')
  );
}

export function normalizeExternalRepoRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'origin/main';
  if (trimmed.startsWith('origin/') || trimmed.startsWith('refs/')) {
    return trimmed;
  }
  return `origin/${trimmed}`;
}

export function normalizeNewRepoBranch(value: string): string {
  const raw = value.trim().replace(/^origin\//, '') || 'main';
  return /^[A-Za-z0-9._/-]+$/.test(raw) ? raw : 'main';
}

/**
 * Builds the repository-related fields of a project from the chosen mode.
 *
 * A fresh local repository deliberately carries NO `executionWorkspacePolicy`:
 * the repo and its base ref do not exist yet when the first agents wake, so
 * isolated git worktrees would fail on the first run. Agents work in the shared
 * project workspace until the repo is established. External repos keep the
 * isolated git_worktree policy, since they have a real base ref to branch from.
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
      repoRef: ref,
      defaultRef: ref,
      workspace: {
        sourceType: 'git_repo',
        repoUrl: url,
        repoRef: ref,
        defaultRef: ref,
        isPrimary: true,
      },
      executionWorkspacePolicy: {
        defaultMode: 'isolated_workspace',
        workspaceStrategy: { type: 'git_worktree', baseRef: ref },
      },
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
