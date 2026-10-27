import WebSocket from 'ws';
import { randomBytes } from 'node:crypto';
import type { Command, Faction, IntegrationStatus } from '../shared/types';
import { ITEMS } from '../shared/catalog';
import { RuleError } from './engine';
import { disconnected, World } from './world';
import { TokenVault } from './vault';
import { twitchTier, type SupporterTier } from '../shared/supporters';

type Grant = {
  access_token: string;
  refresh_token: string;
  userId: string;
  login: string;
  scopes: string[];
};
type State = { session: string; expires: number };
const scopes = () => [
  'user:read:chat',
  'user:write:chat',
  ...(process.env.TWITCH_SUBSCRIPTIONS === 'true' ? ['channel:read:subscriptions'] : []),
];
const safeName = (name: string) => name.replace(/[\x00-\x1f\x7f<>]/g, '').slice(0, 40) || 'Citizen';
export class TwitchIntegration {
  status: IntegrationStatus = { ...disconnected };
  private grant: Grant | null = null;
  private socket: WebSocket | null = null;
  private states = new Map<string, State>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private validationTimer: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private wantConnection = false;
  private reconnectAttempt = 0;
  private keepaliveSeconds = 30;
  private ownMessages = new Set<string>();
  private cooldowns = new Map<string, number>();
  private sends: number[] = [];
  private sending = false;
  private queue: { body: string; expires: number; outboxId?: number }[] = [];
  private replyTimer: ReturnType<typeof setInterval>;
  private supporterTimer: ReturnType<typeof setInterval>;
  private supporterSync: Promise<{ updated: number; verifiedAt: number }> | null = null;
  private closed = false;
  private supporterAttempt = 0;
  private queueSupporterSync() {
    if (Date.now() - this.supporterAttempt < 60000) return;
    this.supporterAttempt = Date.now();
    void this.syncSupporters().catch(() => {});
  }
  constructor(
    private world: World,
    private vault: TokenVault,
  ) {
    this.status.configured = !!process.env.TWITCH_CLIENT_ID && !!process.env.TWITCH_CLIENT_SECRET;
    world.integration = () => ({ ...this.status });
    this.replyTimer = setInterval(() => void this.flush().catch(() => {}), 3000);
    this.replyTimer.unref();
    this.supporterTimer = setInterval(() => this.queueSupporterSync(), 600000);
    this.supporterTimer.unref();
  }
  private update(patch: Partial<IntegrationStatus>) {
    Object.assign(this.status, patch);
    this.world.emit('change');
  }
  async initialize() {
    if (!this.status.configured) return;
    try {
      this.grant = this.vault.read<Grant>();
      if (this.grant) {
        await this.validate();
        this.wantConnection = true;
        this.connect();
      }
    } catch (error) {
      this.update({
        error: error instanceof Error ? error.message : 'Twitch reconnect required',
        state: 'Reconnect required',
      });
    }
    this.validationTimer = setInterval(
      () => void this.validate().catch(() => this.authorizationLost()),
      3600000,
    );
    this.validationTimer.unref();
  }
  authorize(session: string) {
    if (!this.status.configured)
      throw new RuleError(
        'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env, then restart.',
        'TWITCH_NOT_CONFIGURED',
        503,
      );
    for (const [key, value] of this.states) if (value.expires < Date.now()) this.states.delete(key);
    const state = randomBytes(32).toString('hex');
    this.states.set(state, { session, expires: Date.now() + 600000 });
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.search = new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: scopes().join(' '),
      state,
      force_verify: 'true',
    }).toString();
    return url.toString();
  }
  redirectUri() {
    return process.env.TWITCH_REDIRECT_URI ?? 'http://localhost:3000/auth/twitch/callback';
  }
  async callback(state: string, code: string, session: string) {
    const pending = this.states.get(state);
    this.states.delete(state);
    if (!pending || pending.expires < Date.now() || pending.session !== session)
      throw new RuleError(
        'OAuth state is missing, expired or already used. Start again.',
        'INVALID_OAUTH_STATE',
        403,
      );
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID!,
        client_secret: process.env.TWITCH_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri(),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new RuleError(
        'Twitch did not accept the authorization code. Start again.',
        'OAUTH_FAILED',
        401,
      );
    const token = (await response.json()) as any;
    const validation = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${token.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!validation.ok) throw new RuleError('Twitch token validation failed.', 'OAUTH_FAILED', 401);
    const identity = (await validation.json()) as any;
    if (
      identity.client_id !== process.env.TWITCH_CLIENT_ID ||
      !scopes().every((s) => identity.scopes?.includes(s))
    )
      throw new RuleError(
        'Twitch returned an unexpected app or missing permissions.',
        'MISSING_SCOPE',
        403,
      );
    if (this.grant && this.grant.userId !== identity.user_id)
      throw new RuleError(
        'Disconnect the previous channel before authorizing a different broadcaster.',
        'CHANNEL_MISMATCH',
        409,
      );
    this.grant = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      userId: identity.user_id,
      login: identity.login,
      scopes: identity.scopes,
    };
    this.vault.write(this.grant);
    this.world.atomic(() => {
      this.world.set('realm', `${identity.login}’s Realm`);
      this.world.set('supporterChannel', identity.user_id);
      this.world.event(
        'integration',
        'A real channel, connected',
        `ChatVerse is authorized for ${safeName(identity.login)}. Citizens join through real Twitch chat.`,
        null,
        'twitch',
      );
    });
    this.wantConnection = true;
    this.connect();
  }
  private async validate() {
    if (!this.grant) return;
    let response = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${this.grant.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401) {
      await this.refresh();
      response = await fetch('https://id.twitch.tv/oauth2/validate', {
        headers: { Authorization: `OAuth ${this.grant!.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
    }
    if (!response.ok)
      throw new RuleError('Twitch authorization is no longer valid.', 'REAUTH_REQUIRED', 401);
    const data = (await response.json()) as any;
    if (
      data.user_id !== this.grant!.userId ||
      data.client_id !== process.env.TWITCH_CLIENT_ID ||
      !data.scopes.includes('user:read:chat')
    )
      throw new RuleError('Twitch identity or scope mismatch.', 'REAUTH_REQUIRED', 401);
    this.grant!.scopes = data.scopes;
    this.world.set('supporterChannel', this.grant!.userId);
    this.update({
      channel: this.grant!.login,
      scopes: data.scopes,
      replies: data.scopes.includes('user:write:chat'),
      subscriptions: data.scopes.includes('channel:read:subscriptions'),
    });
  }
  private async refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      if (!this.grant) throw new Error('No Twitch grant');
      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.grant.refresh_token,
          client_id: process.env.TWITCH_CLIENT_ID!,
          client_secret: process.env.TWITCH_CLIENT_SECRET!,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        this.authorizationLost();
        throw new RuleError('Reconnect Twitch to renew authorization.', 'REAUTH_REQUIRED', 401);
      }
      const next = (await response.json()) as any;
      this.grant = {
        ...this.grant,
        access_token: next.access_token,
        refresh_token: next.refresh_token ?? this.grant.refresh_token,
      };
      this.vault.write(this.grant);
    })().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }
  private async helix(path: string, options: RequestInit = {}, retry = true): Promise<any> {
    if (!this.grant) throw new RuleError('Connect Twitch first.', 'NOT_CONNECTED', 503);
    const response = await fetch(`https://api.twitch.tv/helix/${path}`, {
      ...options,
      headers: {
        'Client-Id': process.env.TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${this.grant.access_token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401 && retry) {
      await this.refresh();
      return this.helix(path, options, false);
    }
    if (response.status === 403 && path.startsWith('subscriptions?')) {
      this.update({ subscriptions: false });
      throw new RuleError(
        'Subscription access is unavailable. Reauthorize the broadcaster with the optional subscription scope.',
        'MISSING_SCOPE',
        403,
      );
    }
    if (response.status === 429)
      throw new RuleError(
        'Twitch rate limit reached. Requests will be held.',
        'TWITCH_RATE_LIMIT',
        429,
      );
    if (!response.ok)
      throw new RuleError(
        `Twitch request failed (${response.status}). Check channel permissions.`,
        'TWITCH_API_ERROR',
        502,
      );
    return response.status === 204 ? null : response.json();
  }
  private connect(url = 'wss://eventsub.wss.twitch.tv/ws', handoff = false) {
    if (!this.grant || !this.wantConnection) return;
    const old = this.socket;
    this.update({ state: handoff ? 'Reconnecting' : 'Connecting', connected: false, error: null });
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.on('message', (data) => {
      void (async () => {
        const frame = JSON.parse(data.toString());
        if (frame.payload?.session?.keepalive_timeout_seconds)
          this.keepaliveSeconds = frame.payload.session.keepalive_timeout_seconds;
        if (this.watchdog) clearTimeout(this.watchdog);
        this.watchdog = setTimeout(
          () => {
            if (this.socket === socket) socket.terminate();
          },
          this.keepaliveSeconds * 1000 + 5000,
        );
        this.watchdog.unref();
        if (frame.metadata?.message_type === 'session_welcome') {
          if (handoff) {
            old?.close();
            this.update({ connected: true, state: 'Connected', gapSince: null });
          } else {
            this.update({ state: 'Subscribing' });
            await this.helix('eventsub/subscriptions', {
              method: 'POST',
              body: JSON.stringify({
                type: 'channel.chat.message',
                version: '1',
                condition: { broadcaster_user_id: this.grant!.userId, user_id: this.grant!.userId },
                transport: { method: 'websocket', session_id: frame.payload.session.id },
              }),
            });
            this.update({
              connected: true,
              state: 'Connected',
              channel: this.grant!.login,
              scopes: this.grant!.scopes,
              replies: this.grant!.scopes.includes('user:write:chat'),
              subscriptions: this.grant!.scopes.includes('channel:read:subscriptions'),
              gapSince: null,
            });
          }
          this.reconnectAttempt = 0;
          this.queueSupporterSync();
        } else if (frame.metadata?.message_type === 'session_reconnect') {
          const next = new URL(frame.payload.session.reconnect_url);
          if (next.protocol !== 'wss:' || next.hostname !== 'eventsub.wss.twitch.tv')
            throw new Error('Unexpected Twitch reconnect host');
          this.connect(next.href, true);
        } else if (frame.metadata?.message_type === 'revocation') {
          this.authorizationLost();
        } else if (
          frame.metadata?.message_type === 'notification' &&
          frame.metadata.subscription_type === 'channel.chat.message'
        ) {
          if (
            frame.payload.subscription?.type !== 'channel.chat.message' ||
            frame.payload.event?.broadcaster_user_id !== this.grant?.userId
          )
            return;
          this.update({ lastEventAt: Date.now() });
          await this.chat(frame.metadata.message_id, frame.payload.event);
        }
      })().catch((error) => {
        this.update({ error: error instanceof Error ? error.message : 'Twitch event rejected' });
        if (!this.status.connected) socket.close();
      });
    });
    socket.on('error', () =>
      this.update({ error: 'Twitch connection unavailable. Check network access.' }),
    );
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.update({
        connected: false,
        state: this.wantConnection ? 'Reconnecting' : 'Disconnected',
        gapSince: this.status.gapSince ?? Date.now(),
      });
      if (this.wantConnection) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(
          () => this.connect(),
          Math.min(30000, 1000 * 2 ** this.reconnectAttempt++) + Math.floor(Math.random() * 500),
        );
        this.timer.unref();
      }
    });
  }
  private async chat(metadataId: string, event: any) {
    if (
      typeof event.message_id !== 'string' ||
      typeof event.chatter_user_id !== 'string' ||
      typeof event.message?.text !== 'string' ||
      this.ownMessages.has(event.message_id)
    )
      return;
    const raw = event.message.text.trim();
    if (!raw.startsWith('!') || raw.length > 200) return;
    const parts = raw.toLowerCase().split(/\s+/);
    let verb = parts.shift()!.slice(1);
    if (verb === 'cv') verb = parts.shift() ?? 'help';
    const mutating = [
      'join',
      'class',
      'pledge',
      'vote',
      'equip',
      'upgrade',
      'buy',
      'nominate',
      'elect',
    ];
    const reads = [
      'challenges',
      'help',
      'profile',
      'stats',
      'level',
      'shop',
      'inventory',
      'kingdom',
      'leaderboard',
      'battle',
    ];
    if (!mutating.includes(verb) && !reads.includes(verb)) return;
    const key = `twitch:${this.grant!.userId}:${event.message_id}`;
    if (this.world.get('SELECT 1 FROM receipts WHERE key=?', key)) return;
    const cooldownKey = `${event.chatter_user_id}:${mutating.includes(verb) ? 'write' : 'read'}`;
    if ((this.cooldowns.get(cooldownKey) ?? 0) > Date.now()) return;
    this.cooldowns.set(cooldownKey, Date.now() + (mutating.includes(verb) ? 2000 : 10000));
    if (this.cooldowns.size > 10000)
      for (const [id, time] of this.cooldowns) if (time < Date.now()) this.cooldowns.delete(id);
    const actor = {
      subject: `twitch:${event.chatter_user_id}`,
      name: safeName(event.chatter_user_name ?? event.chatter_user_login ?? 'Citizen'),
    };
    let message = '';
    try {
      if (mutating.includes(verb)) {
        message = this.world.command(
          actor,
          { type: verb as Command['type'], argument: parts.join(' ') },
          key,
        ).message;
        if (verb === 'join' && this.status.subscriptions) this.queueSupporterSync();
      } else {
        const c = this.world.get(
          'SELECT c.id FROM characters c JOIN users u ON u.id=c.user_id WHERE u.subject=?',
          actor.subject,
        );
        if (verb === 'help')
          message =
            'ChatVerse: !join north|east|west · !class rogue · !pledge · !vote attack|defend|raid · !profile · !inventory · !upgrade item-id';
        else if (verb === 'challenges')
          message =
            this.world
              .challengeSnapshots()
              .filter((r) => r.status === 'open')
              .map((r) => `${r.title}: ${r.leaders[0]?.score ?? 0}/${r.target}`)
              .join(' · ') || 'The current realm races are closed. A new wave opens daily.';
        else if (verb === 'profile' || verb === 'stats' || verb === 'level') {
          if (!c) throw new RuleError('Begin with !join north, east or west.');
          const hero = this.world.character(c.id);
          message = `${hero.name} · Lv ${hero.level} ${hero.class} · ${hero.kingdom} · ${hero.xp} XP · ${hero.gold} gold · ATK ${hero.stats.attack} / DEF ${hero.stats.defense}.`;
        } else if (verb === 'shop')
          message = ITEMS.map((i) => `${i.id} (${i.cost}g)`).join(' · ') + ' · !buy item-id';
        else if (verb === 'inventory') {
          if (!c) throw new RuleError('Join a kingdom first.');
          message = this.world
            .character(c.id)
            .gear!.map((g) => `${g.definition} +${g.upgrade}${g.equipped ? ' [equipped]' : ''}`)
            .join(' · ');
        } else if (verb === 'leaderboard')
          message = this.world
            .snapshot()
            .kingdoms.sort((a, b) => b.points - a.points)
            .map((k, i) => `${i + 1}. ${k.name} ${k.points} pts`)
            .join(' · ');
        else if (verb === 'battle') {
          message = 'Battle proposal recorded in the chronicle for the streamer to review.';
          this.world.atomic(() =>
            this.world.event(
              'proposal',
              'A citizen calls for a chapter',
              `${actor.name} proposes a chapter against ${parts[0] ?? 'a rival kingdom'}.`,
              null,
              'twitch',
            ),
          );
        } else {
          const k = this.world
            .snapshot()
            .kingdoms.find(
              (k) =>
                k.id === (parts[0] ?? (c ? this.world.character(c.id, false).kingdom : 'north')),
            );
          if (!k) throw new RuleError('Choose north, east or west.');
          message = `${k.name} · ${k.citizens} citizens · ${k.territories} territories · Lord: ${k.lord ?? 'vacant'} · ${k.points} season points.`;
        }
        this.world.atomic(() =>
          this.world.run(
            'INSERT INTO receipts VALUES (?,?,?)',
            key,
            JSON.stringify({ message }),
            this.world.now(),
          ),
        );
      }
    } catch (error) {
      message =
        error instanceof RuleError
          ? error.message
          : 'ChatVerse could not accept that command. Try again shortly.';
    }
    this.enqueue(`@${safeName(event.chatter_user_login ?? actor.name)} ${message}`);
  }
  enqueue(body: string, outboxId?: number) {
    if (this.queue.length >= 50) return;
    this.queue.push({ body: body.slice(0, 480), expires: Date.now() + 15000, outboxId });
  }
  private async flush() {
    if (
      this.sending ||
      !this.status.connected ||
      !this.status.replies ||
      !this.world.settings().chatOutput ||
      this.world.settings().quiet
    )
      return;
    const pending = this.world.all(
      "SELECT * FROM outbox WHERE status='pending' ORDER BY id LIMIT 3",
    );
    for (const row of pending) {
      this.world.run("UPDATE outbox SET status='queued' WHERE id=?", row.id);
      this.enqueue(row.body, row.id);
    }
    const cutoff = Date.now() - 30000;
    this.sends = this.sends.filter((t) => t > cutoff);
    if (this.sends.length >= 10) return;
    const next = this.queue.shift();
    if (!next) return;
    if (next.expires < Date.now()) {
      if (next.outboxId)
        this.world.run("UPDATE outbox SET status='expired' WHERE id=?", next.outboxId);
      return;
    }
    this.sending = true;
    this.sends.push(Date.now());
    try {
      const response = await this.helix('chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          broadcaster_id: this.grant!.userId,
          sender_id: this.grant!.userId,
          message: next.body,
        }),
      });
      const sent = response.data?.[0];
      if (sent?.is_sent && sent.message_id) {
        this.ownMessages.add(sent.message_id);
        if (this.ownMessages.size > 1000)
          this.ownMessages.delete(this.ownMessages.values().next().value!);
      }
      if (next.outboxId)
        this.world.run(
          'UPDATE outbox SET status=? WHERE id=?',
          sent?.is_sent ? 'sent' : 'blocked',
          next.outboxId,
        );
    } catch (error) {
      if (next.outboxId)
        this.world.run("UPDATE outbox SET status='unknown' WHERE id=?", next.outboxId);
      this.update({ error: error instanceof Error ? error.message : 'Chat delivery unknown' });
    } finally {
      this.sending = false;
    }
  }
  private authorizationLost() {
    this.wantConnection = false;
    this.socket?.close();
    this.update({
      subscriptions: false,
      replies: false,
      connected: false,
      state: 'Reauthorize required',
      error: 'Authorization was revoked or could not be renewed. Reconnect Twitch.',
    });
    this.world.emit('authorizationLost');
  }
  disconnect() {
    this.wantConnection = false;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
    this.queue = [];
    this.grant = null;
    this.vault.write(null);
    this.update({ ...disconnected, configured: this.status.configured, state: 'Disconnected' });
  }
  async subscribers() {
    if (!this.grant || !this.status.subscriptions)
      throw new RuleError('Subscription recognition is unavailable.', 'MISSING_SCOPE', 403);
    const data = await this.helix(`subscriptions?broadcaster_id=${this.grant.userId}&first=1`);
    return { total: data.total ?? null, verifiedAt: Date.now(), cosmeticOnly: true };
  }
  async syncSupporters(): Promise<{ updated: number; verifiedAt: number }> {
    if (this.supporterSync) return this.supporterSync;
    if (!this.grant?.scopes.includes('channel:read:subscriptions') || !this.status.subscriptions)
      throw new RuleError(
        'Authorize optional channel:read:subscriptions to sync supporter ranks.',
        'MISSING_SCOPE',
        403,
      );
    const grant = this.grant;
    const work = async () => {
      const citizens = this.world.all(
        "SELECT c.id,u.subject FROM characters c JOIN users u ON u.id=c.user_id WHERE u.subject LIKE 'twitch:%' ORDER BY c.id",
      );
      const updates: { id: string; tier: SupporterTier; gifted: boolean }[] = [];
      const startedAt = this.world.now();
      for (let offset = 0; offset < citizens.length; offset += 100) {
        if (this.closed || this.grant !== grant)
          throw new Error('Supporter sync cancelled after authorization changed.');
        const batch = citizens.slice(offset, offset + 100);
        const params = new URLSearchParams({ broadcaster_id: grant.userId, first: '100' });
        for (const c of batch) params.append('user_id', c.subject.slice(7));
        const data = await this.helix('subscriptions?' + params);
        if (!Array.isArray(data.data) || data.pagination?.cursor)
          throw new Error('Incomplete supporter response; previous ranks retained.');
        const found = new Map<string, { tier: SupporterTier; gifted: boolean }>();
        for (const row of data.data) {
          if (
            row.broadcaster_id !== grant.userId ||
            !batch.some((c) => c.subject === 'twitch:' + row.user_id) ||
            found.has(row.user_id) ||
            typeof row.is_gift !== 'boolean'
          )
            throw new Error('Invalid supporter identity in Twitch response.');
          found.set(row.user_id, { tier: twitchTier(row.tier), gifted: row.is_gift });
        }
        for (const c of batch) {
          const sub = found.get(c.subject.slice(7));
          updates.push({ id: c.id, tier: sub?.tier ?? 0, gifted: sub?.gifted ?? false });
        }
      }
      if (this.closed || this.grant !== grant || !this.status.subscriptions)
        throw new Error('Supporter sync cancelled after authorization changed.');
      this.world.atomic(() => {
        this.world.set('supporterChannel', grant.userId);
        for (const row of updates) {
          const prior = this.world.get(
            'SELECT * FROM supporter_status WHERE character_id=?',
            row.id,
          );
          this.world.run(
            "INSERT INTO supporter_status VALUES (?,?,?,?,?,'twitch') ON CONFLICT(character_id) DO UPDATE SET broadcaster_id=excluded.broadcaster_id,tier=excluded.tier,gifted=excluded.gifted,verified_at=excluded.verified_at,source='twitch'",
            row.id,
            grant.userId,
            row.tier,
            row.gifted ? 1 : 0,
            startedAt,
          );
          if (
            row.tier > 0 &&
            (!prior || prior.broadcaster_id !== grant.userId || prior.tier !== row.tier)
          ) {
            const c = this.world.character(row.id, false);
            this.world.event(
              'supporter',
              `${c.name} · ${c.supporter!.title}`,
              `A verified supporter wears a new ceremonial banner. Recognition is cosmetic; combat and votes remain equal.`,
              c.kingdom,
              'twitch',
            );
          }
        }
        this.world.set('supporterSyncedAt', startedAt);
      });
      return { updated: updates.length, verifiedAt: startedAt };
    };
    this.supporterSync = work();
    try {
      return await this.supporterSync;
    } finally {
      this.supporterSync = null;
    }
  }
  close() {
    this.closed = true;
    clearInterval(this.supporterTimer);
    this.wantConnection = false;
    this.socket?.close();
    if (this.timer) clearTimeout(this.timer);
    if (this.watchdog) clearTimeout(this.watchdog);
    if (this.validationTimer) clearInterval(this.validationTimer);
    clearInterval(this.replyTimer);
  }
}
