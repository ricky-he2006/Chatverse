import { basename, dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
export function removeOwnedTestDirectory(directory: string) {
  const target = resolve(directory),
    root = resolve(tmpdir());
  if (dirname(target) !== root || !basename(target).startsWith('chatverse-'))
    throw new Error('Refusing to remove a directory outside the owned ChatVerse test prefix.');
  rmSync(target, { recursive: true, force: true });
}
