import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { RuleError } from './engine';

/** Windows user-bound DPAPI. No plaintext token ever goes into a source file or log. */
export class TokenVault {
  constructor(private file: string) {}
  private crypt(value: string, decrypt = false): string {
    if (process.platform !== 'win32')
      throw new RuleError(
        'This build uses Windows DPAPI for Twitch tokens. A portable OS vault adapter is required on this platform.',
        'VAULT_UNAVAILABLE',
        503,
      );
    const operation = decrypt ? 'Unprotect' : 'Protect';
    const script = `Add-Type -AssemblyName System.Security; $inputValue=[Console]::In.ReadToEnd(); $bytes=${decrypt ? '[Convert]::FromBase64String($inputValue)' : '[Text.Encoding]::UTF8.GetBytes($inputValue)'}; $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write(${decrypt ? '[Text.Encoding]::UTF8.GetString($result)' : '[Convert]::ToBase64String($result)'});`;
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      input: value,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  }
  read<T>(): T | null {
    if (!existsSync(this.file)) return null;
    try {
      return JSON.parse(this.crypt(readFileSync(this.file, 'utf8'), true));
    } catch {
      throw new RuleError(
        'Unable to unlock Twitch credentials for this Windows account. Reconnect from Settings.',
        'VAULT_UNAVAILABLE',
        503,
      );
    }
  }
  write(value: unknown) {
    writeFileSync(this.file, this.crypt(JSON.stringify(value)), { mode: 0o600 });
  }
}
