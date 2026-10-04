import { describe, expect, it } from 'vitest';
import {
  getRepositoryMode,
  isExternalRepository,
  normalizeExternalRepoRef,
  normalizeNewRepoBranch,
  repositoryProjectFields,
} from '../src/ui/lib/repository';
import type { WizardProject } from '../src/ui/context/WizardContext';

const baseProject = (): WizardProject => ({
  name: 'Project',
  description: 'desc',
  goals: ['ship'],
});

describe('repository helpers', () => {
  it('does not reuse the old checkout when the remote repository URL changes', () => {
    const project: WizardProject = {
      ...baseProject(),
      workspace: {
        sourceType: 'git_repo',
        cwd: '/work/old',
        repoUrl: 'https://example.com/old.git',
        setupCommand: 'old-repo-setup',
        metadata: { owner: 'old' },
      },
    };
    const saved = repositoryProjectFields(
      'external',
      'https://example.com/new.git',
      'trunk',
      project,
    );
    expect(saved.workspace?.repoUrl).toBe('https://example.com/new.git');
    expect(saved.workspace?.cwd).toBeUndefined();
    expect(saved.workspace?.metadata).toBeUndefined();
    expect(saved.workspace?.setupCommand).toBeUndefined();
  });
  it('preserves operator policy when saving an unchanged directory workspace', () => {
    const project: WizardProject = {
      ...baseProject(),
      workspace: {
        sourceType: 'local_path',
        cwd: '/work/docs',
        setupCommand: null,
        isPrimary: false,
      },
      executionWorkspacePolicy: {
        enabled: false,
        defaultMode: 'shared_workspace',
        allowIssueOverride: false,
      },
    };
    const saved = repositoryProjectFields('directory', '', '', project);
    expect(saved.executionWorkspacePolicy).toEqual(project.executionWorkspacePolicy);
    expect(saved.workspace?.isPrimary).toBe(false);
  });
  it('supports explicit no-Git directories and preserves local cwd on saves and transitions', () => {
    const existing = {
      ...baseProject(),
      workspace: {
        sourceType: 'local_path',
        cwd: '/work/research',
        setupCommand: null,
        metadata: { owner: 'research' },
      },
    };
    expect(getRepositoryMode(existing)).toBe('directory');
    const directory = repositoryProjectFields('directory', 'stale.git', 'main', existing);
    expect(directory.workspace).toMatchObject({
      sourceType: 'local_path',
      cwd: '/work/research',
      setupCommand: null,
      metadata: { owner: 'research' },
    });
    expect(directory.repoUrl).toBeUndefined();
    expect(directory.defaultRef).toBeUndefined();
    expect(directory.workspace?.repoRef).toBeUndefined();
    const git = repositoryProjectFields('new', '', 'dev', existing);
    expect(git.workspace).toMatchObject({ cwd: '/work/research', setupCommand: 'git init -b dev' });
    expect(getRepositoryMode({ ...existing, ...git })).toBe('new');
    const remote = repositoryProjectFields('external', 'https://example.com/repo', '', existing);
    expect(remote.workspace?.cwd).toBeUndefined();
    expect(remote.workspace?.setupCommand).toBeUndefined();
    expect(getRepositoryMode({ ...existing, ...remote })).toBe('external');
    const back = repositoryProjectFields('directory', '', '', { ...existing, ...remote });
    expect(back.workspace?.setupCommand).toBeNull();
    expect(back.workspace?.repoUrl).toBeUndefined();
  });
  it('keeps an unchanged existing workspace and explicit no-Git intent over stale Git fields', () => {
    const directory = {
      ...baseProject(),
      repoUrl: 'old.git',
      workspace: {
        sourceType: 'local_path',
        cwd: '/work/docs',
        setupCommand: null,
        repoRef: 'old',
      },
    };
    expect(getRepositoryMode(directory)).toBe('directory');
    const saved = repositoryProjectFields('directory', 'old.git', 'old', directory);
    expect(saved.workspace?.cwd).toBe('/work/docs');
    expect(saved.workspace?.setupCommand).toBeNull();
    expect(saved.repoUrl).toBeUndefined();
    expect(saved.workspace?.repoRef).toBeUndefined();
    const remote = {
      ...baseProject(),
      workspace: {
        sourceType: 'git_repo',
        cwd: '/work/git',
        repoUrl: 'https://example.com/repo',
        setupCommand: 'npm ci',
      },
    };
    expect(
      repositoryProjectFields('external', 'https://example.com/repo', '', remote).workspace,
    ).toEqual(remote.workspace);
  });
  it('derives external mode from workspaceSourceType', () => {
    const externalFromSourceType: WizardProject = {
      ...baseProject(),
      workspaceSourceType: 'git_repo',
    };

    expect(getRepositoryMode(externalFromSourceType)).toBe('external');
    expect(isExternalRepository(externalFromSourceType)).toBe(true);
  });

  it('defaults to new for legacy local workspaceSourceType', () => {
    const localFromSourceType: WizardProject = {
      ...baseProject(),
      workspaceSourceType: 'local_path',
    };

    expect(getRepositoryMode(localFromSourceType)).toBe('new');
    expect(isExternalRepository(localFromSourceType)).toBe(false);
  });

  it('keeps explicit local mode even when external fallback fields are absent', () => {
    const localFromLegacy = {
      ...baseProject(),
      workspace: { sourceType: 'local_path', setupCommand: 'git init -b main' },
    };

    expect(getRepositoryMode(localFromLegacy)).toBe('new');
    expect(isExternalRepository(localFromLegacy)).toBe(false);
  });

  it('keeps explicit local mode when switching from external in repository fields', () => {
    const repo = repositoryProjectFields('new', '', 'origin/main');

    const localProject: WizardProject = {
      ...baseProject(),
      ...repo,
    };

    expect(getRepositoryMode(localProject)).toBe('new');
    expect(isExternalRepository(localProject)).toBe(false);
  });

  it('repositoryProjectFields clears legacy workspaceSourceType when switching modes', () => {
    const staleExternal = {
      ...baseProject(),
      workspaceSourceType: 'git_repo',
      workspace: {
        sourceType: 'git_repo',
        repoUrl: 'https://example.com/old.git',
      },
      repoUrl: 'https://example.com/old.git',
      executionWorkspacePolicy: {
        defaultMode: 'isolated_workspace',
      },
    };

    const localProject: WizardProject = {
      ...staleExternal,
      ...repositoryProjectFields('new', '', 'origin/main'),
    };

    expect(getRepositoryMode(localProject)).toBe('new');
    expect(isExternalRepository(localProject)).toBe(false);
    expect(localProject.workspaceSourceType).toBe('local_path');
    expect(localProject.workspace?.sourceType).toBe('local_path');
    expect(localProject.executionWorkspacePolicy).toBeUndefined();
    expect(localProject.repoUrl).toBeUndefined();
  });

  it('preserves explicit external refs and local refs from project settings', () => {
    expect(normalizeExternalRepoRef('main')).toBe('main');
    expect(normalizeExternalRepoRef('release/2026-q2')).toBe('release/2026-q2');
    expect(normalizeExternalRepoRef('origin/master')).toBe('origin/master');
    expect(normalizeExternalRepoRef('')).toBe('');
    expect(normalizeNewRepoBranch('origin/master')).toBe('master');
  });

  it('does not invent an external base ref when none is configured', () => {
    const repo = repositoryProjectFields('external', 'https://github.com/example/project.git', '');

    expect(repo.repoRef).toBeUndefined();
    expect(repo.defaultRef).toBeUndefined();
    expect(repo.workspace?.repoRef).toBeUndefined();
    expect(repo.workspace?.defaultRef).toBeUndefined();
  });

  it('does not force isolated worktree policy from repository UI fields', () => {
    const repo = repositoryProjectFields(
      'external',
      'https://github.com/example/project.git',
      'release/2026-q2',
    );

    expect(repo.workspace?.repoRef).toBe('release/2026-q2');
    expect(repo.workspace?.defaultRef).toBe('release/2026-q2');
    expect(repo.executionWorkspacePolicy).toBeUndefined();
  });
});
