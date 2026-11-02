import { localSpeech } from './herald';
import { ACCEPTED_MOMENTS } from '../shared/stream-moments';
import { RealmRegistry, summarizeRealm } from './realms';
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
import { Companion } from './companion';
import { WorldTasks } from './world-tasks';

type Session = {
  csrf: string;
  expires: number;
  kind: 'admin' | 'overlay';
  mode?: Mode;
  realmId?: string;
};
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
  options: {
    bootstrap?: string;
    port?: number;
    test?: boolean;
    registry?: RealmRegistry;
    tasksDirectory?: string;
  } = {},
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
  const realmIdFor = (req: any): string =>
    z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,39}$/)
      .parse(req.query?.realm ?? 'home');
  const realmWorld = (mode: Mode, id: string) => {
    if (options.registry) return options.registry.get(mode, id);
    if (id !== 'home') throw new RuleError('Realm not found.', 'NOT_FOUND', 404);
    return worlds[mode];
  };
  const simulationFor = (req: any) => realmWorld('simulation', realmIdFor(req));
  const overlayCookie = (mode: string, id: string) =>
    'cv_overlay_' + mode + (id === 'home' ? '' : '_' + id);
  const readSessionId = (req: any, mode?: string) => {
    const adminId = req.cookies.cv_session ?? '';
    const admin = sessions.get(adminId);
    if (admin?.kind === 'admin' && admin.expires > Date.now()) return adminId;
    return (mode ? req.cookies[overlayCookie(mode, realmIdFor(req))] : undefined) ?? adminId;
  };
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
    if (rawPath.startsWith('/api/') || rawPath.startsWith('/auth/'))
      reply.header('Cache-Control', 'no-store');
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
    if (req.url.startsWith('/api/') && !publicApi && !rawPath.startsWith('/api/companion/')) {
      const overlayRoute = /^\/api\/(live|simulation)\/overlay\/(snapshot|events)(\?|$)/.test(
        req.url,
      );
      const overlayMode = req.url.split('/')[2];
      const requestedRealm = realmIdFor(req);
      const session = sessions.get(readSessionId(req, overlayRoute ? overlayMode : undefined));
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
          (session.realmId ?? 'home') !== requestedRealm ||
          !realmWorld(session.mode!, requestedRealm).get(
            'SELECT 1 FROM overlay_keys WHERE hash=?',
            session.csrf,
          )
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
      return reply.code(status).send({
        code: 'INVALID_REQUEST',
        message: status === 413 ? 'Request body is too large.' : 'The request could not be parsed.',
        requestId: req.id,
      });
    console.error(`[${req.id}]`, error instanceof Error ? error.message : 'Unexpected failure');
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'The operation failed. Reload the current state before retrying.',
      requestId: req.id,
    });
  });
  const worldFor = (req: any) =>
    realmWorld(z.enum(['simulation', 'live']).parse(req.params.mode), realmIdFor(req));
  const competitions = new WorldTasks(
    options.tasksDirectory,
    Date.now,
    () => worlds.live.setting('realm') ?? 'Authorized community',
    () => worlds.live.setting('supporterChannel') ?? '',
  );
  app.addHook('onClose', () => competitions.close());
  const companion = new Companion(realmWorld, port, competitions);
  await companion.register(app);
  app.get('/api/:mode/world-tasks', async (req) =>
    competitions.snapshot(z.enum(['simulation', 'live']).parse((req.params as any).mode)),
  );
  app.post('/api/:mode/world-tasks', async (req) => {
    const body = z
      .object({
        game: z.string().trim().min(1).max(60),
        title: z.string().trim().min(1).max(100),
        objective: z.string().trim().min(10).max(1000),
        unit: z.enum(['members', 'teams', 'single']),
        target: z.number().int().min(1).max(100),
        hours: z.number().int().min(1).max(168),
        requireStreamer: z.boolean().default(true),
      })
      .strict()
      .parse(req.body);
    return competitions.create(
      z.enum(['simulation', 'live']).parse((req.params as any).mode),
      body,
    );
  });
  app.get('/api/:mode/world-tasks/proofs', async (req) =>
    competitions.reviewQueue(z.enum(['simulation', 'live']).parse((req.params as any).mode)),
  );
  app.post('/api/:mode/world-tasks/:id/streamer-proof', { bodyLimit: 7500000 }, async (req) => {
    const mode = z.enum(['simulation', 'live']).parse((req.params as any).mode),
      w = worldFor(req),
      channel = w.setting('supporterChannel');
    if (mode === 'live' && (!w.integration().connected || !channel))
      throw new RuleError('Connect the authorized streamer channel first.', 'REALM_OFFLINE', 503);
    const body = z
      .object({ note: z.string().trim().min(5).max(1000), image: z.string().min(1).max(7000000) })
      .strict()
      .parse(req.body);
    return competitions.submit(
      mode,
      (req.params as any).id,
      {
        realm: w.realmId,
        subject: mode === 'live' ? 'twitch:' + channel : 'streamer:' + w.realmId,
        generation: w.get('SELECT generation FROM environment')!.generation,
        name:
          mode === 'live'
            ? (w.integration().channel ?? 'Authorized streamer')
            : 'Simulated ' + w.realmId + ' streamer',
        role: 'streamer',
        channel: channel ?? null,
      },
      body.note,
      body.image,
    );
  });
  app.get('/api/:mode/world-tasks/proofs/:id/image', async (req, reply) => {
    const image = competitions.image(
      z.enum(['simulation', 'live']).parse((req.params as any).mode),
      (req.params as any).id,
    );
    return reply
      .type(image.mime)
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .send(image.bytes);
  });
  app.post('/api/:mode/world-tasks/proofs/:id/review', async (req) => {
    const body = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(req.body);
    return competitions.review(
      z.enum(['simulation', 'live']).parse((req.params as any).mode),
      (req.params as any).id,
      body.decision,
      body.reason,
    );
  });
  app.post('/api/:mode/world-tasks/:id/finalize', async (req) =>
    competitions.finalize(
      z.enum(['simulation', 'live']).parse((req.params as any).mode),
      (req.params as any).id,
    ),
  );
  app.post('/api/simulation/world-tasks/advance', async (req) =>
    competitions.advanceSimulation(
      z
        .object({ hours: z.number().int().min(1).max(72) })
        .strict()
        .parse(req.body).hours,
    ),
  );
  app.post('/api/:mode/companion/previews', async (req) => {
    const { characterId } = z
      .object({ characterId: z.string().min(1).max(100) })
      .strict()
      .parse(req.body);
    return companion.mintPreview(worldFor(req), characterId);
  });
  app.delete('/api/:mode/companion/previews', async (req) => {
    companion.revokePreviews(worldFor(req));
    return { ok: true };
  });
  app.get('/api/:mode/proposals', async (req) => worldFor(req).proposals());
  app.post('/api/:mode/proposals/:id/review', async (req) => {
    const body = z
      .object({
        action: z.enum(['accept', 'dismiss']),
        reason: z.string().trim().max(180).default(''),
      })
      .strict()
      .parse(req.body);
    return worldFor(req).reviewProposal(
      (req.params as { id: string }).id,
      body.action,
      body.reason,
    );
  });
  const streamAuthorized = (req: any, mode: Mode, overlay = false) => {
    const id = readSessionId(req, overlay ? mode : undefined);
    const session = sessions.get(id);
    return () =>
      !!session &&
      sessions.get(id) === session &&
      session.expires > Date.now() &&
      (session.kind === 'admin' ||
        (overlay &&
          session.mode === mode &&
          (session.realmId ?? 'home') === realmIdFor(req) &&
          !!realmWorld(mode, realmIdFor(req)).get(
            'SELECT 1 FROM overlay_keys WHERE hash=?',
            session.csrf,
          )));
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
  app.get('/api/:mode/atlas', async (req) => {
    const mode = z.enum(['simulation', 'live']).parse((req.params as any).mode),
      id = realmIdFor(req);
    if (options.registry) return options.registry.atlas(mode, id);
    const world = realmWorld(mode, id);
    return {
      mode,
      currentRealm: id,
      source: mode === 'simulation' ? 'local-simulation' : 'local-live',
      now: world.now(),
      realms: [summarizeRealm(world, id)],
    };
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
        herald: z.object({enabled:z.boolean(),volume:z.number().min(0).max(1),frequency:z.enum(['major','balanced'])}).strict().optional(),
        tone: z.enum(['heroic', 'cozy', 'dry']).optional(),
      })
      .strict()
      .parse(req.body);
    const w = worldFor(req);
    if (patch.autoChapters) w.set('lastAutoChapter', Date.now());
    return w.updateSettings(patch);
  });
  app.post('/api/:mode/milestone', async (req) => {
    const { milestone, actionId, generation } = z
      .object({
        milestone: z.enum(ACCEPTED_MOMENTS),
        actionId: z.string().uuid().optional(),
        generation: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    const w = worldFor(req);
    const key = actionId ?? z.string().min(8).max(150).parse(req.headers['idempotency-key']);
    return w.atomic(() => {
      const current = w.get('SELECT generation FROM environment WHERE id=1')!.generation;
      if (generation && current !== generation)
        throw new RuleError('The world changed. Choose the moment again.', 'STALE', 409);
      const receipt = `milestone:${current}:${w.setting('supporterChannel') ?? ''}:${key}`;
      const saved = w.get('SELECT result FROM receipts WHERE key=?', receipt);
      if (saved) {
        const previous = JSON.parse(saved.result);
        if (previous.milestone !== milestone)
          throw new RuleError('This action already recorded another moment.', 'CONFLICT', 409);
        return previous;
      }
      const eventId = w.event(
        'milestone',
        milestone,
        `${milestone} — confirmed by the streamer. This is story context, not automatic game telemetry or a combat bonus.`,
        null,
        'streamer',
      );
      const result = { ok: true, eventId, milestone };
      w.run('INSERT INTO receipts VALUES (?,?,?)', receipt, JSON.stringify(result), w.now());
      return result;
    });
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
    simulationFor(req).reset(scenario);
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
    simulationFor(req).advance(seconds);
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
    const world = simulationFor(req);
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
  app.post('/api/simulation/populate-chapter', async (req) => {
    const { chapterId } = z
      .object({ chapterId: z.string().uuid().optional() })
      .strict()
      .parse(req.body ?? {});
    simulationFor(req).simulatePledges(chapterId);
    return { ok: true };
  });
  app.post('/api/simulation/chapters/:id/complete', async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as any).id);
    return simulationFor(req).completeSimulationBattle(id);
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
    return {
      key,
      url: `http://localhost:${port}/overlay/${w.mode}${w.realmId === 'home' ? '' : '?realm=' + w.realmId}#key=${key}`,
    };
  });
  app.delete('/api/:mode/overlay/keys', async (req) => {
    const w = worldFor(req);
    w.atomic(() => w.run('DELETE FROM overlay_keys'));
    for (const [id, s] of sessions)
      if (s.kind === 'overlay' && s.mode === w.mode && (s.realmId ?? 'home') === w.realmId)
        sessions.delete(id);
    return { ok: true };
  });
  app.post('/api/overlay/exchange', async (req, reply) => {
    const { mode, key, realm } = z
      .object({
        mode: z.enum(['live', 'simulation']),
        key: z.string().min(20).max(100),
        realm: z
          .string()
          .regex(/^[a-z][a-z0-9-]{0,39}$/)
          .default('home'),
      })
      .strict()
      .parse(req.body);
    if (!realmWorld(mode, realm).get('SELECT 1 FROM overlay_keys WHERE hash=?', digest(key)))
      throw new RuleError(
        'This overlay key is invalid or revoked. Create a new one in Settings.',
        'UNAUTHORIZED',
        401,
      );
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, {
      kind: 'overlay',
      mode,
      realmId: realm,
      csrf: digest(key),
      expires: Date.now() + 24 * 3600000,
    });
    reply.setCookie(overlayCookie(mode, realm), id, {
      path: '/api',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 86400,
    });
    return { ok: true };
  });
  const overlaySnapshot = (w: World) => {
    const mode = w.mode,
      s = w.snapshot();
    return {
      mode,
      realmId: w.realmId,
      generation: s.generation,
      now: s.now,
      realm: s.realm,
      kingdoms: s.kingdoms,
      chapter: s.chapter,
      events: s.settings.quiet ? [] : s.events.slice(0, 3),
      quiet: s.settings.quiet,
      herald: s.settings.herald,
      heraldLines: w.all('SELECT event_id id,text,priority,created_at at FROM herald_events ORDER BY event_id DESC LIMIT 30'),
      integration: { connected: s.integration.connected, state: s.integration.state },
    };
  };
  app.get('/api/:mode/overlay/snapshot', async (req, reply) => {
    const w=worldFor(req), q=req.query as Record<string,string>;
    if(q.heraldAudio) {
      const id=z.coerce.number().int().positive().parse(q.heraldAudio);
      if(q.generation!==w.get('SELECT generation FROM environment WHERE id=1')!.generation || !w.settings().herald?.enabled || w.settings().quiet) return reply.code(409).send({message:'Herald inactive or world changed'});
      const row=w.get('SELECT text FROM herald_events WHERE event_id=? AND created_at>?',id,w.now()-30000);
      if(!row) return reply.code(404).send({message:'Announcement expired'});
      const audio=await localSpeech(row.text);
      if(!streamAuthorized(req,w.mode,true)() || q.generation!==w.get('SELECT generation FROM environment WHERE id=1')!.generation || !w.settings().herald?.enabled || w.settings().quiet) return reply.code(409).send({message:'Herald inactive or authorization changed'});
      if(!audio)return reply.code(503).send({message:'Local voice unavailable; use captions'});
      return reply.header('Cache-Control','no-store').type('audio/wav').send(audio);
    }
    return overlaySnapshot(w);
  });
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
      blocked = !reply.raw.write(`data: ${JSON.stringify(overlaySnapshot(w))}\n\n`);
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
    simulationFor(req).setSimulationSupporter(
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
