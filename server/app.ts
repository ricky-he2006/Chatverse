import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import serveStatic from '@fastify/static';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { backup } from 'node:sqlite';
import { z } from 'zod';
import type { Mode } from '../shared/types';
import { SCENARIOS } from '../shared/catalog';
import { World } from './world';
import { RuleError } from './engine';
import type { TwitchIntegration } from './twitch';

type Session = { csrf: string; expires: number; kind: 'admin' | 'overlay'; mode?: Mode };
const faction = z.enum(['north', 'east', 'west']);
const commandSchema = z
  .object({
    type: z.enum([
      'join',
      'class',
      'pledge',
      'vote',
      'equip',
      'upgrade',
      'buy',
      'nominate',
      'elect',
    ]),
    argument: z.string().max(100).optional(),
    persona: z.string().max(100),
  })
  .strict();
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const equal = (a: string, b: string) => {
  const first = Buffer.from(a),
    second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};
export async function createApp(
  worlds: Record<Mode, World>,
  integration?: TwitchIntegration,
  options: { bootstrap?: string; port?: number; test?: boolean } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 16384, requestTimeout: 15000 });
  await app.register(cookie);
  const bootstrap = options.bootstrap ?? randomBytes(9).toString('base64url');
  const sessions = new Map<string, Session>();
  const port = options.port ?? 3000;
  const allowedOrigins = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  const limits = new Map<string, { at: number; count: number }>();
  const streamCounts: Record<Mode, number> = { simulation: 0, live: 0 };
  function reserveStream(mode: Mode) {
    if (streamCounts[mode] >= 8)
      throw new RuleError(
        'This environment already has eight real-time views open. Close an unused view.',
        'STREAM_LIMIT',
        429,
      );
    streamCounts[mode]++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        streamCounts[mode]--;
      }
    };
  }
  app.addHook('onRequest', async (req, reply) => {
    const rawPath = req.url.split('?')[0];
    if (
      rawPath.includes('%') ||
      rawPath.includes('\\') ||
      rawPath.includes('//') ||
      /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath)
    )
      throw new RuleError('Non-canonical request paths are not accepted.', 'INVALID_PATH', 403);
    const host = req.headers.host?.split(':')[0];
    if (!options.test && !['localhost', '127.0.0.1', '[::1]'].includes(host ?? ''))
      throw new RuleError('Only local requests are accepted.', 'INVALID_HOST', 403);
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
      throw new RuleError('This origin is not allowed.', 'INVALID_ORIGIN', 403);
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Frame-Options', 'DENY');
    if (!req.url.startsWith('/api/'))
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    const key = req.ip + ':' + req.url.split('?')[0],
      now = Date.now(),
      limit = limits.get(key);
    if (limit && now - limit.at < 60000) {
      if (++limit.count > 240)
        throw new RuleError('Too many requests. Try again shortly.', 'RATE_LIMIT', 429);
    } else limits.set(key, { at: now, count: 1 });
    if (limits.size > 5000)
      for (const [key, v] of limits) if (now - v.at > 60000) limits.delete(key);
    const publicApi =
      (rawPath === '/api/health' && ['GET', 'HEAD'].includes(req.method)) ||
      (rawPath === '/api/session' && ['GET', 'HEAD', 'POST'].includes(req.method)) ||
      (rawPath === '/api/overlay/exchange' && req.method === 'POST');
    if (req.url.startsWith('/api/') && !publicApi) {
      const overlayRoute = /^\/api\/(live|simulation)\/overlay\/(snapshot|events)(\?|$)/.test(
        req.url,
      );
      const overlayMode = req.url.split('/')[2];
      const session = sessions.get(
        (overlayRoute ? req.cookies[`cv_overlay_${overlayMode}`] : undefined) ??
          req.cookies.cv_session ??
          '',
      );
      if (!session || session.expires < Date.now())
        throw new RuleError(
          'Unlock this local dashboard with the code printed in the server terminal.',
          'UNAUTHORIZED',
          401,
        );
      if (session.kind === 'overlay') {
        if (
          req.method !== 'GET' ||
          !new RegExp(`^/api/${session.mode}/overlay/(snapshot|events)(\\?|$)`).test(req.url) ||
          !worlds[session.mode!].get('SELECT 1 FROM overlay_keys WHERE hash=?', session.csrf)
        )
          throw new RuleError(
            'Overlay access is read-only or its key was revoked.',
            'FORBIDDEN',
            403,
          );
      } else if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        !equal(String(req.headers['x-csrf-token'] ?? ''), session.csrf)
      )
        throw new RuleError('Session check failed. Reload and try again.', 'CSRF', 403);
    }
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        code: 'INVALID_INPUT',
        message: error.issues.map((i) => i.message).join('; '),
        requestId: req.id,
      });
    if (error instanceof RuleError)
      return reply
        .code(error.status)
        .send({ code: error.code, message: error.message, requestId: req.id });
    const status = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    if (typeof status === 'number' && status >= 400 && status < 500)
      return reply
        .code(status)
        .send({
          code: 'INVALID_REQUEST',
          message:
            status === 413 ? 'Request body is too large.' : 'The request could not be parsed.',
          requestId: req.id,
        });
    console.error(`[${req.id}]`, error instanceof Error ? error.message : 'Unexpected failure');
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'The operation failed. Reload the current state before retrying.',
      requestId: req.id,
    });
  });
  const worldFor = (req: any) => worlds[z.enum(['simulation', 'live']).parse(req.params.mode)];
  const streamAuthorized = (req: any, mode: Mode, overlay = false) => {
    const id =
      (overlay ? req.cookies[`cv_overlay_${mode}`] : undefined) ?? req.cookies.cv_session ?? '';
    const session = sessions.get(id);
    return () =>
      !!session &&
      sessions.get(id) === session &&
      session.expires > Date.now() &&
      (session.kind === 'admin' ||
        (overlay &&
          session.mode === mode &&
          !!worlds[mode].get('SELECT 1 FROM overlay_keys WHERE hash=?', session.csrf)));
  };
  app.get('/api/health', async () => ({
    ok: true,
    version: '0.1.0',
    modes: ['simulation', 'live'],
  }));
  app.get('/api/session', async (req) => {
    const session = sessions.get(req.cookies.cv_session ?? '');
    return {
      authenticated: !!session && session.expires > Date.now() && session.kind === 'admin',
      csrf: session?.kind === 'admin' ? session.csrf : null,
    };
  });
  app.post('/api/session', async (req, reply) => {
    const { code } = z.object({ code: z.string().min(1).max(100) }).parse(req.body);
    const key = `bootstrap:${req.ip}`;
    const previous = limits.get(key);
    const attempt = previous && Date.now() - previous.at < 600000 ? previous : undefined;
    if (attempt && attempt.count >= 10 && Date.now() - attempt.at < 600000)
      throw new RuleError('Too many unlock attempts. Wait ten minutes.', 'RATE_LIMIT', 429);
    if (!equal(code, bootstrap)) {
      limits.set(key, { at: attempt?.at ?? Date.now(), count: (attempt?.count ?? 0) + 1 });
      throw new RuleError(
        'That unlock code does not match the current server terminal.',
        'UNAUTHORIZED',
        401,
      );
    }
    limits.delete(key);
    for (const [id, session] of sessions) if (session.expires <= Date.now()) sessions.delete(id);
    const id = randomBytes(32).toString('base64url'),
      csrf = randomBytes(24).toString('hex');
    sessions.set(id, { kind: 'admin', csrf, expires: Date.now() + 12 * 3600000 });
    reply.setCookie('cv_session', id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 43200,
    });
    return { authenticated: true, csrf };
  });
  app.delete('/api/session', async (req, reply) => {
    sessions.delete(req.cookies.cv_session ?? '');
    reply.clearCookie('cv_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/:mode/snapshot', async (req) => {
    const q = z.object({ persona: z.string().optional() }).parse(req.query);
    return worldFor(req).snapshot(q.persona);
  });
  app.get('/api/:mode/characters', async (req) => {
    const q = z
      .object({
        search: z.string().max(80).default(''),
        kingdom: z.string().default(''),
        page: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .parse(req.query);
    return worldFor(req).listCharacters(q.search, q.kingdom, q.page);
  });
  app.get('/api/:mode/characters/:id', async (req) =>
    worldFor(req).character((req.params as any).id),
  );
  app.get('/api/:mode/characters/:id/ledger', async (req) =>
    worldFor(req).all(
      'SELECT delta,balance_after,reason,created_at FROM ledger WHERE character_id=? ORDER BY id DESC LIMIT 30',
      (req.params as any).id,
    ),
  );
  app.get('/api/:mode/battles/:id', async (req) => worldFor(req).chapter((req.params as any).id));
  app.get('/api/:mode/seasons', async (req) => {
    const w = worldFor(req);
    return {
      seasons: w.all('SELECT * FROM seasons ORDER BY number DESC LIMIT 12'),
      awards: w.all(
        `SELECT a.*,s.number FROM (
          SELECT awards.*,ROW_NUMBER() OVER(PARTITION BY season_id,kind ORDER BY rank,subject) position
          FROM season_awards awards WHERE season_id IN (SELECT id FROM seasons ORDER BY number DESC LIMIT 12)
        ) a JOIN seasons s ON s.id=a.season_id WHERE position<=3 ORDER BY s.number DESC,a.kind,a.rank,a.subject`,
      ),
    };
  });
  app.post('/api/:mode/commands', async (req) => {
    const w = worldFor(req);
    if (w.mode !== 'simulation')
      throw new RuleError('Viewer actions in Live must come from Twitch chat.', 'FORBIDDEN', 403);
    const { persona, ...command } = commandSchema.parse(req.body);
    const idempotency = z.string().min(8).max(150).parse(req.headers['idempotency-key']);
    const existing = w.get(
      'SELECT u.* FROM users u JOIN characters c ON c.user_id=u.id WHERE c.id=?',
      persona,
    );
    const actor = existing
      ? { subject: existing.subject, name: existing.name }
      : { subject: `sim:local-${persona}`, name: 'You, the Adventurer' };
    return w.command(actor, command, `web:${persona}:${idempotency}`);
  });
  app.post('/api/:mode/chapters', async (req) => {
    const body = z
      .object({
        attacker: faction,
        territory: z.string().max(40),
        seconds: z.number().int().min(30).max(180).default(60),
      })
      .strict()
      .parse(req.body);
    return { id: worldFor(req).createChapter(body.attacker, body.territory, body.seconds) };
  });
  app.post('/api/:mode/chapters/:id/control', async (req) => {
    const { action } = z
      .object({ action: z.enum(['pause', 'resume', 'cancel']) })
      .strict()
      .parse(req.body);
    worldFor(req).controlChapter((req.params as any).id, action);
    return { ok: true };
  });
  app.post('/api/:mode/elections', async (req) => {
    const { kingdom } = z.object({ kingdom: faction }).strict().parse(req.body);
    return { id: worldFor(req).openElection(kingdom) };
  });
  app.post('/api/:mode/lords/dismiss', async (req) => {
    const { kingdom, reason } = z
      .object({ kingdom: faction, reason: z.string().trim().min(5).max(180) })
      .strict()
      .parse(req.body);
    worldFor(req).dismissLord(kingdom, reason);
    return { ok: true };
  });
  app.patch('/api/:mode/settings', async (req) => {
    const patch = z
      .object({
        quiet: z.boolean().optional(),
        autoChapters: z.boolean().optional(),
        chatOutput: z.boolean().optional(),
        aiEnabled: z.boolean().optional(),
        tone: z.enum(['heroic', 'cozy', 'dry']).optional(),
      })
      .strict()
      .parse(req.body);
    const w = worldFor(req);
    if (patch.autoChapters) w.set('lastAutoChapter', Date.now());
    return w.updateSettings(patch);
  });
  app.post('/api/:mode/milestone', async (req) => {
    const { milestone } = z
      .object({
        milestone: z.enum(['A hard-earned victory', 'A brave attempt', 'A new personal best']),
      })
      .strict()
      .parse(req.body);
    const w = worldFor(req);
    w.atomic(() =>
      w.event(
        'milestone',
        'From the streamer’s adventure',
        `${milestone} — confirmed by the streamer. This is story context, not automatic game telemetry or a combat bonus.`,
        null,
        'streamer',
      ),
    );
    return { ok: true };
  });
  app.post('/api/:mode/announcement', async (req) => {
    const { text } = z
      .object({ text: z.string().trim().min(1).max(280) })
      .strict()
      .parse(req.body);
    const w = worldFor(req);
    w.atomic(() => {
      const id = w.event('announcement', 'A message from the sovereign', text, null, 'streamer');
      if (w.mode === 'live' && w.settings().chatOutput && !w.settings().quiet)
        w.run('INSERT INTO outbox(event_id,body,created_at) VALUES (?,?,?)', id, text, w.now());
    });
    return { ok: true };
  });
  app.get('/api/simulation/scenarios', async () => SCENARIOS);
  app.post('/api/simulation/scenarios/load', async (req) => {
    const { scenario } = z
      .object({
        scenario: z.enum(['baseline', 'border-clash', 'election', 'first-citizen', 'season-close']),
        confirm: z.literal('RESET SIMULATION'),
      })
      .strict()
      .parse(req.body);
    worlds.simulation.reset(scenario);
    return { ok: true };
  });
  app.post('/api/simulation/advance', async (req) => {
    const { seconds } = z
      .object({
        seconds: z
          .number()
          .int()
          .min(1)
          .max(8 * 86400),
      })
      .strict()
      .parse(req.body);
    worlds.simulation.advance(seconds);
    return { ok: true };
  });
  app.post('/api/simulation/welcome', async (req) => {
    const body = z
      .object({
        kingdom: z.enum(['north', 'east', 'west']),
        count: z.number().int().min(1).max(50),
        key: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    const world = worlds.simulation;
    world.atomic(() => {
      for (let i = 0; i < body.count; i++)
        world.command(
          {
            subject: `sim:arrival:${body.key}:${i}`,
            name: `Wayfarer ${body.key.slice(0, 4)}-${i + 1}`,
          },
          { type: 'join', argument: body.kingdom },
          `arrival:${body.key}:${i}`,
        );
    });
    return { ok: true };
  });
  app.post('/api/simulation/populate-chapter', async () => {
    worlds.simulation.simulatePledges();
    return { ok: true };
  });
  app.get('/api/:mode/events', async (req, reply) => {
    const w = worldFor(req),
      release = reserveStream(w.mode);
    const authorized = streamAuthorized(req, w.mode);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    let serial = Date.now(),
      blocked = false;
    const send = () => {
      if (!authorized()) {
        reply.raw.end();
        return;
      }
      if (blocked || reply.raw.destroyed) return;
      blocked = !reply.raw.write(
        `id: ${++serial}\nevent: invalidate\ndata: ${JSON.stringify({ generation: w.get('SELECT generation FROM environment WHERE id=1')!.generation })}\n\n`,
      );
    };
    reply.raw.on('drain', () => {
      blocked = false;
      send();
    });
    send();
    w.on('change', send);
    const beat = setInterval(() => {
      if (!authorized()) reply.raw.end();
      else if (!reply.raw.destroyed && !blocked) reply.raw.write(': heartbeat\n\n');
    }, 15000);
    beat.unref();
    reply.raw.on('close', () => {
      release();
      w.off('change', send);
      clearInterval(beat);
    });
  });
  app.post('/api/:mode/overlay/keys', async (req) => {
    const w = worldFor(req),
      key = randomBytes(32).toString('base64url');
    w.atomic(() => {
      w.run('DELETE FROM overlay_keys');
      w.run('INSERT INTO overlay_keys VALUES (?,?)', digest(key), w.now());
    });
    return { key, url: `http://localhost:${port}/overlay/${w.mode}#key=${key}` };
  });
  app.delete('/api/:mode/overlay/keys', async (req) => {
    const w = worldFor(req);
    w.atomic(() => w.run('DELETE FROM overlay_keys'));
    for (const [id, s] of sessions)
      if (s.kind === 'overlay' && s.mode === w.mode) sessions.delete(id);
    return { ok: true };
  });
  app.post('/api/overlay/exchange', async (req, reply) => {
    const { mode, key } = z
      .object({ mode: z.enum(['live', 'simulation']), key: z.string().min(20).max(100) })
      .strict()
      .parse(req.body);
    if (!worlds[mode].get('SELECT 1 FROM overlay_keys WHERE hash=?', digest(key)))
      throw new RuleError(
        'This overlay key is invalid or revoked. Create a new one in Settings.',
        'UNAUTHORIZED',
        401,
      );
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, {
      kind: 'overlay',
      mode,
      csrf: digest(key),
      expires: Date.now() + 24 * 3600000,
    });
    reply.setCookie(`cv_overlay_${mode}`, id, {
      path: '/api',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 86400,
    });
    return { ok: true };
  });
  const overlaySnapshot = (mode: Mode) => {
    const w = worlds[mode],
      s = w.snapshot();
    return {
      mode,
      generation: s.generation,
      now: s.now,
      realm: s.realm,
      kingdoms: s.kingdoms,
      chapter: s.chapter,
      events: s.settings.quiet ? [] : s.events.slice(0, 3),
      quiet: s.settings.quiet,
      integration: { connected: s.integration.connected, state: s.integration.state },
    };
  };
  app.get('/api/:mode/overlay/snapshot', async (req) =>
    overlaySnapshot(z.enum(['live', 'simulation']).parse((req.params as any).mode)),
  );
  app.get('/api/:mode/overlay/events', async (req, reply) => {
    const w = worldFor(req),
      authorized = streamAuthorized(req, w.mode, true);
    const release = reserveStream(w.mode);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    let blocked = false;
    const send = () => {
      if (reply.raw.destroyed) return;
      if (!authorized()) {
        reply.raw.end();
        return;
      }
      if (blocked) return;
      blocked = !reply.raw.write(`data: ${JSON.stringify(overlaySnapshot(w.mode))}\n\n`);
    };
    reply.raw.on('drain', () => {
      blocked = false;
      send();
    });
    send();
    w.on('change', send);
    const beat = setInterval(send, 15000);
    beat.unref();
    reply.raw.on('close', () => {
      release();
      clearInterval(beat);
      w.off('change', send);
    });
  });
  app.get('/auth/twitch/start', async (req, reply) => {
    const session = sessions.get(req.cookies.cv_session ?? '');
    if (!session || session.kind !== 'admin' || session.expires < Date.now())
      throw new RuleError('Unlock the dashboard before connecting Twitch.', 'UNAUTHORIZED', 401);
    if (!integration) throw new RuleError('Twitch adapter unavailable.', 'NOT_CONFIGURED', 503);
    return reply.redirect(integration.authorize(req.cookies.cv_session!));
  });
  app.get('/auth/twitch/callback', async (req, reply) => {
    const query = z
      .object({
        state: z.string().max(200),
        code: z.string().max(500).optional(),
        error: z.string().optional(),
      })
      .parse(req.query);
    if (query.error) return reply.redirect('/?mode=live&screen=settings&oauth=denied');
    if (!query.code || !integration) throw new RuleError('Authorization did not include a code.');
    await integration.callback(query.state, query.code, req.cookies.cv_session ?? '');
    return reply.redirect('/?mode=live&screen=settings&oauth=connected');
  });
  app.post('/api/live/integration/disconnect', async () => {
    integration?.disconnect();
    return { ok: true };
  });
  app.get('/api/live/integration/subscribers', async () => integration?.subscribers());
  app.post('/api/live/integration/supporters/sync', async () => {
    if (!integration) throw new RuleError('Twitch integration is unavailable.');
    return integration.syncSupporters();
  });
  app.post('/api/simulation/characters/:id/supporter', async (req) => {
    const { tier } = z
      .object({ tier: z.number().int().min(0).max(3) })
      .strict()
      .parse(req.body);
    worlds.simulation.setSimulationSupporter(
      (req.params as { id: string }).id,
      tier as 0 | 1 | 2 | 3,
    );
    return { ok: true };
  });
  app.post('/api/:mode/backup', async (req) => {
    const w = worldFor(req);
    if (w.filename === ':memory:') return { ok: false };
    const file = resolve(
      dirnamePortable(w.filename),
      `${w.mode}-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`,
    );
    await backup(w.db, file);
    return { ok: true, file };
  });
  const staticRoot = resolve('dist');
  if (existsSync(resolve(staticRoot, 'index.html'))) {
    await app.register(serveStatic, { root: staticRoot });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/auth/'))
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Route not found.' });
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      return reply.sendFile('index.html');
    });
  }
  worlds.live.on('authorizationLost', () => {
    for (const [id, s] of sessions) if (s.kind === 'admin') sessions.delete(id);
  });
  return { app, bootstrap, sessions };
}
function dirnamePortable(path: string) {
  return resolve(path, '..');
}
