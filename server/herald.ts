import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const cache = new Map<string, Promise<Buffer | null>>();
let running: Promise<unknown> = Promise.resolve();
/** Local Windows voice only. No credentials, network service or LLM. */
export function localSpeech(text: string): Promise<Buffer | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const key = createHash('sha256').update(text).digest('hex');
  const existing = cache.get(key);
  if (existing) return existing;
  const work = running.then(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chatverse-herald-'));
    try {
      await writeFile(join(dir, 'text.txt'), text, 'utf8');
      const script =
        "Add-Type -AssemblyName System.Speech; $voice=New-Object System.Speech.Synthesis.SpeechSynthesizer; try {$voice.SetOutputToWaveFile((Join-Path $env:CV_HERALD_DIR 'voice.wav')); $voice.Speak([IO.File]::ReadAllText((Join-Path $env:CV_HERALD_DIR 'text.txt')))} finally {$voice.Dispose()}";
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            Buffer.from(script, 'utf16le').toString('base64'),
          ],
          { windowsHide: true, env: { ...process.env, CV_HERALD_DIR: dir }, stdio: 'ignore' },
        );
        const timeout = setTimeout(() => {
          child.kill();
          reject(Error('TTS timeout'));
        }, 15000);
        child.on('error', (e) => {
          clearTimeout(timeout);
          reject(e);
        });
        child.on('exit', (code) => {
          clearTimeout(timeout);
          code === 0 ? resolve() : reject(Error('TTS unavailable'));
        });
      });
      return await readFile(join(dir, 'voice.wav'));
    } catch {
      return null;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  running = work.catch(() => {});
  cache.set(key, work);
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  return work;
}
