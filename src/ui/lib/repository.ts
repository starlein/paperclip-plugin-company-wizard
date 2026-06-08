import type { WizardProject } from '../context/WizardContext';

export type RepositoryMode = 'new' | 'external';

/** Derives the repository mode from a project's current workspace config. */
export function getRepositoryMode(project: WizardProject | null | undefined): RepositoryMode {
  const workspace = project?.workspace;
  if (workspace?.sourceType === 'git_repo' || workspace?.repoUrl || project?.repoUrl) {
    return 'external';
  }
  return 'new';
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
  'repoUrl' | 'repoRef' | 'defaultRef' | 'workspace' | 'executionWorkspacePolicy'
> {
  if (mode === 'external') {
    const ref = repoRef.trim() || 'origin/main';
    const url = repoUrl.trim();
    return {
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
