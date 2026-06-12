import fs from 'node:fs';
import os from 'node:os';
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
  it('falls back to /paperclip when the home default dir is not writable', () => {
    vi.spyOn(os, 'homedir').mockReturnValue('/home/unwritable');
    vi.spyOn(os, 'tmpdir').mockReturnValue('/tmp/fallback');
    vi.spyOn(fs, 'mkdirSync').mockImplementation((dirPath) => {
      if (String(dirPath) === '/home/unwritable/.paperclip/instances/default/companies') {
        throw eacces('permission denied');
      }
      return undefined;
    });
    vi.spyOn(fs, 'accessSync').mockImplementation((dirPath) => {
      if (String(dirPath) === '/home/unwritable/.paperclip/instances/default/companies') {
        throw eacces('permission denied');
      }
    });

    const dir = resolveWritableCompaniesDir({});

    expect(dir).toBe('/paperclip/instances/default/companies');
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
    vi.spyOn(os, 'homedir').mockReturnValue('/home/unwritable');
    vi.spyOn(os, 'tmpdir').mockReturnValue('/tmp/fallback');
    vi.spyOn(fs, 'mkdirSync').mockImplementation((dirPath) => {
      const dir = String(dirPath);
      if (
        dir === '/home/unwritable/.paperclip/instances/default/companies' ||
        dir === '/paperclip/instances/default/companies'
      ) {
        throw eacces('permission denied');
      }
      return undefined;
    });
    vi.spyOn(fs, 'accessSync').mockImplementation((dirPath) => {
      const dir = String(dirPath);
      if (
        dir === '/home/unwritable/.paperclip/instances/default/companies' ||
        dir === '/paperclip/instances/default/companies'
      ) {
        throw eacces('permission denied');
      }
    });

    const dir = resolveWritableCompaniesDir({});

    expect(dir).toBe('/tmp/fallback/paperclip-companies');
  });
});
