import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { World } from './world';
import { TokenVault } from './vault';
import { TwitchIntegration } from './twitch';
import { Steward } from './steward';
import { createApp } from './app';
import { acquireInstallationLock } from './lock';
import { RealmRegistry } from './realms';
const rehearsal = process.env.CHATVERSE_REHEARSAL === '1';
if (!rehearsal && existsSync('.env'))
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
const directory = resolve(process.env.CHATVERSE_DATA_DIR ?? 'data');
const releaseLock = acquireInstallationLock(directory);
process.on('exit', releaseLock);
const worlds = {
  simulation: new World('simulation', resolve(directory, 'simulation.sqlite')),
  live: new World('live', resolve(directory, 'live.sqlite')),
};
const twitch = new TwitchIntegration(
  worlds.live,
  new TokenVault(resolve(directory, 'twitch.dpapi')),
);
const registry = new RealmRegistry(worlds, directory);
const stewards = new Map<World, Steward>();
const port = Number(process.env.PORT ?? 3000);
const { app, bootstrap } = await createApp(worlds, twitch, {
  port,
  registry,
  tasksDirectory: directory,
});
const timer = setInterval(() => {
  for (const world of registry.allWorlds())
    try {
      world.tick();
    } catch (error) {
      console.error('Scheduler paused:', error instanceof Error ? error.message : 'Unknown error');
    }
  for (const world of registry.allWorlds()) {
    if (!stewards.has(world)) stewards.set(world, new Steward(world));
    void stewards.get(world)!.tick();
  }
}, 1000);
timer.unref();
await app.listen({ port, host: '127.0.0.1' });
console.log(
  `\n  CHATVERSE · Your community, a world of its own\n\n  Local:   http://localhost:${port}\n  Unlock:  ${bootstrap}\n\n  This code unlocks local admin controls. Keep it private.\n  Live Twitch is ${twitch.status.configured ? 'configured; checking authorization' : 'not configured. Simulation is ready'}.\n`,
);
if (!rehearsal) void twitch.initialize();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  twitch.close();
  app.server.closeAllConnections();
  await app.close();
  registry.close();
  for (const w of Object.values(worlds)) w.close();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
