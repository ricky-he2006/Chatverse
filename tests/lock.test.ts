import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireInstallationLock } from '../server/lock';
import { removeOwnedTestDirectory } from './helpers';
test('installation lock prevents a second authoritative writer and can be released', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chatverse-lock-'));
  try {
    const release = acquireInstallationLock(directory);
    assert.throws(() => acquireInstallationLock(directory), /already owns/);
    release();
    const next = acquireInstallationLock(directory);
    next();
  } finally {
    removeOwnedTestDirectory(directory);
  }
});
