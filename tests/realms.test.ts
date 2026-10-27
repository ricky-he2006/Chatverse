import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { World } from '../server/world';
import { RealmRegistry } from '../server/realms';
import { createApp } from '../server/app';
import { removeOwnedTestDirectory } from './helpers';
import { realmUrl } from '../src/api';

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'chatverse-realms-'));
  const worlds = {
    simulation: new World('simulation', join(directory, 'simulation.sqlite')),
    live: new World('live', join(directory, 'live.sqlite')),
  };
  const registry = new RealmRegistry(worlds, directory);
  return {
    directory,
    worlds,
    registry,
    close() {
      registry.close();
      Object.values(worlds).forEach((w) => w.close());
      removeOwnedTestDirectory(directory);
    },
  };
}
async function http() {
  const f = setup();
  const { app } = await createApp(f.worlds, undefined, {
    test: true,
    bootstrap: 'realm-test',
    registry: f.registry,
  });
  await app.ready();
  const login = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { code: 'realm-test' },
  });
  return {
    ...f,
    app,
    headers: { cookie: `cv_session=${login.cookies[0].value}`, 'x-csrf-token': login.json().csrf },
    async close() {
      await app.close();
      f.close();
    },
  };
}
test('four streamer realms have independent databases, characters, Lords and progression', () => {
  const f = setup();
  try {
    const atlas = f.registry.atlas('simulation');
    assert.equal(atlas.realms.length, 4);
    assert.ok(atlas.realms.every((r) => r.synthetic && r.kingdoms.length === 3));
    assert.deepEqual(
      atlas.realms.map((r) => r.citizens),
      [600, 720, 660, 810],
    );
    const ember = f.registry.get('simulation', 'emberwatch'),
      moon = f.registry.get('simulation', 'moonharbor');
    assert.throws(
      () => new World('simulation', moon.filename, undefined, 'emberwatch'),
      /realm mismatch/,
    );
    const before = f.worlds.simulation.character('sim-0001'),
      moonBefore = moon.character('sim-0001');
    ember.setSimulationSupporter('sim-0001', 0);
    assert.deepEqual(f.worlds.simulation.character('sim-0001'), before);
    assert.deepEqual(moon.character('sim-0001'), moonBefore);
    ember.command(
      { subject: 'sim:realm-local', name: 'Realm local' },
      { type: 'join', argument: 'east' },
      'same-key',
    );
    assert.equal(ember.snapshot().citizens, 721);
    assert.equal(moon.snapshot().citizens, 660);
    assert.equal(f.worlds.simulation.snapshot().citizens, 600);
    assert.notEqual(ember.snapshot().generation, moon.snapshot().generation);
    assert.equal(f.registry.atlas('live').realms.length, 1);
    assert.equal(f.worlds.live.snapshot().citizens, 0);
    assert.throws(() => f.registry.get('live', 'emberwatch'));
    assert.throws(() => f.registry.get('simulation', '../escape'));
  } finally {
    f.close();
  }
});
test('a remote realm reset retains its identity and does not reseed arrivals after restart', () => {
  const f = setup();
  try {
    const ember = f.registry.get('simulation', 'emberwatch');
    ember.reset('first-citizen');
    const snapshot = ember.snapshot();
    assert.equal(snapshot.realmId, 'emberwatch');
    assert.equal(snapshot.realm, 'Emberwatch Dominion');
    assert.equal(f.worlds.simulation.snapshot().citizens, 600);
    f.registry.close();
    const registry = new RealmRegistry(f.worlds, f.directory);
    try {
      const restarted = registry.get('simulation', 'emberwatch');
      assert.equal(restarted.snapshot().citizens, snapshot.citizens);
      assert.equal(restarted.snapshot().generation, snapshot.generation);
    } finally {
      registry.close();
    }
  } finally {
    f.close();
  }
});
test('realm selection scopes HTTP mutations, snapshots, clocks, resets and atlas totals', async () => {
  const f = await http();
  try {
    assert.equal((await f.app.inject('/api/simulation/atlas')).statusCode, 401);
    const snapshot = (
      await f.app.inject({ url: '/api/simulation/snapshot?realm=emberwatch', headers: f.headers })
    ).json();
    assert.equal(snapshot.realmId, 'emberwatch');
    assert.equal(snapshot.citizens, 720);
    const original = f.worlds.simulation.character('sim-0001');
    const upgrade = await f.app.inject({
      method: 'POST',
      url: '/api/simulation/commands?realm=emberwatch',
      headers: { ...f.headers, 'idempotency-key': 'realm-upgrade-test' },
      payload: {
        type: 'upgrade',
        persona: 'sim-0001',
        argument: original.gear!.find((g) => g.slot === 'weapon')!.id,
      },
    });
    assert.equal(upgrade.statusCode, 200);
    assert.deepEqual(f.worlds.simulation.character('sim-0001'), original);
    assert.ok(
      f.registry.get('simulation', 'emberwatch').character('sim-0001').stats.attack >
        original.stats.attack,
    );
    const before = f.worlds.simulation.now();
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/advance?realm=emberwatch',
          headers: f.headers,
          payload: { seconds: 60 },
        })
      ).statusCode,
      200,
    );
    assert.ok(f.registry.get('simulation', 'emberwatch').now() - f.worlds.simulation.now() > 59000);
    assert.ok(f.worlds.simulation.now() - before < 5000);
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/welcome?realm=emberwatch',
          headers: f.headers,
          payload: { kingdom: 'east', count: 25, key: '9c1cc627-f9cb-449a-8296-55f311c31df1' },
        })
      ).statusCode,
      200,
    );
    const atlas = (
      await f.app.inject({ url: '/api/simulation/atlas?realm=emberwatch', headers: f.headers })
    ).json();
    assert.equal(atlas.currentRealm, 'emberwatch');
    assert.equal(atlas.realms.find((r: any) => r.id === 'emberwatch').citizens, 745);
    assert.equal(atlas.realms.find((r: any) => r.id === 'home').citizens, 600);
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/scenarios/load?realm=emberwatch',
          headers: f.headers,
          payload: { scenario: 'first-citizen', confirm: 'RESET SIMULATION' },
        })
      ).statusCode,
      200,
    );
    assert.equal(f.worlds.simulation.snapshot().citizens, 600);
    assert.equal(f.registry.get('simulation', 'moonharbor').snapshot().citizens, 660);
    assert.equal(
      (await f.app.inject({ url: '/api/live/snapshot?realm=emberwatch', headers: f.headers }))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/simulation/snapshot?realm=not-a-realm',
          headers: f.headers,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await f.app.inject({ url: '/api/simulation/snapshot?realm=..%2F..', headers: f.headers }))
        .statusCode,
      400,
    );
  } finally {
    await f.close();
  }
});

test('a council, its pledges and recorded battle belong only to the selected realm', async () => {
  const f = await http();
  try {
    const history = f.worlds.simulation.snapshot().battles.map((b) => b.id);
    const created = await f.app.inject({
      method: 'POST',
      url: '/api/simulation/chapters?realm=emberwatch',
      headers: f.headers,
      payload: { attacker: 'east', territory: 'frostpass', seconds: 60 },
    });
    assert.equal(created.statusCode, 200);
    const id = created.json().id;
    assert.equal(
      f.registry.atlas('simulation').realms.find((r) => r.id === 'emberwatch')!.currentBattle,
      true,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/populate-chapter?realm=emberwatch',
          headers: f.headers,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/advance?realm=emberwatch',
          headers: f.headers,
          payload: { seconds: 65 },
        })
      ).statusCode,
      200,
    );
    const recorded = await f.app.inject({
      url: `/api/simulation/battles/${id}?realm=emberwatch`,
      headers: f.headers,
    });
    assert.equal(recorded.json().status, 'resolved');
    assert.equal(
      (await f.app.inject({ url: `/api/simulation/battles/${id}?realm=home`, headers: f.headers }))
        .statusCode,
      404,
    );
    assert.deepEqual(
      f.worlds.simulation.snapshot().battles.map((b) => b.id),
      history,
    );
  } finally {
    await f.close();
  }
});
test('overlay capabilities are bound to realm as well as mode and revoke independently', async () => {
  const f = await http();
  try {
    const keys: Record<string, string> = {},
      cookies: Record<string, { name: string; value: string }> = {};
    for (const realm of ['emberwatch', 'moonharbor']) {
      const result = (
        await f.app.inject({
          method: 'POST',
          url: `/api/simulation/overlay/keys?realm=${realm}`,
          headers: f.headers,
        })
      ).json();
      keys[realm] = result.key;
      assert.ok(result.url.includes('?realm=' + realm));
      const exchange = await f.app.inject({
        method: 'POST',
        url: '/api/overlay/exchange',
        payload: { mode: 'simulation', realm, key: result.key },
      });
      assert.equal(exchange.statusCode, 200);
      cookies[realm] = exchange.cookies[0];
    }
    const ember = { cookie: `${cookies.emberwatch.name}=${cookies.emberwatch.value}` };
    assert.equal(
      (
        await f.app.inject({
          url: '/api/simulation/overlay/snapshot?realm=emberwatch',
          headers: ember,
        })
      ).json().realmId,
      'emberwatch',
    );
    assert.equal(
      (await f.app.inject({ url: '/api/simulation/snapshot?realm=emberwatch', headers: ember }))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/simulation/overlay/snapshot?realm=moonharbor',
          headers: { cookie: `${cookies.moonharbor.name}=${cookies.emberwatch.value}` },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/overlay/exchange',
          payload: { mode: 'simulation', realm: 'moonharbor', key: keys.emberwatch },
        })
      ).statusCode,
      401,
    );
    await f.app.inject({
      method: 'DELETE',
      url: '/api/simulation/overlay/keys?realm=emberwatch',
      headers: f.headers,
    });
    const moon = { cookie: `${cookies.moonharbor.name}=${cookies.moonharbor.value}` };
    assert.equal(
      (
        await f.app.inject({
          url: '/api/simulation/overlay/snapshot?realm=moonharbor',
          headers: moon,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/simulation/overlay/snapshot?realm=emberwatch',
          headers: ember,
        })
      ).statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});
test('realm URLs preserve existing query parameters and encode their realm selection', () => {
  assert.equal(
    realmUrl('/api/simulation/snapshot?persona=sim-0001', 'moonharbor'),
    '/api/simulation/snapshot?persona=sim-0001&realm=moonharbor',
  );
  assert.equal(realmUrl('/api/simulation/events'), '/api/simulation/events?realm=home');
});
