import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
export function acquireInstallationLock(directory: string) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, '.chatverse.lock');
  if (existsSync(path)) {
    let pid: number;
    try {
      pid = JSON.parse(readFileSync(path, 'utf8')).pid;
      if (!Number.isInteger(pid) || pid <= 0) throw new Error();
    } catch {
      throw new Error(
        'The ChatVerse installation lock is invalid. Stop all instances before removing data/.chatverse.lock.',
      );
    }
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false;
    }
    if (alive)
      throw new Error(
        'Another ChatVerse instance already owns this data directory. Stop it before launching another server.',
      );
    unlinkSync(path);
  }
  const descriptor = openSync(path, 'wx');
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
  } finally {
    closeSync(descriptor);
  }
  return () => {
    try {
      if (JSON.parse(readFileSync(path, 'utf8')).pid === process.pid) unlinkSync(path);
    } catch {
      /* already released */
    }
  };
}
