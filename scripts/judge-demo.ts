import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { World } from '../server/world';
import { RealmRegistry } from '../server/realms';

/** Fresh local fixtures only. Never resets or opens the normal data directory. */
export function prepareJudgeDemo(directory: string) {
  if (existsSync(directory) && readdirSync(directory).length)
    throw new Error(
      'Rehearsal preparation requires an empty directory. Existing worlds are never reset.',
    );
  mkdirSync(directory, { recursive: true });
  const worlds = {
    simulation: new World('simulation', join(directory, 'simulation.sqlite')),
    live: new World('live', join(directory, 'live.sqlite')),
  };
  const registry = new RealmRegistry(worlds, directory);
  try {
    const w = registry.get('simulation', 'emberwatch');
    w.updateSettings({ quiet: false, autoChapters: false, chatOutput: false, aiEnabled: false });
    const battleId = w.createChapter('east', 'frostpass', 180, 20261030);
    w.controlChapter(battleId, 'pause');
    const manifest = {
      label: 'Judge rehearsal — entirely simulated',
      realm: 'emberwatch',
      battleId,
      battle: {
        attacker: 'east',
        defender: 'north',
        territory: 'frostpass',
        seed: 20261030,
        status: 'paused',
      },
      citizen: 'sim-0001',
      lord: 'sim-0002',
      citizens: w.snapshot().citizens,
      startingGold: w.character('sim-0001').gold,
      northPopulation: w.snapshot().kingdoms.find((k) => k.id === 'north')!.citizens,
      rules:
        'Use ordinary viewer upgrade/development controls. Resume before running the battle. No forced winner.',
      createdAt: new Date().toISOString(),
    };
    writeFileSync(join(directory, 'judge-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  } finally {
    registry.close();
    worlds.simulation.close();
    worlds.live.close();
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = join(
    root,
    'data',
    'judge-rehearsals',
    new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8),
  );
  const manifest = prepareJudgeDemo(directory);
  console.log(
    `\nFresh judge rehearsal: ${directory}\n${manifest.citizens} synthetic citizens; Frostpass paused and ready.\nPresenter guide: http://localhost:3001/judges-demo.html\nKeep normal Twitch proof on port 3000. This rehearsal uses separate storage.\n`,
  );
  if (!process.argv.includes('--prepare-only')) {
    const env = {
      ...process.env,
      PORT: '3001',
      CHATVERSE_DATA_DIR: directory,
      CHATVERSE_REHEARSAL: '1',
    };
    for (const key of Object.keys(env))
      if (/^(TWITCH_|STEWARD_)/.test(key)) delete (env as Record<string, string | undefined>)[key];
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
    });
    process.on('SIGINT', () => child.kill('SIGINT'));
    process.on('SIGTERM', () => child.kill('SIGTERM'));
  }
}
