import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareSemver, isNewerVersion } from './version.js';

describe('version helpers', () => {
  it('compares semver-like plugin versions', () => {
    assert.equal(compareSemver('0.3.25', '0.3.24'), 1);
    assert.equal(compareSemver('0.3.24', '0.3.24'), 0);
    assert.equal(compareSemver('0.3.23', '0.3.24'), -1);
    assert.equal(compareSemver('v1.0.0', '0.9.9'), 1);
  });

  it('detects newer latest versions only', () => {
    assert.equal(isNewerVersion('0.3.25', '0.3.24'), true);
    assert.equal(isNewerVersion('0.3.24', '0.3.24'), false);
    assert.equal(isNewerVersion('0.3.23', '0.3.24'), false);
  });
});
