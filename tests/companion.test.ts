import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { createApp } from '../server/app';
import { readFileSync } from 'node:fs';

test('personal ledger returns fresh debits and the exact linked chapter outcome without exposing other citizens', async () => {
  const f = await fixture();
  try {
    const w = f.worlds.simulation,
      id = 'sim-0001',
      p = await f.preview(id);
    const chapter = w.createChapter('east', 'frostpass', 180, 2);
    const result = w.completeSimulationBattle(chapter).result!;
    const ledger = async () =>
      (await f.app.inject({ url: '/api/companion/simulation/ledger', headers: p.headers })).json();
    const rows = await ledger();
    const reward = rows.find((r: any) => r.chapter_id === chapter);
    assert(reward);
    assert.equal(reward.outcome.winner, result.winner);
    assert.equal(reward.outcome.healthA, result.healthA);
    assert.equal(
      reward.xp,
      w.get(
        "SELECT xp FROM rewards WHERE character_id=? AND source_id=? AND kind='battle'",
        id,
        chapter,
      )!.xp,
    );
    assert.equal(reward.character_id, undefined);
    assert.equal(reward.input, undefined);
    const hero = w.character(id),
      item = hero.gear!.find((g) => g.equipped && g.upgrade < 5)!;
    const reply = await f.app.inject({
      method: 'POST',
      url: '/api/companion/simulation/commands',
      headers: { ...p.headers, 'idempotency-key': 'ledger-upgrade-verified' },
      payload: { type: 'upgrade', argument: item.definition },
    });
    assert.equal(reply.statusCode, 200, reply.body);
    const fresh = await ledger();
    assert(fresh.some((r: any) => r.reason === 'upgrade' && r.delta < 0));
    assert.equal(fresh[0].balance_after, w.character(id).gold);
    assert.equal(
      (await f.app.inject({ url: '/api/companion/simulation/ledger', headers: f.owner }))
        .statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});
test('world-race HTTP flow accepts protected image evidence and requires owner review/finalization', async () => {
  const f = await fixture();
  try {
    const create = await f.app.inject({
      method: 'POST',
      url: '/api/simulation/world-tasks',
      headers: f.owner,
      payload: {
        game: 'Demo',
        title: 'Shared objective',
        objective: 'Complete the objective and show the result.',
        unit: 'members',
        target: 1,
        hours: 1,
        requireStreamer: false,
      },
    });
    assert.equal(create.statusCode, 200, create.body);
    const task = create.json().id;
    const heroes = f.worlds.simulation.snapshot().heroes,
      p = await f.preview(heroes[0].id),
      other = await f.preview(heroes[1].id),
      image = readFileSync(new URL('../public/everfall-realms-v2.png', import.meta.url)).toString(
        'base64',
      );
    const url = `/api/companion/simulation/world-tasks/${task}/proofs`,
      payload = { note: 'This screenshot shows my completed objective.', image };
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers: p.headers,
          payload: { ...payload, role: 'streamer' },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await f.app.inject({ method: 'POST', url, headers: { cookie: p.headers.cookie }, payload }))
        .statusCode,
      403,
    );
    assert.equal(
      (await f.app.inject({ method: 'POST', url, headers: f.owner, payload })).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers: p.headers,
          payload: { ...payload, realm: 'emberwatch' },
        })
      ).statusCode,
      400,
    );
    const uploaded = await f.app.inject({ method: 'POST', url, headers: p.headers, payload });
    assert.equal(uploaded.statusCode, 200, uploaded.body);
    const proof = uploaded.json().id;
    const source = `/api/companion/simulation/world-tasks/proofs/${proof}/image`;
    const ownImage = await f.app.inject({ url: source, headers: p.headers });
    assert.equal(ownImage.statusCode, 200, ownImage.body.slice(0, 100));
    assert.equal(ownImage.headers['content-type'], 'image/png');
    assert.equal((await f.app.inject({ url: source, headers: other.headers })).statusCode, 404);
    const review = `/api/simulation/world-tasks/proofs/${proof}/review`;
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: review,
          headers: p.headers,
          payload: { decision: 'approved', reason: 'Verified result.' },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: review,
          headers: f.owner,
          payload: { decision: 'approved', reason: 'Matches the stated objective.' },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/simulation/world-tasks/${task}/finalize`,
          headers: f.owner,
          payload: {},
        })
      ).statusCode,
      422,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/live/world-tasks/advance',
          headers: f.owner,
          payload: { hours: 26 },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/world-tasks/advance',
          headers: f.owner,
          payload: { hours: 26 },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/simulation/world-tasks/${task}/finalize`,
          headers: f.owner,
          payload: {},
        })
      ).statusCode,
      200,
    );
    const state = (
      await f.app.inject({ url: '/api/companion/simulation/world-tasks', headers: p.headers })
    ).json();
    const completed = state.tasks.find((t: any) => t.id === task);
    assert.equal(completed.standings.find((s: any) => s.realm === 'home').points, 100);
    assert.equal(completed.myProofs[0].status, 'approved');
    const both = await f.app.inject({
      method: 'POST',
      url: '/api/simulation/world-tasks',
      headers: f.owner,
      payload: {
        game: 'Demo',
        title: 'Members and streamer together',
        objective: 'Both a member and streamer complete this objective.',
        unit: 'members',
        target: 1,
        hours: 1,
      },
    });
    assert.equal(both.statusCode, 200, both.body);
    const bothId = both.json().id;
    const member = await f.app.inject({
      method: 'POST',
      url: `/api/companion/simulation/world-tasks/${bothId}/proofs`,
      headers: p.headers,
      payload,
    });
    assert.equal(member.statusCode, 200, member.body);
    await f.app.inject({
      method: 'POST',
      url: `/api/simulation/world-tasks/proofs/${member.json().id}/review`,
      headers: f.owner,
      payload: { decision: 'approved', reason: 'Member objective verified.' },
    });
    let board = (await f.app.inject({ url: '/api/simulation/world-tasks', headers: f.owner }))
      .json()
      .tasks.find((t: any) => t.id === bothId);
    assert.equal(board.standings.find((s: any) => s.realm === 'home').finishedAt, null);
    const streamerUrl = `/api/simulation/world-tasks/${bothId}/streamer-proof`,
      streamerPayload = {
        note: 'Streamer objective evidence.',
        image: readFileSync(new URL('../public/realm-emberwatch-v1.png', import.meta.url)).toString(
          'base64',
        ),
      };
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: streamerUrl,
          headers: p.headers,
          payload: streamerPayload,
        })
      ).statusCode,
      401,
    );
    const streamer = await f.app.inject({
      method: 'POST',
      url: streamerUrl,
      headers: f.owner,
      payload: streamerPayload,
    });
    assert.equal(streamer.statusCode, 200, streamer.body);
    await f.app.inject({
      method: 'POST',
      url: `/api/simulation/world-tasks/proofs/${streamer.json().id}/review`,
      headers: f.owner,
      payload: { decision: 'approved', reason: 'Streamer objective verified.' },
    });
    board = (await f.app.inject({ url: '/api/simulation/world-tasks', headers: f.owner }))
      .json()
      .tasks.find((t: any) => t.id === bothId);
    const home = board.standings.find((s: any) => s.realm === 'home');
    assert.equal(home.approved, 1);
    assert.equal(home.streamerApproved, true);
    assert.notEqual(home.finishedAt, null);
  } finally {
    await f.close();
  }
});
async function fixture() {
  const worlds = {
    simulation: new World('simulation', ':memory:'),
    live: new World('live', ':memory:'),
  };
  const { app } = await createApp(worlds, undefined, {
    bootstrap: 'companion-test-secret',
    test: true,
  });
  await app.ready();
  const login = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { code: 'companion-test-secret' },
  });
  const owner = {
    cookie: `cv_session=${login.cookies[0].value}`,
    'x-csrf-token': login.json().csrf,
  };
  const preview = async (id: string) => {
    const grant = await app.inject({
      method: 'POST',
      url: '/api/simulation/companion/previews',
      headers: owner,
      payload: { characterId: id },
    });
    assert.equal(grant.statusCode, 200, grant.body);
    const code = new URL(grant.json().url, 'http://localhost').hash.slice(9);
    const result = await app.inject({
      method: 'POST',
      url: '/api/companion/exchange',
      payload: { code },
    });
    assert.equal(result.statusCode, 200, result.body);
    return {
      code,
      headers: {
        cookie: `${result.cookies[0].name}=${result.cookies[0].value}`,
        'x-csrf-token': result.json().csrf,
        'idempotency-key': 'companion-test-action',
      },
    };
  };
  return {
    app,
    worlds,
    owner,
    preview,
    close: async () => {
      await app.close();
      worlds.simulation.close();
      worlds.live.close();
    },
  };
}
test('companion: identity-bound previews expose only personal and public state and cannot administer', async () => {
  const f = await fixture();
  try {
    const w = f.worlds.simulation,
      id = w.snapshot().heroes[0].id,
      p = await f.preview(id);
    const state = await f.app.inject({
      url: '/api/companion/simulation/state',
      headers: p.headers,
    });
    assert.equal(state.statusCode, 200, state.body);
    const s = state.json();
    assert.equal(s.character.id, id);
    assert.ok(s.personalRecap);
    assert(s.kingdoms.every((k: any) => Number.isFinite(k.points) && Number.isFinite(k.wins)));
    assert.equal(s.preview, true);
    assert.equal(s.settings, undefined);
    assert.equal(s.integration, undefined);
    assert.equal(s.heroes, undefined);
    assert(s.citizens.length > 0);
    assert.equal(s.citizens[0].gold, undefined);
    assert.equal(s.citizens[0].gear, undefined);
    assert.equal(s.citizens[0].xp, undefined);
    assert.equal(s.citizens[0].personalRecap, undefined);
    for (const url of [
      '/api/simulation/snapshot',
      '/api/live/snapshot',
      '/api/simulation/proposals',
    ])
      assert.equal((await f.app.inject({ url, headers: p.headers })).statusCode, 401);
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/simulation/companion/previews',
          headers: p.headers,
          payload: { characterId: id },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/companion/exchange',
          payload: { code: p.code },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/companion/simulation/commands',
          headers: { cookie: p.headers.cookie },
          payload: { type: 'class', argument: 'ranger' },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/companion/simulation/commands',
          headers: p.headers,
          payload: { type: 'class', argument: 'ranger', persona: 'sim-0002' },
        })
      ).statusCode,
      400,
    );
    const result = await f.app.inject({
      method: 'POST',
      url: '/api/companion/simulation/commands',
      headers: p.headers,
      payload: { type: 'class', argument: 'ranger' },
    });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(w.character(id).class, 'ranger');
    const mine = w.character(id),
      owned = w.snapshot().territories.find((t) => !t.capital && t.owner === mine.kingdom)!;
    w.run('UPDATE characters SET gold=1000 WHERE id=?', id);
    const develop = await f.app.inject({
      method: 'POST',
      url: `/api/companion/simulation/districts/${owned.id}/upgrade`,
      headers: { ...p.headers, 'idempotency-key': 'district-http-upgrade' },
      payload: { expectedLevel: 0 },
    });
    assert.equal(develop.statusCode, 200, develop.body);
    assert.equal(w.character(id).gold, 900);
    assert.equal(
      (await f.app.inject({ url: '/api/companion/live/state', headers: p.headers })).statusCode,
      401,
    );
    assert.equal(
      (
        await f.app.inject({
          url: '/api/companion/live/state',
          headers: { cookie: p.headers.cookie.replace('simulation', 'live') },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (await f.app.inject({ url: '/api/companion/simulation/session', headers: f.owner })).json()
        .authenticated,
      false,
    );
    w.reset('baseline');
    assert.equal(
      (await f.app.inject({ url: '/api/companion/simulation/state', headers: p.headers }))
        .statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});
test('companion: only current elected Lords propose, once daily; streamer review uses authoritative battle rules', async () => {
  const f = await fixture();
  try {
    const w = f.worlds.simulation;
    w.run("UPDATE chapters SET status='cancelled' WHERE status IN ('open','paused')");
    w.run("UPDATE territories SET owner='east',last_session=NULL WHERE id='crossroads'");
    const lord = w.get(
      "SELECT character_id FROM lords WHERE kingdom='north' AND ends_at>?",
      w.now(),
    )!.character_id;
    const citizen = w.get(
      "SELECT id FROM characters WHERE kingdom='north' AND id<>? LIMIT 1",
      lord,
    )!.id;
    const p = await f.preview(lord),
      c = await f.preview(citizen);
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/companion/simulation/proposals',
          headers: c.headers,
          payload: { territory: 'crossroads' },
        })
      ).statusCode,
      403,
    );
    const proposal = await f.app.inject({
      method: 'POST',
      url: '/api/companion/simulation/proposals',
      headers: p.headers,
      payload: { territory: 'crossroads' },
    });
    assert.equal(proposal.statusCode, 200, proposal.body);
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/companion/simulation/proposals',
          headers: p.headers,
          payload: { territory: 'crossroads' },
        })
      ).statusCode,
      422,
    );
    const url = `/api/simulation/proposals/${proposal.json().id}/review`;
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers: p.headers,
          payload: { action: 'accept' },
        })
      ).statusCode,
      401,
    );
    const accepted = await f.app.inject({
      method: 'POST',
      url,
      headers: f.owner,
      payload: { action: 'accept' },
    });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(w.proposals()[0].status, 'accepted');
    assert.equal(
      w.get('SELECT attacker FROM chapters WHERE id=?', accepted.json().chapterId)!.attacker,
      'north',
    );
    w.dismissLord('north', 'Term ended for testing.');
    assert.equal(
      (await f.app.inject({ url: '/api/companion/simulation/state', headers: p.headers })).json()
        .role,
      'citizen',
    );
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/companion/simulation/proposals',
          headers: p.headers,
          payload: { territory: 'crossroads' },
        })
      ).statusCode,
      403,
    );
  } finally {
    await f.close();
  }
});
test('companion: viewer OAuth binds browser, client, channel and identity without an owner session', async (t) => {
  const oldId = process.env.TWITCH_CLIENT_ID,
    oldSecret = process.env.TWITCH_CLIENT_SECRET;
  process.env.TWITCH_CLIENT_ID = 'viewer-test-client';
  process.env.TWITCH_CLIENT_SECRET = 'viewer-test-secret';
  t.after(() => {
    if (oldId === undefined) delete process.env.TWITCH_CLIENT_ID;
    else process.env.TWITCH_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.TWITCH_CLIENT_SECRET;
    else process.env.TWITCH_CLIENT_SECRET = oldSecret;
  });
  const f = await fixture();
  try {
    const w = f.worlds.live;
    w.set('supporterChannel', 'channel-1');
    // Avoid recursive snapshot in the integration stub.
    const status = {
      configured: true,
      connected: true,
      state: 'connected',
      channel: 'host',
      scopes: [],
      lastEventAt: null,
      gapSince: null,
      error: null,
      replies: false,
      subscriptions: false,
    };
    w.integration = () => status;
    const start = await f.app.inject({ url: '/auth/viewer/start' });
    assert.equal(start.statusCode, 302, start.body);
    const auth = new URL(start.headers.location!);
    assert.equal(auth.searchParams.get('scope'), '');
    let validationClient = 'viewer-test-client';
    t.mock.method(
      globalThis,
      'fetch',
      async (input: any) =>
        new Response(
          JSON.stringify(
            String(input).endsWith('/validate')
              ? {
                  client_id: validationClient,
                  user_id: '999',
                  login: 'real_viewer',
                  expires_in: 3600,
                }
              : { access_token: 'private-viewer-token' },
          ),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const callback = `/auth/viewer/callback?state=${auth.searchParams.get('state')}&code=test-code`;
    const cookies = { cookie: `cv_viewer_oauth=${start.cookies[0].value}` };
    const result = await f.app.inject({ url: callback, headers: cookies });
    assert.equal(result.statusCode, 302, result.body);
    const player = result.cookies.find((c) => c.name === 'cv_player_live_home')!;
    assert(player);
    const headers = { cookie: `${player.name}=${player.value}` };
    const session = (await f.app.inject({ url: '/api/companion/live/session', headers })).json();
    const state = (await f.app.inject({ url: '/api/companion/live/state', headers })).json();
    assert.equal(state.identity.name, 'real_viewer');
    assert.equal(state.identity.verified, true);
    assert.equal(state.role, 'visitor');
    const joined = await f.app.inject({
      method: 'POST',
      url: '/api/companion/live/commands',
      headers: {
        ...headers,
        'x-csrf-token': session.csrf,
        'idempotency-key': 'verified-viewer-join',
      },
      payload: { type: 'join', argument: 'north' },
    });
    assert.equal(joined.statusCode, 200, joined.body);
    assert.equal(w.get("SELECT name FROM users WHERE subject='twitch:999'")!.name, 'real_viewer');
    assert.equal((await f.app.inject({ url: callback, headers: cookies })).statusCode, 403);
    assert.equal((await f.app.inject({ url: '/api/live/snapshot', headers })).statusCode, 401);
    validationClient = 'wrong-application';
    const otherStart = await f.app.inject({ url: '/auth/viewer/start' });
    const otherState = new URL(otherStart.headers.location!).searchParams.get('state');
    const wrongClient = await f.app.inject({
      url: `/auth/viewer/callback?state=${otherState}&code=test-code`,
      headers: { cookie: `cv_viewer_oauth=${otherStart.cookies[0].value}` },
    });
    assert.equal(wrongClient.statusCode, 403);
    assert(!wrongClient.cookies.some((c) => c.name === 'cv_player_live_home'));
    validationClient = 'viewer-test-client';
    const nonceStart = await f.app.inject({ url: '/auth/viewer/start' });
    const nonceState = new URL(nonceStart.headers.location!).searchParams.get('state');
    assert.equal(
      (
        await f.app.inject({
          url: `/auth/viewer/callback?state=${nonceState}&code=test-code`,
          headers: { cookie: 'cv_viewer_oauth=wrong-browser' },
        })
      ).statusCode,
      403,
    );
    status.connected = false;
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/companion/live/commands',
          headers: {
            ...headers,
            'x-csrf-token': session.csrf,
            'idempotency-key': 'offline-viewer-join',
          },
          payload: { type: 'pledge' },
        })
      ).statusCode,
      503,
    );
    w.set('supporterChannel', 'channel-2');
    assert.equal(
      (await f.app.inject({ url: '/api/companion/live/state', headers })).statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});
test('companion: previews expire and revoke, logout does not log out the owner', async (t) => {
  const f = await fixture();
  try {
    const id = f.worlds.simulation.snapshot().heroes[0].id,
      p = await f.preview(id);
    const now = Date.now();
    t.mock.method(Date, 'now', () => now + 3600001);
    assert.equal(
      (await f.app.inject({ url: '/api/companion/simulation/state', headers: p.headers }))
        .statusCode,
      401,
    );
    t.mock.restoreAll();
    const p2 = await f.preview(id);
    assert.equal(
      (
        await f.app.inject({
          method: 'DELETE',
          url: '/api/companion/simulation/session',
          headers: p2.headers,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await f.app.inject({ url: '/api/companion/simulation/state', headers: p2.headers }))
        .statusCode,
      401,
    );
    assert.equal(
      (await f.app.inject({ url: '/api/simulation/snapshot', headers: f.owner })).statusCode,
      200,
    );
    const p3 = await f.preview(id);
    assert.equal(
      (
        await f.app.inject({
          method: 'DELETE',
          url: '/api/simulation/companion/previews',
          headers: f.owner,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await f.app.inject({ url: '/api/companion/simulation/state', headers: p3.headers }))
        .statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});
