import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as childProcess from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import { createTestHarness } from '@paperclipai/plugin-sdk/testing';
import manifest from '../src/manifest.js';
import plugin, { ensureTemplatesDir } from '../src/worker.js';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));

const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture(withCeo = false) {
  const dir = await mkdtemp(join(tmpdir(), 'wizard-template-validation-'));
  dirs.push(dir);
  if (withCeo) {
    await mkdir(join(dir, 'roles', 'ceo'), { recursive: true });
    await writeFile(
      join(dir, 'roles', 'ceo', 'role.meta.json'),
      JSON.stringify({ name: 'ceo', base: true }),
    );
  }
  return dir;
}

async function harnessFor(templatesPath: string) {
  const harness = createTestHarness({
    manifest,
    capabilities: manifest.capabilities,
    config: { templatesPath },
  });
  await plugin.definition.setup(harness.ctx);
  return harness;
}

describe('explicit empty directory sync', () => {
  async function setup(url = 'https://github.com/example/custom/tree/main/templates') {
    const parent = await fixture();
    const templatesPath = join(parent, 'templates');
    fs.mkdirSync(templatesPath);
    const config = { templatesPath, templatesRepoUrl: url };
    const harness = createTestHarness({ manifest, capabilities: manifest.capabilities, config });
    await plugin.definition.setup(harness.ctx);
    vi.mocked(childProcess.execFileSync).mockReset();
    return { harness, config, parent };
  }
  function download(onClone = () => {}) {
    vi.mocked(childProcess.execFileSync).mockImplementation((_cmd, args) => {
      const argv = args as string[];
      if (argv[0] === 'clone') {
        const root = join(argv.at(-1)!, 'templates', 'roles', 'ceo');
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(join(root, 'role.meta.json'), JSON.stringify({ name: 'ceo', base: true }));
        onClone();
      }
      return Buffer.from('');
    });
  }
  it('offers without fetching, requires confirmation, syncs and reloads the catalog', async () => {
    const { harness, config } = await setup();
    const data = await harness.getData<any>('templates');
    expect(data.syncOffer.canSync).toBe(true);
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
    expect((await harness.performAction<any>('sync-empty-templates', {})).ok).toBe(false);
    expect((await harness.performAction<any>('refresh-templates', {})).ok).toBe(false);
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
    download();
    expect(
      (
        await harness.performAction<any>('sync-empty-templates', {
          confirmation: data.syncOffer.token,
        })
      ).ok,
    ).toBe(true);
    expect(await ensureTemplatesDir(config)).toBe(config.templatesPath);
    const loaded = await harness.getData<any>('templates');
    expect(loaded.roles).toHaveLength(1);
    expect(loaded.syncOffer).toBeUndefined();
  });
  it('requires a saved URL and does not invent a default', async () => {
    const { harness } = await setup('');
    const data = await harness.getData<any>('templates');
    expect(data.syncOffer.canSync).toBe(false);
    expect(data.error).toContain('Set templatesRepoUrl');
    expect(
      (
        await harness.performAction<any>('sync-empty-templates', {
          confirmation: data.syncOffer.token,
        })
      ).ok,
    ).toBe(false);
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
  });
  it.each(['network', 'invalid', 'race', 'last-moment-race', 'populated', 'symlink'])(
    'preserves operator files and removes staging on %s',
    async (failure) => {
      const { harness, config, parent } = await setup();
      const data = await harness.getData<any>('templates');
      const sentinel = join(config.templatesPath, '.operator');
      download(() => {
        if (failure === 'network') throw new Error('secret network details');
        if (failure === 'race') fs.writeFileSync(sentinel, 'keep');
      });
      if (failure === 'invalid')
        vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(''));
      if (failure === 'populated') fs.writeFileSync(sentinel, 'keep');
      if (failure === 'symlink') {
        fs.rmdirSync(config.templatesPath);
        fs.symlinkSync(await fixture(), config.templatesPath);
      }
      if (failure === 'last-moment-race') {
        const rename = fs.renameSync;
        vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
          fs.writeFileSync(sentinel, 'keep');
          return rename(from, to);
        });
      }
      const result = await harness.performAction<any>('sync-empty-templates', {
        confirmation: data.syncOffer.token,
      });
      expect(result.ok).toBe(false);
      expect(result.error).not.toContain('secret');
      expect(fs.readdirSync(parent)).toEqual(['templates']);
      if (['race', 'last-moment-race', 'populated'].includes(failure))
        expect(fs.readFileSync(sentinel, 'utf8')).toBe('keep');
      if (failure === 'network' || failure === 'invalid')
        expect(fs.readdirSync(config.templatesPath)).toEqual([]);
      if (failure === 'populated' || failure === 'symlink') {
        expect(childProcess.execFileSync).not.toHaveBeenCalled();
        expect((await harness.getData<any>('templates')).syncOffer).toBeUndefined();
      }
    },
  );
  it.each([
    'https://evil.test/github.com/a/b/tree/main/templates',
    'https://user:secret@github.com/a/b/tree/main/templates',
    'https://github.com/a/b/tree/main/../outside',
    'https://github.com/a/b/tree/main/-option',
  ])('rejects unsafe URL without invoking git: %s', async (url) => {
    const { harness } = await setup(url);
    const data = await harness.getData<any>('templates');
    const result = await harness.performAction<any>('sync-empty-templates', {
      confirmation: data.syncOffer.token,
    });
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain('secret');
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
  });
});

describe('template source validation', () => {
  it('rejects an existing empty directory with actionable local-path guidance', async () => {
    const templatesPath = await fixture();
    await expect(ensureTemplatesDir({ templatesPath })).rejects.toThrow(/templatesPath.*clear/i);
  });

  it('does not hide an invalid explicit path behind the configured GitHub source', async () => {
    const templatesPath = await fixture();
    await expect(
      ensureTemplatesDir({
        templatesPath,
        templatesRepoUrl:
          'https://github.com/starlein/paperclip-plugin-company-wizard/tree/main/templates',
      }),
    ).rejects.toThrow(templatesPath);
  });

  it('rejects a file used as the template root', async () => {
    const dir = await fixture();
    const templatesPath = join(dir, 'file');
    await writeFile(templatesPath, 'operator-owned');
    await expect(ensureTemplatesDir({ templatesPath })).rejects.toThrow(/directory/i);
    expect(await readFile(templatesPath, 'utf8')).toBe('operator-owned');
  });

  it('allows a CEO-only custom company without optional presets or modules', async () => {
    const templatesPath = await fixture(true);
    expect(await ensureTemplatesDir({ templatesPath })).toBe(templatesPath);
    const data = await (await harnessFor(templatesPath)).getData<any>('templates');
    expect(data.error).toBeUndefined();
    expect(data.roles).toEqual([{ name: 'ceo', base: true, _base: true }]);
  });

  it('reports the failing source instead of returning a silent empty catalog', async () => {
    const templatesPath = await fixture();
    const data = await (await harnessFor(templatesPath)).getData<any>('templates');
    expect(data.error).toContain(templatesPath);
    expect(data.loadErrors).toEqual([data.error]);
  });

  it('refresh refuses an empty operator path and never populates or overwrites it', async () => {
    const templatesPath = await fixture();
    const sentinel = join(templatesPath, 'README.md');
    await writeFile(sentinel, 'operator-owned');
    const result = await (
      await harnessFor(templatesPath)
    ).performAction<any>('refresh-templates', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain(templatesPath);
    expect(await readFile(sentinel, 'utf8')).toBe('operator-owned');
  });

  it('configuration test detects invalid templates before making API requests', async () => {
    const templatesPath = await fixture();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await plugin.definition.onValidateConfig!({ templatesPath });
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain(templatesPath);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('configuration test rejects malformed optional metadata', async () => {
    const templatesPath = await fixture(true);
    await mkdir(join(templatesPath, 'modules', 'broken'), { recursive: true });
    await writeFile(join(templatesPath, 'modules', 'broken', 'module.meta.json'), '{');
    const result = await plugin.definition.onValidateConfig!({ templatesPath });
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('module.meta.json');
  });

  it('configuration test still verifies API connectivity for valid bundled templates', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await plugin.definition.onValidateConfig!({ paperclipUrl: 'http://validation.test' }),
    ).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('preview refuses invalid templates before assembly or provisioning', async () => {
    const templatesPath = await fixture();
    const result = await (
      await harnessFor(templatesPath)
    ).performAction<any>('preview-files', { companyName: 'Test' });
    expect(result.error).toContain(templatesPath);
  });

  it.each(['missing-ceo', 'invalid-json'])(
    'preserves the previous remote cache after an invalid download (%s)',
    async (failure) => {
      const home = await fixture();
      vi.spyOn(os, 'homedir').mockReturnValue(home);
      let broken = false;
      vi.mocked(childProcess.execFileSync).mockImplementation((_command, args) => {
        const argv = args as string[];
        if (argv[0] === 'clone') {
          const root = join(argv[argv.length - 1], 'templates');
          fs.mkdirSync(root, { recursive: true });
          if (!broken || failure !== 'missing-ceo') {
            fs.mkdirSync(join(root, 'roles', 'ceo'), { recursive: true });
            fs.writeFileSync(
              join(root, 'roles', 'ceo', 'role.meta.json'),
              JSON.stringify({ name: 'ceo', base: true }),
            );
          }
          if (broken && failure === 'invalid-json') {
            fs.mkdirSync(join(root, 'modules', 'broken'), { recursive: true });
            fs.writeFileSync(join(root, 'modules', 'broken', 'module.meta.json'), '{');
          }
        }
        return Buffer.from('');
      });
      const config = { templatesRepoUrl: 'https://github.com/example/custom/tree/main/templates' };
      const target = await ensureTemplatesDir(config);
      const before = await readFile(join(target, 'roles', 'ceo', 'role.meta.json'), 'utf8');
      broken = true;
      const harness = createTestHarness({ manifest, capabilities: manifest.capabilities, config });
      await plugin.definition.setup(harness.ctx);
      const refreshed = await harness.performAction<any>('refresh-templates', {});
      expect(refreshed.ok).toBe(false);
      expect(await ensureTemplatesDir(config)).toBe(target);
      expect(await readFile(join(target, 'roles', 'ceo', 'role.meta.json'), 'utf8')).toBe(before);
      expect(fs.readdirSync(join(home, '.paperclip'))).toEqual([target.split('/').pop()]);
    },
  );
});
