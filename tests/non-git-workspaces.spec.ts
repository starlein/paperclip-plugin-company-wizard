import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createProjectSchema } from '@paperclipai/shared';
import { prepareLocalProjectWorkspace } from '../src/worker.js';
// @ts-ignore plain JS assembler
import { assembleCompany } from '../src/logic/assemble.js';
// @ts-ignore plain JS client
import { PaperclipClient } from '../src/api/client.js';

describe('explicit local workspace without Git initialization', () => {
  it.each([false, true])(
    'preserves setupCommand:null through assembly and preparation (isolation=%s)',
    async (isolated) => {
      const outputDir = await mkdtemp(join(tmpdir(), 'no-git-workspace-'));
      try {
        const result = await assembleCompany({
          companyName: 'Research',
          templatesDir: resolve('templates'),
          outputDir,
          extraRoleNames: [],
          moduleNames: [],
          enableIsolatedWorktrees: isolated,
          userProjects: [
            {
              name: 'Reports',
              workspace: { sourceType: 'local_path', setupCommand: null, isPrimary: true },
            },
          ],
        });
        expect(result.mainProject.workspace.setupCommand).toBeNull();
        expect(result.mainProject.executionWorkspacePolicy.defaultMode).toBe('shared_workspace');
        const bootstrap = await readFile(join(result.companyDir, 'BOOTSTRAP.md'), 'utf8');
        expect(bootstrap).toContain('Do not initialize or reset Git');
        expect(bootstrap).not.toContain('Enable isolated worktrees once the repo exists');
        prepareLocalProjectWorkspace(result.mainProject, result.companyDir);
        expect(await readdir(result.mainProject.workspace.cwd)).not.toContain('.git');
        const client = new PaperclipClient('https://not-contacted.invalid');
        let sent: any;
        client._fetch = async (_url: string, options: any) => {
          sent = JSON.parse(options.body);
          return {};
        };
        await client.createProject('company', result.mainProject);
        expect(createProjectSchema.parse(sent).workspace?.setupCommand).toBeNull();
      } finally {
        await rm(outputDir, { recursive: true, force: true });
      }
    },
  );

  it('never initializes an explicitly reused local folder or alters its files', async () => {
    const companyDir = await mkdtemp(join(tmpdir(), 'reuse-local-workspace-'));
    try {
      const cwd = join(companyDir, 'existing');
      await mkdir(cwd);
      await writeFile(join(cwd, 'notes.txt'), 'existing operator content');
      prepareLocalProjectWorkspace(
        { name: 'Existing', workspace: { sourceType: 'local_path', cwd, setupCommand: null } },
        companyDir,
      );
      expect(await readdir(cwd)).toEqual(['notes.txt']);
      expect(await readFile(join(cwd, 'notes.txt'), 'utf8')).toBe('existing operator content');
    } finally {
      await rm(companyDir, { recursive: true, force: true });
    }
  });
});
