import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TokenVault } from '../server/vault';
import { removeOwnedTestDirectory } from './helpers';
test(
  'Windows DPAPI round-trips credentials without plaintext on disk',
  { skip: process.platform !== 'win32' },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'chatverse-vault-'));
    try {
      const file = join(dir, 'test.dpapi'),
        vault = new TokenVault(file),
        data = {
          access_token: 'synthetic-vault-test-only',
          refresh_token: 'synthetic-refresh-only',
        };
      assert.equal(vault.read(), null);
      vault.write(data);
      assert.deepEqual(vault.read(), data);
      assert.ok(!readFileSync(file, 'utf8').includes(data.access_token));
      vault.write(null);
      assert.equal(vault.read(), null);
    } finally {
      removeOwnedTestDirectory(dir);
    }
  },
);
