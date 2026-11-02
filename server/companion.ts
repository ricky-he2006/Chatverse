import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { World } from './world';
import { RuleError } from './engine';
import type { Mode } from '../shared/types';
import type { CompanionState } from '../shared/companion';
import { realmIdentity } from '../shared/realms';
import type { WorldTasks } from './world-tasks';
import { personalRecap } from './personal-recap';

type Player = {
  id: string;
  subject: string;
  name: string;
  mode: Mode;
  realm: string;
  generation: string;
  channel: string | null;
  preview: boolean;
  csrf: string;
  expires: number;
};
type Grant = Omit<Player, 'id' | 'csrf'>;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const modeSchema = z.enum(['simulation', 'live']);
const realmSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export class Companion {
  private players = new Map<string, Player>();
  private previews = new Map<string, Grant>();
  private states = new Map<
    string,
    { browser: string; realm: string; channel: string; generation: string; expires: number }
  >();
  constructor(
    private world: (mode: Mode, realm: string) => World,
    private port: number,
    private competitions?: WorldTasks,
  ) {}
  private prune() {
    for (const map of [this.players, this.previews, this.states])
      for (const [key, value] of map) if (value.expires <= Date.now()) map.delete(key);
  }
  private cookie(mode: Mode, realm: string) {
    return `cv_player_${mode}_${realm}`;
  }
  private makeSession(grant: Grant, reply: FastifyReply) {
    this.prune();
    if (this.players.size >= 256)
      throw new RuleError(
        'Too many companion sessions. Close a preview or try later.',
        'SESSION_LIMIT',
        429,
      );
    const id = randomBytes(32).toString('base64url'),
      csrf = randomBytes(24).toString('hex');
    const player = { ...grant, id, csrf };
    this.players.set(id, player);
    reply.setCookie(this.cookie(grant.mode, grant.realm), id, {
      path: '/api/companion',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: Math.max(1, Math.floor((grant.expires - Date.now()) / 1000)),
    });
    return {
      authenticated: true,
      mode: grant.mode,
      realm: grant.realm,
      csrf,
      preview: grant.preview,
    };
  }
  mintPreview(world: World, characterId: string) {
    if (world.mode !== 'simulation')
      throw new RuleError(
        'Real Live viewers cannot be impersonated. Use Twitch viewer sign-in.',
        'MODE_ISOLATION',
        403,
      );
    this.prune();
    if (this.previews.size >= 128)
      throw new RuleError('Too many pending previews. Try again shortly.', 'PREVIEW_LIMIT', 429);
    const row = world.get(
      'SELECT u.subject,u.name,u.synthetic FROM users u JOIN characters c ON c.user_id=u.id WHERE c.id=?',
      characterId,
    );
    if (!row?.synthetic) throw new RuleError('Select a simulated citizen.', 'NOT_FOUND', 404);
    const code = randomBytes(32).toString('base64url');
    this.previews.set(digest(code), {
      subject: row.subject,
      name: row.name,
      mode: 'simulation',
      realm: world.realmId,
      generation: world.get('SELECT generation FROM environment')!.generation,
      channel: null,
      preview: true,
      expires: Date.now() + 300000,
    });
    return { url: `/play?mode=simulation&realm=${world.realmId}#preview=${code}`, expiresIn: 300 };
  }
  revokePreviews(world: World) {
    for (const [key, p] of this.previews)
      if (p.mode === world.mode && p.realm === world.realmId) this.previews.delete(key);
    for (const [key, p] of this.players)
      if (p.preview && p.mode === world.mode && p.realm === world.realmId) this.players.delete(key);
  }
  private session(req: any, required = true): Player | null {
    const mode = modeSchema.parse(req.params.mode),
      realm = realmSchema.parse(req.query?.realm ?? 'home');
    const player = this.players.get(req.cookies[this.cookie(mode, realm)] ?? '');
    if (!player || player.expires <= Date.now()) {
      if (required)
        throw new RuleError(
          'Sign in to your companion or open a new Simulation preview.',
          'UNAUTHORIZED',
          401,
        );
      return null;
    }
    const world = this.world(mode, realm);
    if (
      player.mode !== mode ||
      player.realm !== realm ||
      player.generation !== world.get('SELECT generation FROM environment')!.generation ||
      (!player.preview && player.channel !== world.setting('supporterChannel'))
    )
      throw new RuleError(
        'This companion session no longer belongs to this realm. Sign in again.',
        'UNAUTHORIZED',
        401,
      );
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      !same(String(req.headers['x-csrf-token'] ?? ''), player.csrf)
    )
      throw new RuleError('Companion session check failed. Reload and try again.', 'CSRF', 403);
    return player;
  }
  private characterId(world: World, player: Player): string | undefined {
    return world.get(
      'SELECT c.id FROM characters c JOIN users u ON u.id=c.user_id WHERE u.subject=?',
      player.subject,
    )?.id;
  }
  state(player: Player): CompanionState {
    const w = this.world(player.mode, player.realm),
      id = this.characterId(w, player),
      c = id ? w.character(id) : null,
      s = w.snapshot(id);
    const lord = c
      ? w.get(
          'SELECT ends_at FROM lords WHERE character_id=? AND kingdom=? AND starts_at<=? AND ends_at>? ORDER BY ends_at DESC LIMIT 1',
          c.id,
          c.kingdom,
          w.now(),
          w.now(),
        )
      : undefined;
    return {
      mode: w.mode,
      realmId: w.realmId,
      realm: s.realm,
      now: s.now,
      generation: s.generation,
      preview: player.preview,
      identity: { name: player.name, verified: !player.preview },
      role: lord ? 'lord' : c ? 'citizen' : 'visitor',
      character: c ? { ...c, isLord: !!lord } : null,
      personalRecap: c ? personalRecap(w, c) : null,
      kingdoms: s.kingdoms.map((k) => ({
        id: k.id,
        name: k.name,
        color: k.color,
        citizens: k.citizens,
        territories: k.territories,
        lord: k.lord,
        fortressHealth: k.fortressHealth ?? 1800,
        points: k.points,
        wins: k.wins,
      })),
      territories: s.territories,
      chapter: s.chapter,
      elections: s.elections.filter((e) => c && e.kingdom === c.kingdom),
      challenges: s.challenges ?? [],
      events: s.events.slice(0, 12),
      season: s.season,
      citizens: c
        ? w
            .listCharacters('', c.kingdom, 0)
            .items.slice(0, 8)
            .map((h) => ({
              id: h.id,
              name: h.name,
              class: h.class,
              level: h.level,
              kingdom: h.kingdom,
              contribution: h.contribution,
              supporter: h.supporter,
              isLord: h.isLord,
            }))
        : [],
      proposals: c ? w.proposals(c.kingdom) : [],
      connected: w.mode === 'simulation' || s.integration.connected,
      lordEndsAt: lord?.ends_at ?? null,
    };
  }
  async register(app: FastifyInstance) {
    app.post('/api/companion/:mode/districts/:id/upgrade', async (req) => {
      const p = this.session(req)!,
        w = this.world(p.mode, p.realm),
        id = this.characterId(w, p);
      if (!id) throw new RuleError('Join a kingdom first.', 'FORBIDDEN', 403);
      if (p.mode === 'live' && !w.integration().connected)
        throw new RuleError('The streamer needs to reconnect.', 'REALM_OFFLINE', 503);
      const body = z
          .object({ expectedLevel: z.number().int().min(0).max(2) })
          .strict()
          .parse(req.body),
        key = z.string().min(8).max(150).parse(req.headers['idempotency-key']);
      return w.upgradeDistrict(
        id,
        (req.params as any).id,
        body.expectedLevel,
        `district:${p.subject}:${key}`,
      );
    });
    if (this.competitions) {
      app.get('/api/companion/:mode/world-tasks', async (req) => {
        const p = this.session(req)!;
        return this.competitions!.snapshot(p.mode, p);
      });
      app.post(
        '/api/companion/:mode/world-tasks/:id/proofs',
        { bodyLimit: 7500000 },
        async (req) => {
          const p = this.session(req)!,
            w = this.world(p.mode, p.realm);
          if (!this.characterId(w, p))
            throw new RuleError('Join a kingdom before contributing.', 'FORBIDDEN', 403);
          if (p.mode === 'live' && !w.integration().connected)
            throw new RuleError(
              'The streamer must reconnect this community.',
              'REALM_OFFLINE',
              503,
            );
          const body = z
            .object({
              note: z.string().trim().min(5).max(1000),
              image: z.string().min(1).max(7000000),
            })
            .strict()
            .parse(req.body);
          return this.competitions!.submit(
            p.mode,
            (req.params as any).id,
            {
              ...p,
              role:
                p.mode === 'live' && p.subject === 'twitch:' + w.setting('supporterChannel')
                  ? 'streamer'
                  : 'member',
            },
            body.note,
            body.image,
          );
        },
      );
      app.get('/api/companion/:mode/world-tasks/proofs/:id/image', async (req, reply) => {
        const p = this.session(req)!,
          image = this.competitions!.image(p.mode, (req.params as any).id, p);
        return reply
          .type(image.mime)
          .header('Content-Security-Policy', "default-src 'none'; sandbox")
          .send(image.bytes);
      });
    }
    app.get('/api/companion/config', async (req) => {
      const q = z
        .object({ mode: modeSchema.default('live'), realm: realmSchema.default('home') })
        .parse(req.query);
      if (q.mode === 'simulation')
        return {
          realm: realmIdentity(q.realm).name,
          mode: q.mode,
          configured: false,
          connected: false,
        };
      const w = this.world('live', q.realm);
      return {
        realm: w.setting('realm'),
        mode: 'live',
        configured: !!process.env.TWITCH_CLIENT_ID && !!process.env.TWITCH_CLIENT_SECRET,
        connected: w.integration().connected,
      };
    });
    app.post('/api/companion/exchange', async (req, reply) => {
      const { code } = z
        .object({ code: z.string().min(20).max(100) })
        .strict()
        .parse(req.body);
      const hash = digest(code),
        grant = this.previews.get(hash);
      this.previews.delete(hash);
      if (
        !grant ||
        grant.expires <= Date.now() ||
        grant.generation !==
          this.world(grant.mode, grant.realm).get('SELECT generation FROM environment')!.generation
      )
        throw new RuleError(
          'This preview link is expired or already used. Create a new one from Stream room.',
          'UNAUTHORIZED',
          401,
        );
      return this.makeSession({ ...grant, expires: Date.now() + 3600000 }, reply);
    });
    app.get('/api/companion/:mode/session', async (req) => {
      const p = this.session(req, false);
      return p
        ? { authenticated: true, csrf: p.csrf, preview: p.preview }
        : { authenticated: false };
    });
    app.delete('/api/companion/:mode/session', async (req, reply) => {
      const p = this.session(req)!;
      this.players.delete(p.id);
      reply.clearCookie(this.cookie(p.mode, p.realm), { path: '/api/companion' });
      return { ok: true };
    });
    app.get('/api/companion/:mode/state', async (req) => this.state(this.session(req)!));
    app.get('/api/companion/:mode/ledger', async (req) => {
      const p = this.session(req)!,
        w = this.world(p.mode, p.realm),
        id = this.characterId(w, p);
      return id
        ? w
            .all(
              `SELECT l.delta,l.balance_after,l.reason,l.created_at,
              c.id chapter_id,c.territory,c.attacker,c.defender,c.result,
              r.xp FROM ledger l
              LEFT JOIN chapters c ON c.id=l.source_id AND l.reason='battle'
              LEFT JOIN rewards r ON r.character_id=l.character_id AND r.source_id=l.source_id AND r.kind=l.reason
              WHERE l.character_id=? ORDER BY l.id DESC LIMIT 20`,
              id,
            )
            .map(({ result, ...row }) => {
              const outcome = result ? JSON.parse(result) : null;
              return {
                ...row,
                outcome: outcome
                  ? {
                      winner: outcome.winner,
                      healthA: outcome.healthA,
                      healthB: outcome.healthB,
                      maxHealthA: outcome.maxHealthA,
                      maxHealthB: outcome.maxHealthB,
                    }
                  : null,
              };
            })
        : [];
    });
    app.post('/api/companion/:mode/commands', async (req) => {
      const p = this.session(req)!,
        w = this.world(p.mode, p.realm);
      if (w.mode === 'live' && !w.integration().connected)
        throw new RuleError(
          'This realm is waiting for its streamer to reconnect.',
          'REALM_OFFLINE',
          503,
        );
      const command = z
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
        })
        .strict()
        .parse(req.body);
      const key = z.string().min(8).max(150).parse(req.headers['idempotency-key']);
      return w.command(
        { subject: p.subject, name: p.name },
        command,
        `companion:${p.subject}:${key}`,
      );
    });
    app.post('/api/companion/:mode/proposals', async (req) => {
      const p = this.session(req)!,
        w = this.world(p.mode, p.realm),
        id = this.characterId(w, p);
      if (!id) throw new RuleError('Join a kingdom first.');
      if (w.mode === 'live' && !w.integration().connected)
        throw new RuleError('The streamer needs to reconnect this realm.', 'REALM_OFFLINE', 503);
      const { territory } = z
        .object({ territory: z.string().min(1).max(40) })
        .strict()
        .parse(req.body);
      return w.proposeChapter(id, territory);
    });
    const redirect = () =>
      process.env.TWITCH_VIEWER_REDIRECT_URI ||
      `http://localhost:${this.port}/auth/viewer/callback`;
    app.get('/auth/viewer/start', async (req, reply) => {
      const realm = realmSchema.parse((req.query as any).realm ?? 'home'),
        w = this.world('live', realm);
      if (
        !process.env.TWITCH_CLIENT_ID ||
        !process.env.TWITCH_CLIENT_SECRET ||
        !w.integration().connected ||
        !w.setting('supporterChannel')
      )
        throw new RuleError(
          'The streamer must connect Twitch before viewer sign-in is available.',
          'NOT_CONNECTED',
          503,
        );
      this.prune();
      if (this.states.size >= 128)
        throw new RuleError('Too many sign-in attempts. Try later.', 'RATE_LIMIT', 429);
      const state = randomBytes(32).toString('base64url'),
        browser = randomBytes(32).toString('base64url');
      this.states.set(state, {
        browser,
        realm,
        channel: w.setting('supporterChannel')!,
        generation: w.get('SELECT generation FROM environment')!.generation,
        expires: Date.now() + 600000,
      });
      reply.setCookie('cv_viewer_oauth', browser, {
        path: '/auth/viewer',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 600,
      });
      const url = new URL('https://id.twitch.tv/oauth2/authorize');
      url.search = new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        redirect_uri: redirect(),
        response_type: 'code',
        scope: '',
        state,
      }).toString();
      return reply.redirect(url.href);
    });
    app.get('/auth/viewer/callback', async (req, reply) => {
      const q = z
        .object({
          state: z.string().max(100),
          code: z.string().max(500).optional(),
          error: z.string().max(100).optional(),
        })
        .parse(req.query);
      const state = this.states.get(q.state);
      this.states.delete(q.state);
      if (
        !state ||
        state.expires <= Date.now() ||
        !same(state.browser, req.cookies.cv_viewer_oauth ?? '')
      )
        throw new RuleError(
          'Viewer sign-in state is missing, expired or already used.',
          'INVALID_OAUTH_STATE',
          403,
        );
      reply.clearCookie('cv_viewer_oauth', { path: '/auth/viewer' });
      if (q.error) return reply.redirect('/play?mode=live&realm=' + state.realm + '&login=denied');
      if (!q.code) throw new RuleError('Twitch did not supply a viewer authorization code.');
      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: process.env.TWITCH_CLIENT_ID!,
          client_secret: process.env.TWITCH_CLIENT_SECRET!,
          code: q.code,
          grant_type: 'authorization_code',
          redirect_uri: redirect(),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new RuleError('Twitch viewer sign-in failed. Try again.', 'OAUTH_FAILED', 401);
      const token = z.object({ access_token: z.string().min(1) }).parse(await response.json());
      const validation = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: 'OAuth ' + token.access_token },
        signal: AbortSignal.timeout(10000),
      });
      if (!validation.ok)
        throw new RuleError('Twitch could not verify this viewer.', 'OAUTH_FAILED', 401);
      const identity = z
        .object({
          client_id: z.string(),
          user_id: z.string().min(1),
          login: z.string().regex(/^[a-zA-Z0-9_]{1,40}$/),
          expires_in: z.number().int().positive(),
        })
        .parse(await validation.json());
      const w = this.world('live', state.realm);
      if (
        identity.client_id !== process.env.TWITCH_CLIENT_ID ||
        state.channel !== w.setting('supporterChannel') ||
        state.generation !== w.get('SELECT generation FROM environment')!.generation ||
        !w.integration().connected
      )
        throw new RuleError(
          'The authorized realm changed during viewer sign-in. Start again.',
          'OAUTH_FAILED',
          403,
        );
      this.makeSession(
        {
          subject: 'twitch:' + identity.user_id,
          name: identity.login,
          mode: 'live',
          realm: state.realm,
          generation: state.generation,
          channel: state.channel,
          preview: false,
          expires: Date.now() + Math.min(3600, identity.expires_in) * 1000,
        },
        reply,
      );
      return reply.redirect('/play?mode=live&realm=' + state.realm);
    });
  }
}
