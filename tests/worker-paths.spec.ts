import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveWritableCompaniesDir } from '../src/worker.js';

function eacces(message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = 'EACCES';
  return err;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveWritableCompaniesDir', () => {
  it('prefers Docker layout (~/instances) when it exists', () => {
    const homeDir = '/paperclip';
    vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
    vi.spyOn(os, 'tmpdir').mockReturnValue('/tmp/fallback');
    // ~/instances exists → Docker layout detected
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const str = String(p);
      return str === path.join(homeDir, 'instances');
    });
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'accessSync').mockReturnValue(undefined);

    const dir = resolveWritableCompaniesDir({});

    expect(dir).toBe(path.join(homeDir, 'instances', 'default', 'companies'));
  });

  it('falls back to ~/.paperclip when not in Docker layout', () => {
    const homeDir = '/home/user';
    vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
    vi.spyOn(os, 'tmpdir').mockReturnValue('/tmp/fallback');
    // No ~/instances → not Docker
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const str = String(p);
      // ~/instances does NOT exist, but ~/.paperclip/instances/default/companies does
      return str !== path.join(homeDir, 'instances');
    });
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'accessSync').mockReturnValue(undefined);

    const dir = resolveWritableCompaniesDir({});

    expect(dir).toBe(path.join(homeDir, '.paperclip', 'instances', 'default', 'companies'));
  });

  it('fails fast when configured companiesDir is not writable', () => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw eacces('permission denied');
    });

    expect(() => resolveWritableCompaniesDir({ companiesDir: '/custom/companies' })).toThrow(
      'Configured companiesDir is not writable (/custom/companies): permission denied',
    );
  });

  it('falls back to tmpdir if neither default location is writable', () => {
    const homeDir = '/home/unwritable';
    vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
    vi.spyOn(os, 'tmpdir').mockReturnValue('/tmp/fallback');
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      const str = String(p);
      // No Docker layout
      return str !== path.join(homeDir, 'instances');
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation((dirPath) => {
      const dir = String(dirPath);
      if (dir === path.join(homeDir, '.paperclip', 'instances', 'default', 'companies')) {
        throw eacces('permission denied');
      }
      return undefined;
    });
    vi.spyOn(fs, 'accessSync').mockImplementation((dirPath) => {
      const dir = String(dirPath);
      if (dir === path.join(homeDir, '.paperclip', 'instances', 'default', 'companies')) {
        throw eacces('permission denied');
      }
    });

    const dir = resolveWritableCompaniesDir({});

    expect(dir).toBe('/tmp/fallback/paperclip-companies');
  });
});