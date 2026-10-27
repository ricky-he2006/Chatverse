import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { createApp } from '../server/app';
async function setup() {
  const worlds = {
    simulation: new World('simulation', ':memory:'),
    live: new World('live', ':memory:'),
  };
  const result = await createApp(worlds, undefined, {
    bootstrap: 'test-unlock-secret',
    test: true,
  });
  await result.app.ready();
  const login = await result.app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { code: 'test-unlock-secret' },
  });
  const cookie = login.cookies[0].value,
    csrf = login.json().csrf;
  return {
    ...result,
    worlds,
    cookie,
    csrf,
    headers: { cookie: `cv_session=${cookie}`, 'x-csrf-token': csrf },
    close: async () => {
      await result.app.close();
      Object.values(worlds).forEach((w) => w.close());
    },
  };
}

test('simulated arrivals are authenticated, bounded, idempotent, and unavailable in Live', async () => {
  const f = await setup();
  try {
    const payload = { kingdom: 'north', count: 25, key: '52d397ae-5613-4b7e-9949-74f7b7501095' };
    assert.equal(
      (await f.app.inject({ method: 'POST', url: '/api/simulation/welcome', payload })).statusCode,
      401,
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await f.app.inject({
            method: 'POST',
            url: '/api/simulation/welcome',
            payload,
            headers: f.headers,
          })
        ).statusCode,
        200,
      );
    assert.equal(f.worlds.simulation.snapshot().citizens, 625);
    assert.equal(f.worlds.live.snapshot().citizens, 0);
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/live/welcome',
          payload,
          headers: f.headers,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/welcome',
          payload: { ...payload, count: 1000 },
          headers: f.headers,
        })
      ).statusCode,
      400,
    );
  } finally {
    await f.close();
  }
});
test('dashboard authentication, CSRF, origin checks and bounded request schemas', async () => {
  const f = await setup();
  try {
    assert.equal((await f.app.inject('/api/simulation/snapshot')).statusCode, 401);
    assert.equal(
      (await f.app.inject({ url: '/api/simulation/snapshot', headers: f.headers })).json().citizens,
      600,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/advance',
          headers: { cookie: f.headers.cookie },
          payload: { seconds: 10 },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/advance',
          headers: { ...f.headers, origin: 'https://evil.example' },
          payload: { seconds: 10 },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/advance',
          headers: f.headers,
          payload: { seconds: -5 },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/live/commands',
          headers: { ...f.headers, 'idempotency-key': 'live-spoof-key' },
          payload: { persona: 'sim-0001', type: 'join', argument: 'north' },
        })
      ).statusCode,
      403,
    );
    assert.equal(f.worlds.live.snapshot().citizens, 0);
  } finally {
    await f.close();
  }
});
test('HTTP command idempotency and paginated citizen reads', async () => {
  const f = await setup();
  try {
    const options = {
      method: 'POST' as const,
      url: '/api/simulation/commands',
      headers: { ...f.headers, 'idempotency-key': 'same-command-key' },
      payload: { persona: 'a-new-test-viewer', type: 'join', argument: 'west' },
    };
    const first = await f.app.inject(options),
      twice = await f.app.inject(options);
    assert.deepEqual(first.json(), twice.json());
    assert.equal(f.worlds.simulation.snapshot().citizens, 601);
    const page = await f.app.inject({
      url: '/api/simulation/characters?kingdom=north&page=0',
      headers: f.headers,
    });
    assert.equal(page.json().items.length, 24);
    assert.equal(page.json().total, 220);
    assert.ok(page.json().items.every((c: any) => !c.gear));
  } finally {
    await f.close();
  }
});
test('overlay capabilities cannot read private data or write; rotation revokes previous access', async () => {
  const f = await setup();
  try {
    const issued = (
      await f.app.inject({
        method: 'POST',
        url: '/api/simulation/overlay/keys',
        headers: f.headers,
        payload: {},
      })
    ).json();
    assert.ok(issued.key.length > 30);
    const exchange = await f.app.inject({
      method: 'POST',
      url: '/api/overlay/exchange',
      payload: { mode: 'simulation', key: issued.key },
    });
    assert.equal(exchange.statusCode, 200);
    assert.equal(exchange.cookies[0].name, 'cv_overlay_simulation');
    const overlayCookie = `cv_overlay_simulation=${exchange.cookies[0].value}`;
    const view = await f.app.inject({
      url: '/api/simulation/overlay/snapshot',
      headers: { cookie: overlayCookie },
    });
    assert.equal(view.statusCode, 200);
    assert.equal(view.json().heroes, undefined);
    assert.equal(view.json().settings, undefined);
    assert.equal(
      (
        await f.app.inject({
          url: '/api/simulation/characters',
          headers: { cookie: overlayCookie },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/advance',
          headers: { cookie: overlayCookie },
          payload: { seconds: 10 },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/live/overlay/snapshot',
          headers: { cookie: overlayCookie },
        })
      ).statusCode,
      401,
    );
    await f.app.inject({
      method: 'POST',
      url: '/api/simulation/overlay/keys',
      headers: f.headers,
      payload: {},
    });
    assert.equal(
      (
        await f.app.inject({
          url: '/api/simulation/overlay/snapshot',
          headers: { cookie: overlayCookie },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await f.app.inject({ url: '/api/simulation/snapshot', headers: f.headers })).statusCode,
      200,
    );
  } finally {
    await f.close();
  }
});
test('Live has no scenario reset or accelerated-time route', async () => {
  const f = await setup();
  try {
    for (const url of [
      '/api/live/advance',
      '/api/live/populate-chapter',
      '/api/live/scenarios/load',
    ])
      assert.equal(
        (
          await f.app.inject({
            method: 'POST',
            url,
            headers: f.headers,
            payload: { seconds: 100, scenario: 'baseline', confirm: 'RESET SIMULATION' },
          })
        ).statusCode,
        404,
      );
  } finally {
    await f.close();
  }
});
test('non-canonical paths cannot evade API authentication or reach files outside the public build', async () => {
  const f = await setup();
  try {
    for (const url of [
      '/%61pi/simulation/snapshot',
      '//api/simulation/snapshot',
      '/%2fapi/simulation/snapshot',
      '/%252fapi/simulation/snapshot',
    ]) {
      const response = await f.app.inject({ url });
      assert.equal(response.statusCode, 403, url);
      assert.equal(response.json().code, 'INVALID_PATH');
    }
    // The injection client itself canonicalizes dot segments. A normalized API
    // path must still require auth; a missing public path may return the SPA.
    const protectedPath = await f.app.inject({ url: '/assets/%2e%2e/api/simulation/snapshot' });
    assert.ok([401, 403].includes(protectedPath.statusCode));
    const traversal = await f.app.inject({ url: '/assets/%2e%2e/server/schema.sql' });
    assert.doesNotMatch(traversal.body, /CREATE TABLE|PRAGMA foreign_keys/);
    if (traversal.statusCode === 200)
      assert.match(String(traversal.headers['content-type']), /text\/html/);
  } finally {
    await f.close();
  }
});
