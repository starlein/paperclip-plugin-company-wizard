import { describe, expect, it } from 'vitest';
import {
  getRepositoryMode,
  isExternalRepository,
  repositoryProjectFields,
} from '../src/ui/lib/repository';
import type { WizardProject } from '../src/ui/context/WizardContext';

const baseProject = (): WizardProject => ({
  name: 'Project',
  description: 'desc',
  goals: ['ship'],
});

describe('repository helpers', () => {
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
});
