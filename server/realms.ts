import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { World } from './world';
import { RuleError } from './engine';
import { REALMS, realmIdentity, type AtlasSnapshot, type AtlasRealm } from '../shared/realms';
import type { Mode } from '../shared/types';

/** One authoritative database per realm. This directory is local, not a federation service. */
export class RealmRegistry {
  private satellites = new Map<string, World>();
  constructor(
    private worlds: Record<Mode, World>,
    private directory: string,
  ) {
    mkdirSync(directory, { recursive: true });
  }
  get(mode: Mode, id = 'home'): World {
    if (!REALMS.some((r) => r.id === id)) throw new RuleError('Realm not found.', 'NOT_FOUND', 404);
    if (mode === 'live' && id !== 'home')
      throw new RuleError(
        'Only your authorized channel is available in Live. Other realms are Simulation only.',
        'MODE_ISOLATION',
        403,
      );
    if (id === 'home') return this.worlds[mode];
    const existing = this.satellites.get(id);
    if (existing) return existing;
    const path = join(this.directory, `simulation-${id}.sqlite`);
    const world = new World('simulation', path, undefined, id);
    try {
      if (!world.setting('realmSeeded')) {
        const identity = realmIdentity(id),
          index = REALMS.findIndex((r) => r.id === id);
        world.atomic(() => {
          world.set('realm', identity.name);
          const counts = [0, 120, 60, 210];
          const faction = index === 1 ? 'east' : index === 2 ? 'west' : 'north';
          for (let i = 0; i < counts[index]; i++)
            world.command(
              {
                subject: `sim:${id}:founder:${i}`,
                name: `${identity.name.split(' ')[0]} Wayfarer ${i + 1}`,
              },
              { type: 'join', argument: faction },
              `${id}:founder:${i}`,
            );
          world.event(
            'realm',
            identity.name + ' opens its gates',
            `${identity.streamer} is a fictional streamer. This is an isolated, fully simulated community.`,
          );
          world.set('realmSeeded', true);
        });
      }
      this.satellites.set(id, world);
      return world;
    } catch (error) {
      world.close();
      throw error;
    }
  }
  allWorlds() {
    return [...Object.values(this.worlds), ...this.satellites.values()];
  }
  atlas(mode: Mode, currentRealm = 'home'): AtlasSnapshot {
    this.get(mode, currentRealm);
    return {
      mode,
      currentRealm,
      source: mode === 'simulation' ? 'local-simulation' : 'local-live',
      now: Date.now(),
      realms: (mode === 'simulation' ? REALMS : [REALMS[0]]).map((meta) =>
        summarizeRealm(this.get(mode, meta.id), meta.id),
      ),
    };
  }
  close() {
    for (const world of this.satellites.values()) world.close();
    this.satellites.clear();
  }
}
export function summarizeRealm(world: World, id = 'home'): AtlasRealm {
  const s = world.snapshot(),
    identity = realmIdentity(id);
  return {
    ...identity,
    name: s.realm,
    streamer:
      world.mode === 'live'
        ? s.integration.channel
          ? '@' + s.integration.channel
          : 'Your channel'
        : identity.streamer,
    mode: world.mode,
    synthetic: world.mode === 'simulation',
    citizens: s.citizens,
    active: s.active,
    territories: s.territories.length,
    discovered: s.kingdoms.reduce((n, k) => n + (k.growthLevel ?? 0), 0),
    maxOutposts: 12,
    fortressHealth: s.kingdoms.reduce((n, k) => n + (k.fortressHealth ?? 1800), 0),
    season: s.season.number,
    challengeWins: world.get("SELECT COUNT(*) n FROM challenges WHERE status='completed'")!.n,
    currentBattle: s.chapter?.status === 'open' || s.chapter?.status === 'paused',
    kingdoms: s.kingdoms.map((k) => ({
      id: k.id,
      name: k.name,
      color: k.color,
      citizens: k.citizens,
      territories: k.territories,
      lord: k.lord,
    })),
    latestEvent: s.events[0]?.title ?? null,
  };
}
