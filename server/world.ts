import {
  growthFor,
  GROWTH_RULESET,
  WORLD_TERRITORIES,
  RACES,
  type RealmChallenge,
} from '../shared/expansion';
import { DatabaseSync } from 'node:sqlite';
import { SUPPORTER_RANKS, type SupporterStatus, type SupporterTier } from '../shared/supporters';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { CLASSES, FACTIONS, ITEMS, RULESET, TERRITORIES, TACTICS } from '../shared/catalog';
import type {
  Mode,
  Faction,
  ClassName,
  Character,
  Chapter,
  Command,
  CommandResult,
  Election,
  Gear,
  Settings,
  WorldSnapshot,
  IntegrationStatus,
  Tactic,
  BattleInput,
  WorldEvent,
} from '../shared/types';
import {
  effectivePower,
  hash,
  levelFor,
  progress,
  random,
  resolveBattle,
  RuleError,
  selectRoster,
  statsFor,
  tacticFor,
} from './engine';

type Row = Record<string, any>;
const WEEK = 7 * 86400000;
const emptyVotes = () => ({
  north: { attack: 0, defend: 0, raid: 0 },
  east: { attack: 0, defend: 0, raid: 0 },
  west: { attack: 0, defend: 0, raid: 0 },
});
export const disconnected: IntegrationStatus = {
  configured: false,
  connected: false,
  state: 'Not connected',
  channel: null,
  scopes: [],
  lastEventAt: null,
  gapSince: null,
  error: null,
  replies: false,
  subscriptions: false,
};

export class World extends EventEmitter {
  db: DatabaseSync;
  private depth = 0;
  clockOffset = 0;
  integration = () => disconnected;
  constructor(
    public mode: Mode,
    public filename: string,
    private clock = () => Date.now(),
  ) {
    super();
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
    this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    const env = this.get('SELECT * FROM environment WHERE id=1');
    if (env && (env.mode !== mode || ![1, 2, 3].includes(env.version))) {
      this.db.close();
      throw new Error('Database environment or schema mismatch');
    }
    if (!env) this.run('INSERT INTO environment VALUES (1,?,?,1)', mode, randomUUID());
    this.clockOffset = Number(this.setting('clockOffset') ?? 0);
    if (!this.get('SELECT id FROM kingdoms LIMIT 1')) this.initialize();
    this.atomic(() => {
      this.syncGrowth();
      this.ensureChallenges();
      this.seedSupporters();
      this.run('UPDATE environment SET version=3 WHERE id=1');
      this.run("UPDATE narrative_jobs SET status='template' WHERE status='requested'");
      this.run("UPDATE outbox SET status='unknown' WHERE status='queued'");
    });
  }
  now() {
    return this.clock() + this.clockOffset;
  }
  day() {
    return new Date(this.now()).toISOString().slice(0, 10);
  }
  get(sql: string, ...args: any[]): Row | undefined {
    return this.db.prepare(sql).get(...args) as Row | undefined;
  }
  all(sql: string, ...args: any[]): Row[] {
    return this.db.prepare(sql).all(...args) as Row[];
  }
  run(sql: string, ...args: any[]) {
    return this.db.prepare(sql).run(...args);
  }
  setting(key: string): string | undefined {
    return this.get('SELECT value FROM settings WHERE key=?', key)?.value;
  }
  set(key: string, value: unknown) {
    this.run(
      'INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  }
  atomic<T>(fn: () => T): T {
    if (this.depth) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.depth++;
    let result: T;
    try {
      result = fn();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      this.depth--;
      throw error;
    }
    this.depth--;
    this.notifyChange();
    return result;
  }
  notifyChange() {
    // Notifications are observers of committed state, never part of the game transaction.
    for (const listener of this.rawListeners('change')) {
      try {
        listener.call(this);
      } catch {
        console.error('State committed; a realtime observer failed. Reload that view.');
      }
    }
  }
  initialize() {
    this.atomic(() => {
      for (const faction of Object.keys(FACTIONS))
        this.run('INSERT INTO kingdoms(id) VALUES (?)', faction);
      for (const t of TERRITORIES)
        this.run('INSERT INTO territories(id,owner) VALUES (?,?)', t.id, t.owner);
      this.run(
        'INSERT INTO seasons VALUES (?,?,?,?,?)',
        randomUUID(),
        1,
        this.now(),
        this.now() + WEEK,
        'active',
      );
      this.set('realm', this.mode === 'simulation' ? 'The Everfall Realm' : 'Your Twitch realm');
      this.set('config', {
        quiet: false,
        autoChapters: false,
        chatOutput: false,
        aiEnabled: false,
        tone: 'heroic',
      });
      if (this.mode === 'simulation') this.populate('baseline');
    });
  }
  settings(): Settings {
    return JSON.parse(this.setting('config')!);
  }
  updateSettings(patch: Partial<Settings>) {
    return this.atomic(() => {
      const result = { ...this.settings(), ...patch };
      this.set('config', result);
      return result;
    });
  }
  event(
    type: string,
    title: string,
    body: string,
    kingdom: Faction | null = null,
    source = this.mode === 'simulation' ? 'simulated' : 'system',
  ) {
    const id = Number(
      this.run(
        'INSERT INTO events(type,title,body,source,kingdom,created_at) VALUES (?,?,?,?,?,?)',
        type,
        title,
        body,
        source,
        kingdom,
        this.now(),
      ).lastInsertRowid,
    );
    if (['battle', 'election', 'season'].includes(type)) {
      this.run('INSERT INTO narrative_jobs(event_id) VALUES (?)', id);
      if (this.mode === 'live' && this.settings().chatOutput && !this.settings().quiet)
        this.run(
          'INSERT INTO outbox(event_id,body,created_at) VALUES (?,?,?)',
          id,
          body,
          this.now(),
        );
    }
    return id;
  }
  private populate(scenario: string) {
    this.set('scenario', scenario);
    if (scenario === 'first-citizen') {
      this.event(
        'realm',
        'A world waiting to be written',
        'The first banner has yet to find its citizens. Join a kingdom to begin.',
      );
      return;
    }
    const rng = random(20261026),
      beginnings = [
        'Ari',
        'Mira',
        'Thorn',
        'Elowen',
        'Kael',
        'Lyra',
        'Orin',
        'Nyra',
        'Rowan',
        'Soren',
        'Fenn',
        'Isla',
      ],
      endings = [
        'Ashford',
        'Moonveil',
        'Wintermere',
        'Dawnward',
        'Briar',
        'Stormweaver',
        'Ember',
        'Silverbrook',
        'Vale',
        'Hollow',
      ];
    for (let n = 1; n <= 600; n++) {
      const id = `sim-${String(n).padStart(4, '0')}`,
        kingdom: Faction = n <= 220 ? 'north' : n <= 420 ? 'east' : 'west';
      const name =
        n === 1
          ? 'Mira Stormweaver'
          : n === 2
            ? 'Kaito Wintermere'
            : n === 221
              ? 'Arnav Dawnward'
              : n === 421
                ? 'Zara Moonveil'
                : `${beginnings[rng() % beginnings.length]} ${endings[rng() % endings.length]} · ${String(n).padStart(3, '0')}`;
      const level = n === 1 ? 12 : 2 + (rng() % 9),
        xp = 50 * (level - 1) * level + (rng() % (level * 100)),
        gold = 90 + (rng() % 440);
      this.run('INSERT INTO users VALUES (?,?,?,1)', id, `sim:${id}`, name);
      this.run(
        'INSERT INTO characters(id,user_id,kingdom,class,xp,gold,contribution,wins,joined_at,last_active) VALUES (?,?,?,?,?,?,?,?,?,?)',
        id,
        id,
        kingdom,
        n === 1 ? 'rogue' : Object.keys(CLASSES)[n % 3],
        xp,
        gold,
        0,
        0,
        this.now() - (1000 - n) * 600000,
        this.now() - (n % 6 === 0 ? rng() % 600000 : rng() % 86400000),
      );
      const upgrade = n === 1 ? 2 : rng() % 3;
      for (const def of [ITEMS[n % 3], ITEMS[3], ITEMS[4]])
        this.run(
          'INSERT INTO inventory VALUES (?,?,?,?,1)',
          `${id}-${def.id}`,
          id,
          def.id,
          upgrade,
        );
      this.run(
        'INSERT INTO ledger(character_id,delta,balance_after,reason,source_id,created_at) VALUES (?,?,?,?,?,?)',
        id,
        gold,
        gold,
        'synthetic-history',
        'seed-v1',
        this.now(),
      );
    }
    for (const [faction, character] of [
      ['north', 'sim-0002'],
      ['east', 'sim-0221'],
      ['west', 'sim-0421'],
    ])
      this.run(
        'INSERT INTO lords VALUES (?,?,?,?,?,NULL)',
        `seed-lord-${faction}`,
        faction,
        character,
        this.now() - 86400000,
        this.now() + 6 * 86400000,
      );
    // Current-season standings come from real engine-resolved synthetic history,
    // rather than decorative points unsupported by battle records.
    this.run(
      "UPDATE seasons SET starts_at=?,ends_at=? WHERE status='active'",
      this.now() - 3 * 86400000,
      this.now() + 4 * 86400000,
    );
    const originalOffset = this.clockOffset;
    try {
      for (let day = 3; day >= 1; day--) {
        this.clockOffset = originalOffset - day * 86400000;
        const owner = this.get('SELECT owner FROM territories WHERE id=?', 'crossroads')!.owner;
        const attacker: Faction =
          day === 3 ? 'east' : day === 2 ? (owner === 'north' ? 'east' : 'north') : 'west';
        const id = this.createChapter(attacker, 'crossroads', 60, 20261026 + day);
        this.simulatePledges();
        this.clockOffset += 61000;
        this.settleChapter(id);
      }
    } finally {
      this.clockOffset = originalOffset;
    }
    this.event(
      'realm',
      'The realm awakens',
      '600 clearly simulated citizens carry the banners of North, East and West. Your next chapter starts here.',
    );
    this.event(
      'join',
      'New citizens at the gates',
      'The Frostborn welcomed a new company of adventurers.',
      'north',
    );
    this.event(
      'upgrade',
      'A blade, reforged',
      'Mira Stormweaver prepared her equipment for the next campaign.',
      'north',
    );
    this.event(
      'election',
      'The councils are seated',
      'Each kingdom begins with a synthetic founding Lord. New elections are open to eligible citizens.',
    );
    if (scenario === 'season-close')
      this.run('UPDATE seasons SET ends_at=? WHERE status=?', this.now() + 90000, 'active');
    if (scenario === 'border-clash') {
      const owner = this.get('SELECT owner FROM territories WHERE id=?', 'crossroads')!.owner;
      this.createChapter(owner === 'east' ? 'north' : 'east', 'crossroads', 60, 20261026);
      this.simulatePledges();
    }
    if (scenario === 'election') {
      const election = this.openElection('north');
      for (const id of ['sim-0001', 'sim-0002']) this.nominate(id, election);
      this.run(
        "UPDATE elections SET status='voting',nomination_end=? WHERE id=?",
        this.now(),
        election,
      );
      const eligible = this.all(
        'SELECT character_id FROM eligibility WHERE election_id=? ORDER BY character_id LIMIT 35',
        election,
      );
      for (let i = 0; i < eligible.length; i++)
        this.run(
          'INSERT INTO ballots VALUES (?,?,?)',
          election,
          eligible[i].character_id,
          i % 3 ? 'sim-0001' : 'sim-0002',
        );
    }
  }
  reset(scenario = 'baseline') {
    if (this.mode !== 'simulation')
      throw new RuleError('Live worlds cannot be reset.', 'MODE_ISOLATION', 403);
    this.db.exec('PRAGMA foreign_keys=OFF');
    try {
      this.atomic(() => {
        for (const { name } of this.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='environment'",
        ))
          this.db.exec(`DELETE FROM "${String(name).replaceAll('"', '""')}"`);
        this.db.exec('DELETE FROM sqlite_sequence');
        this.clockOffset = 0;
        this.run('UPDATE environment SET generation=? WHERE id=1', randomUUID());
        for (const f of Object.keys(FACTIONS)) this.run('INSERT INTO kingdoms(id) VALUES (?)', f);
        for (const t of TERRITORIES)
          this.run('INSERT INTO territories(id,owner) VALUES (?,?)', t.id, t.owner);
        this.run(
          'INSERT INTO seasons VALUES (?,?,?,?,?)',
          randomUUID(),
          1,
          this.now(),
          this.now() + WEEK,
          'active',
        );
        this.set('realm', 'The Everfall Realm');
        this.set('config', {
          quiet: false,
          autoChapters: false,
          chatOutput: false,
          aiEnabled: false,
          tone: 'heroic',
        });
        this.populate(scenario);
        this.syncGrowth();
        this.ensureChallenges();
        this.seedSupporters();
      });
    } finally {
      this.db.exec('PRAGMA foreign_keys=ON');
    }
  }
  character(id: string, includeGear = true): Character {
    const row = this.get(
      'SELECT c.*,u.name,u.synthetic FROM characters c JOIN users u ON u.id=c.user_id WHERE c.id=?',
      id,
    );
    if (!row) throw new RuleError('Character not found. Join a kingdom first.', 'NOT_FOUND', 404);
    const gear: Gear[] = this.all(
      'SELECT * FROM inventory WHERE character_id=? ORDER BY definition',
      id,
    ).map((g) => {
      const def = ITEMS.find((i) => i.id === g.definition)!;
      return {
        id: g.id,
        definition: g.definition,
        name: def.name,
        slot: def.slot,
        upgrade: g.upgrade,
        equipped: !!g.equipped,
        icon: def.icon,
        cost: 30 * (g.upgrade + 1) ** 2,
        bonus:
          def.slot === 'weapon'
            ? `+${def.attack + g.upgrade * 2} Attack`
            : def.slot === 'armor'
              ? `+${def.defense + g.upgrade * 2} Defense`
              : `+${def.health + g.upgrade * 5} Health`,
      };
    });
    return {
      id: row.id,
      name: row.name,
      kingdom: row.kingdom,
      class: row.class,
      xp: row.xp,
      gold: row.gold,
      ...progress(row.xp),
      contribution: row.contribution,
      wins: row.wins,
      synthetic: !!row.synthetic,
      supporter: this.supporterFor(row.id),
      isLord: !!this.get(
        'SELECT 1 FROM lords WHERE character_id=? AND ends_at>?',
        row.id,
        this.now(),
      ),
      stats: statsFor(
        row.class,
        row.xp,
        gear.filter((g) => g.equipped),
      ),
      ...(includeGear ? { gear } : {}),
      joinedAt: row.joined_at,
      lastActive: row.last_active,
    };
  }
  seedSupporters() {
    if (this.mode !== 'simulation') return;
    for (const c of this.all('SELECT id FROM characters')) {
      const n = Number(c.id.replace('sim-', ''));
      const tier =
        n === 1 || n % 20 === 0 ? 3 : n === 2 || n % 8 === 0 ? 2 : n === 3 || n % 3 === 0 ? 1 : 0;
      this.run(
        "INSERT OR IGNORE INTO supporter_status VALUES (?,'simulation',?,0,?,'simulation')",
        c.id,
        tier,
        this.now(),
      );
    }
  }
  supporterFor(id: string): SupporterStatus {
    const row = this.get('SELECT * FROM supporter_status WHERE character_id=?', id);
    if (this.mode === 'simulation') {
      const tier = (row?.tier ?? 0) as SupporterTier;
      return {
        tier,
        title: SUPPORTER_RANKS[tier].title,
        source: 'simulation',
        verifiedAt: row?.verified_at ?? null,
        gifted: !!row?.gifted,
      };
    }
    const fresh =
      row?.source === 'twitch' &&
      row.broadcaster_id === this.setting('supporterChannel') &&
      this.integration().subscriptions &&
      this.now() - row.verified_at <= 1800000 &&
      this.now() >= row.verified_at;
    const tier = fresh ? (row.tier as SupporterTier) : null;
    return {
      tier,
      title: tier === null ? 'Citizen' : SUPPORTER_RANKS[tier].title,
      source: fresh ? 'twitch' : 'unavailable',
      verifiedAt: row?.verified_at ?? null,
      gifted: fresh && !!row.gifted,
    };
  }
  setSimulationSupporter(id: string, tier: SupporterTier) {
    if (this.mode !== 'simulation')
      throw new RuleError('Supporter previews are Simulation only.', 'MODE_ISOLATION', 403);
    if (!Number.isInteger(tier) || tier < 0 || tier > 3)
      throw new RuleError('Choose a valid supporter tier.');
    return this.atomic(() => {
      const c = this.character(id, false);
      this.run(
        "INSERT INTO supporter_status VALUES (?,'simulation',?,0,?,'simulation') ON CONFLICT(character_id) DO UPDATE SET tier=excluded.tier,verified_at=excluded.verified_at",
        id,
        tier,
        this.now(),
      );
      if (c.supporter?.tier !== tier)
        this.event(
          'supporter',
          `${c.name} · ${SUPPORTER_RANKS[tier].title}`,
          `Simulated supporter rank preview. ${SUPPORTER_RANKS[tier].banner} is a cosmetic banner; combat and votes remain equal.`,
          c.kingdom,
        );
    });
  }
  listCharacters(search = '', kingdom = '', page = 0) {
    const filter = kingdom && Object.hasOwn(FACTIONS, kingdom) ? kingdom : '';
    const where = "WHERE (?='' OR c.kingdom=?) AND (u.name LIKE ? ESCAPE '\\')";
    const pattern = `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const count = this.get(
      `SELECT COUNT(*) n FROM characters c JOIN users u ON u.id=c.user_id ${where}`,
      filter,
      filter,
      pattern,
    )!.n;
    const rows = this.all(
      `SELECT c.id FROM characters c JOIN users u ON u.id=c.user_id ${where} ORDER BY c.contribution DESC,c.id LIMIT 24 OFFSET ?`,
      filter,
      filter,
      pattern,
      page * 24,
    );
    return {
      items: rows.map((r) => this.character(r.id, false)),
      total: count,
      page,
      pages: Math.ceil(count / 24),
    };
  }
  reward(id: string, source: string, kind: string, xp: number, gold: number) {
    if (
      this.get(
        'SELECT 1 FROM rewards WHERE character_id=? AND source_id=? AND kind=?',
        id,
        source,
        kind,
      )
    )
      return;
    const used = this.get(
      'SELECT COALESCE(SUM(xp),0) xp,COALESCE(SUM(gold),0) gold FROM rewards WHERE character_id=? AND session=?',
      id,
      this.day(),
    )!;
    xp = Math.max(0, Math.min(xp, 100 - used.xp));
    gold = Math.max(0, Math.min(gold, 100 - used.gold));
    this.run('INSERT INTO rewards VALUES (?,?,?,?,?,?)', id, source, kind, this.day(), xp, gold);
    this.run(
      'UPDATE characters SET xp=xp+?,gold=gold+?,version=version+1 WHERE id=?',
      xp,
      gold,
      id,
    );
    if (gold)
      this.run(
        'INSERT INTO ledger(character_id,delta,balance_after,reason,source_id,created_at) VALUES (?,?,?,?,?,?)',
        id,
        gold,
        this.get('SELECT gold FROM characters WHERE id=?', id)!.gold,
        kind,
        source,
        this.now(),
      );
  }
  join(subject: string, name: string, kingdom: Faction): string {
    if (!Object.hasOwn(FACTIONS, kingdom)) throw new RuleError('Choose north, east or west.');
    const user = this.get('SELECT * FROM users WHERE subject=?', subject);
    if (user) {
      this.run('UPDATE users SET name=? WHERE id=?', name, user.id);
      const c = this.get('SELECT * FROM characters WHERE user_id=?', user.id)!;
      if (c.kingdom !== kingdom) {
        if (this.now() - c.last_switch < 86400000)
          throw new RuleError('Kingdom changes have a 24-hour cooldown.');
        if (
          this.get(
            "SELECT 1 FROM participants p JOIN chapters ch ON ch.id=p.chapter_id WHERE p.character_id=? AND ch.status IN('open','paused')",
            c.id,
          ) ||
          this.get(
            "SELECT 1 FROM eligibility e JOIN elections el ON el.id=e.election_id WHERE e.character_id=? AND el.status!='closed'",
            c.id,
          )
        )
          throw new RuleError('Finish your current chapter or election before switching.');
        this.run(
          'UPDATE characters SET kingdom=?,last_switch=?,version=version+1 WHERE id=?',
          kingdom,
          this.now(),
          c.id,
        );
        if (
          this.run(
            'UPDATE lords SET ends_at=?,reason=? WHERE character_id=? AND ends_at>?',
            this.now(),
            'Changed kingdom',
            c.id,
            this.now(),
          ).changes
        )
          this.event(
            'council',
            'A Lord lays down the banner',
            `${name} relinquished leadership when changing kingdoms.`,
            c.kingdom,
          );
        this.event(
          'join',
          `${name} changed banners`,
          `${name} has sworn allegiance to ${FACTIONS[kingdom].name}.`,
          kingdom,
        );
      }
      this.syncGrowth();
      return c.id;
    }
    const id = randomUUID();
    if (this.mode === 'live' && !subject.startsWith('twitch:'))
      throw new RuleError('Live identities must originate from Twitch.', 'MODE_ISOLATION', 403);
    this.run(
      'INSERT INTO users VALUES (?,?,?,?)',
      id,
      subject,
      name,
      this.mode === 'simulation' ? 1 : 0,
    );
    this.run(
      'INSERT INTO characters(id,user_id,kingdom,class,xp,gold,joined_at,last_active) VALUES (?,?,?,?,0,0,?,?)',
      id,
      id,
      kingdom,
      'vanguard',
      this.now(),
      this.now(),
    );
    for (const def of [ITEMS[0], ITEMS[3], ITEMS[4]])
      this.run('INSERT INTO inventory VALUES (?,?,?,?,1)', `${id}-${def.id}`, id, def.id, 0);
    this.event(
      'join',
      `${name} joined ${FACTIONS[kingdom].name}`,
      `A new citizen has arrived. Choose your class, pledge to a chapter, and write your story.`,
      kingdom,
      this.mode === 'live' ? 'twitch' : 'simulated',
    );
    this.syncGrowth();
    this.recordChallenge('join', id, 'new');
    return id;
  }
  command(actor: { subject: string; name: string }, cmd: Command, key: string): CommandResult {
    if (this.mode === 'live' && !actor.subject.startsWith('twitch:'))
      throw new RuleError('Live commands require a verified Twitch identity.', 'FORBIDDEN', 403);
    return this.atomic(() => {
      const receipt = this.get('SELECT result FROM receipts WHERE key=?', key);
      if (receipt) return JSON.parse(receipt.result);
      // Settle expired councils before a late gear/class/join command can affect their frozen inputs.
      this.tick();
      const user = this.get('SELECT id FROM users WHERE subject=?', actor.subject);
      let id = user
        ? this.get('SELECT id FROM characters WHERE user_id=?', user.id)?.id
        : undefined;
      let message = '';
      if (cmd.type === 'join') {
        id = this.join(actor.subject, actor.name, cmd.argument as Faction);
        message = `Welcome to ${FACTIONS[this.character(id, false).kingdom].name}. Try !class rogue, then !pledge.`;
      } else {
        if (!id)
          throw new RuleError('Your story starts with !join north, !join east, or !join west.');
        const c = this.character(id);
        switch (cmd.type) {
          case 'class': {
            if (!Object.hasOwn(CLASSES, cmd.argument ?? ''))
              throw new RuleError('Choose vanguard, ranger or rogue.');
            if (
              this.get(
                "SELECT 1 FROM participants p JOIN chapters ch ON ch.id=p.chapter_id WHERE p.character_id=? AND ch.status IN('open','paused')",
                id,
              )
            )
              throw new RuleError('You cannot change class while pledged.');
            const prior = this.get('SELECT class_session FROM characters WHERE id=?', id)!;
            if (
              prior.class_session === this.day() &&
              this.get("SELECT 1 FROM rewards WHERE character_id=? AND kind='battle'", id)
            )
              throw new RuleError(
                'Class changes are limited to one per campaign day after your first battle.',
              );
            this.run(
              'UPDATE characters SET class=?,class_session=?,version=version+1 WHERE id=?',
              cmd.argument,
              this.day(),
              id,
            );
            message = `Your path is now ${cmd.argument}. Your equipment stays with you.`;
            break;
          }
          case 'pledge': {
            const ch = this.get("SELECT * FROM chapters WHERE status='open'");
            if (!ch || this.now() >= ch.deadline)
              throw new RuleError('No chapter is accepting pledges.');
            if (c.kingdom !== ch.attacker && c.kingdom !== ch.defender)
              throw new RuleError('Your kingdom is not part of this chapter.');
            const inserted = this.run(
              'INSERT OR IGNORE INTO participants VALUES (?,?,?,?)',
              ch.id,
              id,
              c.kingdom,
              this.now(),
            );
            if (inserted.changes) this.recordChallenge('pledge', id, 'pledge');
            message = 'Your pledge is recorded. Choose !vote attack, defend or raid.';
            break;
          }
          case 'vote': {
            if (!TACTICS.includes(cmd.argument as Tactic))
              throw new RuleError('Vote attack, defend or raid.');
            const ch = this.get("SELECT * FROM chapters WHERE status='open'");
            if (!ch || this.now() >= ch.deadline)
              throw new RuleError('The tactic ballot is closed.');
            if (
              !this.get(
                'SELECT 1 FROM participants WHERE chapter_id=? AND character_id=?',
                ch.id,
                id,
              )
            )
              throw new RuleError('Pledge before you vote: !pledge.');
            this.run(
              'INSERT INTO votes VALUES (?,?,?,?) ON CONFLICT(chapter_id,character_id) DO UPDATE SET tactic=excluded.tactic,created_at=excluded.created_at',
              ch.id,
              id,
              cmd.argument,
              this.now(),
            );
            message = `Your ${cmd.argument} ballot is recorded. You can change it before the council closes.`;
            break;
          }
          case 'upgrade':
          case 'equip': {
            const gear = c.gear!.find(
              (g) => g.id === cmd.argument || g.definition === cmd.argument,
            );
            if (!gear) throw new RuleError('That item is not in your inventory.');
            if (cmd.type === 'equip') {
              const sameSlot = ITEMS.filter((i) => i.slot === gear.slot).map((i) => i.id);
              for (const def of sameSlot)
                this.run(
                  'UPDATE inventory SET equipped=0 WHERE character_id=? AND definition=?',
                  id,
                  def,
                );
              this.run('UPDATE inventory SET equipped=1 WHERE id=?', gear.id);
              message = `${gear.name} equipped.`;
            } else {
              if (gear.upgrade >= 5)
                throw new RuleError('This item is already at maximum upgrade.');
              if (c.gold < gear.cost)
                throw new RuleError(`You need ${gear.cost} gold. You have ${c.gold}.`);
              this.run(
                'UPDATE characters SET gold=gold-?,version=version+1 WHERE id=?',
                gear.cost,
                id,
              );
              this.run('UPDATE inventory SET upgrade=upgrade+1 WHERE id=?', gear.id);
              this.run(
                'INSERT INTO ledger(character_id,delta,balance_after,reason,source_id,created_at) VALUES (?,?,?,?,?,?)',
                id,
                -gear.cost,
                c.gold - gear.cost,
                'upgrade',
                key,
                this.now(),
              );
              message = `${gear.name} is now +${gear.upgrade + 1}. ${gear.cost} gold spent.`;
              this.event(
                'upgrade',
                'A new edge for the journey',
                `${c.name} upgraded ${gear.name} to +${gear.upgrade + 1}.`,
                c.kingdom,
              );
              this.recordChallenge('upgrade', id, gear.slot);
            }
            break;
          }
          case 'buy': {
            const def = ITEMS.find((i) => i.id === cmd.argument);
            if (!def) throw new RuleError('Unknown item. Use !shop.');
            if (c.gear!.some((g) => g.definition === def.id))
              throw new RuleError('You already own this item.');
            if (c.gold < def.cost) throw new RuleError(`You need ${def.cost} gold.`);
            this.run('INSERT INTO inventory VALUES (?,?,?,?,0)', `${id}-${def.id}`, id, def.id, 0);
            this.run(
              'UPDATE characters SET gold=gold-?,version=version+1 WHERE id=?',
              def.cost,
              id,
            );
            this.run(
              'INSERT INTO ledger(character_id,delta,balance_after,reason,source_id,created_at) VALUES (?,?,?,?,?,?)',
              id,
              -def.cost,
              c.gold - def.cost,
              'purchase',
              key,
              this.now(),
            );
            message = `${def.name} added to your inventory. Equip it with !equip ${def.id}.`;
            break;
          }
          case 'nominate': {
            const e = this.get(
              "SELECT id FROM elections WHERE kingdom=? AND status='nominating'",
              c.kingdom,
            );
            if (!e) throw new RuleError('No election is accepting nominations.');
            this.nominate(id, e.id);
            message = 'You are now a candidate for Lord.';
            break;
          }
          case 'elect': {
            const e = this.get(
              "SELECT * FROM elections WHERE kingdom=? AND status='voting'",
              c.kingdom,
            );
            if (!e || this.now() >= e.deadline) throw new RuleError('No election ballot is open.');
            if (
              !this.get(
                'SELECT 1 FROM eligibility WHERE election_id=? AND character_id=?',
                e.id,
                id,
              )
            )
              throw new RuleError('You were not eligible when this election opened.');
            const candidates = this.all(
              'SELECT c.id,u.name FROM candidates ca JOIN characters c ON c.id=ca.character_id JOIN users u ON u.id=c.user_id WHERE ca.election_id=?',
              e.id,
            );
            const arg = (cmd.argument ?? '').toLowerCase();
            const candidate = candidates.find(
              (c) => c.id === arg || c.id.slice(-6) === arg || c.name.toLowerCase() === arg,
            );
            if (!candidate) throw new RuleError('Choose one of the listed candidate IDs.');
            this.run(
              'INSERT INTO ballots VALUES (?,?,?) ON CONFLICT(election_id,voter) DO UPDATE SET candidate=excluded.candidate',
              e.id,
              id,
              candidate.id,
            );
            message = `Your ballot for ${candidate.name} is recorded.`;
            break;
          }
        }
      }
      this.run('UPDATE characters SET last_active=? WHERE id=?', this.now(), id);
      this.reward(id, this.day(), 'welcome', 10, 10);
      const result = { message, characterId: id };
      this.run('INSERT INTO receipts VALUES (?,?,?)', key, JSON.stringify(result), this.now());
      return result;
    });
  }
  createChapter(attacker: Faction, target: string, seconds = 60, fixedSeed?: number): string {
    return this.atomic(() => {
      if (!Object.hasOwn(FACTIONS, attacker)) throw new RuleError('Unknown attacker.');
      if (this.get("SELECT 1 FROM chapters WHERE status IN('open','paused')"))
        throw new RuleError('Finish the current chapter first.');
      const t = WORLD_TERRITORIES.find((t) => t.id === target),
        owner = this.get('SELECT * FROM territories WHERE id=?', target);
      if (!t || !owner || t.capital || owner.owner === attacker)
        throw new RuleError('Choose an enemy-held border territory.');
      if (
        !t.neighbors.some(
          (id) => this.get('SELECT owner FROM territories WHERE id=?', id)?.owner === attacker,
        )
      )
        throw new RuleError('Your kingdom must own an adjacent territory.');
      if (owner.last_session === this.day())
        throw new RuleError('This territory has already been contested this campaign day.');
      const id = randomUUID(),
        seed = fixedSeed ?? randomBytes(4).readUInt32LE();
      this.run(
        "INSERT INTO chapters(id,attacker,defender,territory,status,deadline,seed,created_at) VALUES (?,?,?,?,'open',?,?,?)",
        id,
        attacker,
        owner.owner,
        target,
        this.now() + Math.max(30, Math.min(180, seconds)) * 1000,
        seed,
        this.now(),
      );
      this.event(
        'chapter',
        'The banners are called',
        `${FACTIONS[attacker].name} challenges ${FACTIONS[owner.owner as Faction].name} at ${t.name}. Pledge and choose your tactic.`,
        attacker,
      );
      return id;
    });
  }
  chapter(id: string, persona?: string): Chapter {
    const ch = this.get('SELECT * FROM chapters WHERE id=?', id);
    if (!ch) throw new RuleError('Chapter not found.', 'NOT_FOUND', 404);
    const pledged = { north: 0, east: 0, west: 0 };
    for (const r of this.all(
      'SELECT kingdom,COUNT(*) n FROM participants WHERE chapter_id=? GROUP BY kingdom',
      id,
    ))
      pledged[r.kingdom as Faction] = r.n;
    const votes = emptyVotes();
    if (ch.status === 'resolved')
      for (const v of this.all(
        'SELECT p.kingdom,v.tactic,COUNT(*) n FROM votes v JOIN participants p ON p.chapter_id=v.chapter_id AND p.character_id=v.character_id WHERE v.chapter_id=? GROUP BY p.kingdom,v.tactic',
        id,
      ))
        votes[v.kingdom as Faction][v.tactic as Tactic] = v.n;
    return {
      id,
      attacker: ch.attacker,
      defender: ch.defender,
      territory: ch.territory,
      status: ch.status,
      deadline: ch.deadline,
      remaining: ch.remaining,
      createdAt: ch.created_at,
      resolvedAt: ch.resolved_at,
      pledged,
      votes: ch.status === 'resolved' ? votes : null,
      input: ch.input ? JSON.parse(ch.input) : null,
      result: ch.result ? JSON.parse(ch.result) : null,
      myPledge: persona
        ? !!this.get(
            'SELECT 1 FROM participants WHERE chapter_id=? AND character_id=?',
            id,
            persona,
          )
        : false,
      myVote: persona
        ? (this.get('SELECT tactic FROM votes WHERE chapter_id=? AND character_id=?', id, persona)
            ?.tactic ?? null)
        : null,
    };
  }
  controlChapter(id: string, action: 'pause' | 'resume' | 'cancel') {
    return this.atomic(() => {
      const ch = this.get('SELECT * FROM chapters WHERE id=?', id);
      if (!ch) throw new RuleError('Chapter not found.', 'NOT_FOUND', 404);
      if (action === 'pause' && ch.status === 'open' && this.now() < ch.deadline)
        this.run(
          "UPDATE chapters SET status='paused',remaining=? WHERE id=?",
          ch.deadline - this.now(),
          id,
        );
      else if (action === 'resume' && ch.status === 'paused')
        this.run(
          "UPDATE chapters SET status='open',deadline=?,remaining=NULL WHERE id=?",
          this.now() + ch.remaining,
          id,
        );
      else if (action === 'cancel' && ['open', 'paused'].includes(ch.status)) {
        this.run("UPDATE chapters SET status='cancelled',resolved_at=? WHERE id=?", this.now(), id);
        this.event(
          'chapter',
          'The chapter is closed',
          'No battle was fought. No rewards or territory changed.',
        );
      } else throw new RuleError('This chapter cannot perform that action in its current state.');
    });
  }
  settleChapter(id: string) {
    return this.atomic(() => {
      const ch = this.get('SELECT * FROM chapters WHERE id=?', id);
      if (!ch || ch.status !== 'open' || this.now() < ch.deadline) return;
      const allParticipants = this.all(
        'SELECT * FROM participants WHERE chapter_id=? ORDER BY character_id',
        id,
      );
      const sides = [ch.attacker, ch.defender].map((kingdom: Faction) => {
        const pledged = allParticipants.filter((p) => p.kingdom === kingdom);
        const roster = selectRoster(
          pledged.map((p) => {
            const c = this.character(p.character_id);
            return { id: c.id, name: c.name, power: c.stats.power, stats: c.stats };
          }),
          ch.seed,
        );
        const votes = { attack: 0, defend: 0, raid: 0 };
        for (const v of this.all(
          'SELECT v.tactic,COUNT(*) n FROM votes v JOIN participants p ON p.chapter_id=v.chapter_id AND p.character_id=v.character_id WHERE v.chapter_id=? AND p.kingdom=? GROUP BY v.tactic',
          id,
          kingdom,
        ))
          votes[v.tactic as Tactic] = v.n;
        return {
          kingdom,
          tactic: tacticFor(votes),
          roster,
          pledged: pledged.length,
          effective: effectivePower(roster),
          population:
            this.get('SELECT high_water FROM kingdom_growth WHERE kingdom=?', kingdom)
              ?.high_water ?? 0,
          healthBonusBp: growthFor(
            this.get('SELECT high_water FROM kingdom_growth WHERE kingdom=?', kingdom)
              ?.high_water ?? 0,
          ).healthBonusBp,
          maxHealth: growthFor(
            this.get('SELECT high_water FROM kingdom_growth WHERE kingdom=?', kingdom)
              ?.high_water ?? 0,
          ).fortressHealth,
        };
      });
      if (sides.some((s) => !s.roster.length)) {
        this.run("UPDATE chapters SET status='cancelled',resolved_at=? WHERE id=?", this.now(), id);
        this.event(
          'chapter',
          'The banners await more citizens',
          'At least one pledged citizen per side is needed. No rewards or territory changed.',
        );
        return;
      }
      const input: BattleInput = {
        seed: ch.seed,
        ruleset: GROWTH_RULESET,
        attacker: ch.attacker,
        defender: ch.defender,
        territory: ch.territory,
        sides: sides as BattleInput['sides'],
      };
      const result = resolveBattle(input);
      this.run(
        "UPDATE chapters SET status='resolved',input=?,result=?,resolved_at=? WHERE id=?",
        JSON.stringify(input),
        JSON.stringify(result),
        this.now(),
        id,
      );
      this.run(
        'UPDATE territories SET owner=?,last_session=? WHERE id=?',
        result.winner === ch.attacker ? ch.attacker : ch.defender,
        this.day(),
        ch.territory,
      );
      const pairCount = this.get(
        "SELECT COUNT(*) n FROM chapters WHERE status='resolved' AND ((attacker=? AND defender=?) OR (attacker=? AND defender=?)) AND resolved_at>=?",
        ch.attacker,
        ch.defender,
        ch.defender,
        ch.attacker,
        new Date(`${this.day()}T00:00:00Z`).getTime(),
      )!.n;
      if (pairCount <= 3) {
        if (result.winner)
          this.run('UPDATE kingdoms SET points=points+3,wins=wins+1 WHERE id=?', result.winner);
        else
          for (const side of sides)
            this.run('UPDATE kingdoms SET points=points+1 WHERE id=?', side.kingdom);
      }
      for (const p of allParticipants) {
        const rewarded = this.get(
          "SELECT COUNT(*) n FROM rewards WHERE character_id=? AND session=? AND kind='battle'",
          p.character_id,
          this.day(),
        )!.n;
        if (rewarded < 3) {
          const won = result.winner === p.kingdom;
          this.reward(p.character_id, id, 'battle', won ? 30 : 20, won ? 30 : 20);
          this.run(
            'UPDATE characters SET contribution=contribution+?,wins=wins+? WHERE id=?',
            won ? 2 : 1,
            won ? 1 : 0,
            p.character_id,
          );
        }
      }
      const title = result.winner
        ? `${FACTIONS[result.winner].name} prevails`
        : 'An honorable draw';
      const territory = WORLD_TERRITORIES.find((t) => t.id === ch.territory)!.name;
      const body = result.winner
        ? `${FACTIONS[result.winner].name} prevailed at ${territory} with ${sides.find((s) => s.kingdom === result.winner)!.tactic}. ${result.winner === ch.attacker ? 'The territory has a new banner.' : 'The defending banner holds.'}`
        : `The armies drew at ${territory}. Its banner remains unchanged.`;
      this.event('battle', title, body, result.winner);
      return result;
    });
  }
  simulatePledges() {
    if (this.mode !== 'simulation')
      throw new RuleError('Synthetic citizens cannot enter Live.', 'MODE_ISOLATION', 403);
    return this.atomic(() => {
      const ch = this.get("SELECT * FROM chapters WHERE status='open'");
      if (!ch || this.now() >= ch.deadline) throw new RuleError('Open a chapter first.');
      for (const faction of [ch.attacker, ch.defender]) {
        const chars = this.all(
          'SELECT id FROM characters WHERE kingdom=? ORDER BY id LIMIT 38',
          faction,
        );
        for (let i = 0; i < chars.length; i++) {
          const id = chars[i].id;
          const inserted = this.run(
            'INSERT OR IGNORE INTO participants VALUES (?,?,?,?)',
            ch.id,
            id,
            faction,
            this.now(),
          );
          if (inserted.changes) this.recordChallenge('pledge', id, 'pledge');
          this.run(
            'INSERT INTO votes VALUES (?,?,?,?) ON CONFLICT(chapter_id,character_id) DO NOTHING',
            ch.id,
            id,
            TACTICS[(i + (faction === ch.attacker ? 1 : 0)) % 3],
            this.now(),
          );
        }
      }
      this.event(
        'simulation',
        'The council gathers',
        'Synthetic citizens have pledged and cast ballots. Results remain hidden until lock.',
      );
    });
  }
  openElection(kingdom: Faction) {
    return this.atomic(() => {
      if (!Object.hasOwn(FACTIONS, kingdom)) throw new RuleError('Unknown kingdom.');
      if (this.get("SELECT 1 FROM elections WHERE kingdom=? AND status!='closed'", kingdom))
        throw new RuleError('This kingdom already has an election.');
      const id = randomUUID(),
        duration = this.mode === 'simulation' ? 90000 : 300000;
      this.run(
        "INSERT INTO elections(id,kingdom,status,nomination_end,deadline,created_at) VALUES (?,?,'nominating',?,?,?)",
        id,
        kingdom,
        this.now() + 60000,
        this.now() + 60000 + duration,
        this.now(),
      );
      this.run(
        'INSERT INTO eligibility SELECT ?,id FROM characters WHERE kingdom=? AND xp>=100',
        id,
        kingdom,
      );
      this.event(
        'council',
        `A council for ${FACTIONS[kingdom].name}`,
        'Eligible citizens may nominate themselves. Every citizen has one equal ballot.',
        kingdom,
      );
      return id;
    });
  }
  nominate(characterId: string, electionId: string) {
    const e = this.get('SELECT * FROM elections WHERE id=?', electionId);
    if (!e || e.status !== 'nominating' || this.now() >= e.nomination_end)
      throw new RuleError('Nominations are closed.');
    if (
      !this.get(
        'SELECT 1 FROM eligibility WHERE election_id=? AND character_id=?',
        electionId,
        characterId,
      )
    )
      throw new RuleError('You must be level 2 and a member when the election opens.');
    const terms = this.all(
      'SELECT * FROM lords WHERE character_id=? ORDER BY starts_at DESC LIMIT 2',
      characterId,
    );
    if (
      terms.length === 2 &&
      terms[0].ends_at >= this.now() - WEEK &&
      terms[0].starts_at <= terms[1].ends_at + 1000
    )
      throw new RuleError('After two consecutive terms, sit out one term.');
    this.run('INSERT OR IGNORE INTO candidates VALUES (?,?)', electionId, characterId);
  }
  election(id: string): Election {
    const e = this.get('SELECT * FROM elections WHERE id=?', id)!;
    const eligible = this.get('SELECT COUNT(*) n FROM eligibility WHERE election_id=?', id)!.n;
    return {
      id,
      kingdom: e.kingdom,
      status: e.status,
      nominationEnd: e.nomination_end,
      deadline: e.deadline,
      eligible,
      quorum: Math.max(2, Math.ceil(eligible * 0.1)),
      ballots: this.get('SELECT COUNT(*) n FROM ballots WHERE election_id=?', id)!.n,
      winner: e.winner,
      reason: e.reason,
      candidates: this.all(
        'SELECT c.id,u.name,(SELECT COUNT(*) FROM ballots b WHERE b.election_id=? AND b.candidate=c.id) votes FROM candidates ca JOIN characters c ON c.id=ca.character_id JOIN users u ON u.id=c.user_id WHERE ca.election_id=? ORDER BY c.joined_at,c.id',
        id,
        id,
      ).map((c) => ({
        ...c,
        votes: e.status === 'closed' ? c.votes : null,
      })) as Election['candidates'],
    };
  }
  settleElection(id: string) {
    return this.atomic(() => {
      const row = this.get('SELECT * FROM elections WHERE id=?', id);
      if (!row || row.status === 'closed' || this.now() < row.deadline) return;
      const e = this.election(id),
        tally = this.all(
          'SELECT c.id,COUNT(b.voter) votes FROM candidates ca JOIN characters c ON c.id=ca.character_id LEFT JOIN ballots b ON b.candidate=c.id AND b.election_id=ca.election_id WHERE ca.election_id=? GROUP BY c.id ORDER BY votes DESC,c.joined_at,c.id',
          id,
        );
      const winner = e.ballots >= e.quorum && tally.length ? tally[0].id : null;
      const reason = winner
        ? 'Elected by equal citizen ballots.'
        : tally.length
          ? 'The council did not reach quorum.'
          : 'No eligible citizens stood for election.';
      this.run(
        "UPDATE elections SET status='closed',winner=?,reason=? WHERE id=?",
        winner,
        reason,
        id,
      );
      if (winner) {
        this.run(
          'UPDATE lords SET ends_at=?,reason=? WHERE kingdom=? AND ends_at>?',
          this.now(),
          'New election',
          e.kingdom,
          this.now(),
        );
        this.run(
          'INSERT INTO lords VALUES (?,?,?,?,?,NULL)',
          randomUUID(),
          e.kingdom,
          winner,
          this.now(),
          this.now() + WEEK,
        );
      }
      for (const ballot of this.all('SELECT voter FROM ballots WHERE election_id=?', id)) {
        if (
          !this.get(
            "SELECT 1 FROM rewards WHERE character_id=? AND kind='election' AND source_id IN (SELECT id FROM elections WHERE created_at>?)",
            ballot.voter,
            this.now() - WEEK,
          )
        ) {
          this.reward(ballot.voter, id, 'election', 5, 5);
          this.run('UPDATE characters SET contribution=contribution+1 WHERE id=?', ballot.voter);
        }
      }
      this.event(
        'election',
        winner ? 'A new Lord is elected' : 'The council has spoken',
        winner
          ? `${this.character(winner, false).name} was elected Lord of ${FACTIONS[e.kingdom].name}. A seven-day term begins.`
          : reason,
        e.kingdom,
      );
    });
  }
  dismissLord(kingdom: Faction, reason: string) {
    return this.atomic(() => {
      if (!reason.trim()) throw new RuleError('A public reason is required.');
      this.run(
        'UPDATE lords SET ends_at=?,reason=? WHERE kingdom=? AND ends_at>?',
        this.now(),
        reason,
        kingdom,
        this.now(),
      );
      this.event(
        'council',
        'A seat on the council is vacant',
        `The streamer dismissed the Lord of ${FACTIONS[kingdom].name}: ${reason}`,
        kingdom,
        'streamer',
      );
    });
  }
  tick() {
    if ((this.get('SELECT MAX(expires_at) n FROM challenges')?.n ?? Infinity) <= this.now())
      this.atomic(() => this.ensureChallenges());
    const activeSeason = this.get("SELECT * FROM seasons WHERE status='active'")!;
    if (this.now() >= activeSeason.ends_at) this.rollSeason();
    for (const ch of this.all(
      "SELECT id FROM chapters WHERE status='open' AND deadline<=?",
      this.now(),
    ))
      this.settleChapter(ch.id);
    for (const e of this.all(
      "SELECT id FROM elections WHERE status='nominating' AND nomination_end<=?",
      this.now(),
    ))
      this.atomic(() => this.run("UPDATE elections SET status='voting' WHERE id=?", e.id));
    for (const e of this.all(
      "SELECT id FROM elections WHERE status!='closed' AND deadline<=?",
      this.now(),
    ))
      this.settleElection(e.id);
    const config = this.settings();
    if (
      config.autoChapters &&
      !config.quiet &&
      !this.get("SELECT 1 FROM chapters WHERE status IN('open','paused')") &&
      this.now() - Number(this.setting('lastAutoChapter') ?? this.now()) >= 1800000
    ) {
      this.atomic(() => {
        this.set('lastAutoChapter', this.now());
        for (const f of Object.keys(FACTIONS) as Faction[]) {
          const target = WORLD_TERRITORIES.find(
            (t) =>
              !t.capital &&
              !!this.get('SELECT 1 FROM territories WHERE id=?', t.id) &&
              this.get('SELECT owner,last_session FROM territories WHERE id=?', t.id)?.owner !==
                f &&
              this.get('SELECT last_session FROM territories WHERE id=?', t.id)?.last_session !==
                this.day() &&
              t.neighbors.some(
                (id) => this.get('SELECT owner FROM territories WHERE id=?', id)?.owner === f,
              ),
          );
          if (target) {
            this.createChapter(f, target.id);
            break;
          }
        }
      });
    }
  }
  advance(seconds: number) {
    if (this.mode !== 'simulation')
      throw new RuleError('Live time cannot be changed.', 'MODE_ISOLATION', 403);
    this.atomic(() => {
      this.clockOffset += seconds * 1000;
      this.set('clockOffset', String(this.clockOffset));
    });
    this.tick();
  }
  rollSeason() {
    return this.atomic(() => {
      const s = this.get("SELECT * FROM seasons WHERE status='active'")!;
      if (this.now() < s.ends_at) return;
      for (const chapter of this.all(
        "SELECT id FROM chapters WHERE status='open' AND deadline<=?",
        s.ends_at,
      ))
        this.settleChapter(chapter.id);
      for (const f of Object.keys(FACTIONS))
        this.run(
          'UPDATE kingdoms SET points=points+? WHERE id=?',
          2 *
            this.get(
              "SELECT COUNT(*) n FROM territories WHERE owner=? AND id NOT IN('northhold','eastkeep','westspire')",
              f,
            )!.n,
          f,
        );
      let rank = 0,
        place = 0,
        previousScore: number | undefined,
        previousWins: number | undefined;
      for (const f of this.all('SELECT * FROM kingdoms ORDER BY points DESC,wins DESC,id')) {
        place++;
        if (f.points !== previousScore || f.wins !== previousWins) rank = place;
        previousScore = f.points;
        previousWins = f.wins;
        this.run(
          'INSERT INTO season_awards VALUES (?,?,?,?,?)',
          s.id,
          'kingdom',
          f.id,
          f.points,
          rank,
        );
      }
      rank = 0;
      place = 0;
      previousScore = undefined;
      for (const c of this.all(
        'SELECT id,contribution FROM characters ORDER BY contribution DESC,id',
      )) {
        place++;
        if (c.contribution !== previousScore) rank = place;
        previousScore = c.contribution;
        this.run(
          'INSERT INTO season_awards VALUES (?,?,?,?,?)',
          s.id,
          'citizen',
          c.id,
          c.contribution,
          rank,
        );
      }
      this.run("UPDATE seasons SET status='closed' WHERE id=?", s.id);
      this.run(
        "UPDATE chapters SET status='cancelled',resolved_at=? WHERE status IN('open','paused')",
        this.now(),
      );
      this.run('UPDATE kingdoms SET points=0,wins=0');
      this.run('UPDATE characters SET contribution=0,wins=0');
      for (const t of WORLD_TERRITORIES)
        this.run('UPDATE territories SET owner=?,last_session=NULL WHERE id=?', t.owner, t.id);
      this.run(
        'INSERT INTO seasons VALUES (?,?,?,?,?)',
        randomUUID(),
        s.number + 1,
        this.now(),
        this.now() + WEEK,
        'active',
      );
      this.event(
        'season',
        `A new age begins · Season ${s.number + 1}`,
        'The banners return to their borders. Your character, equipment and lifetime XP remain.',
      );
    });
  }
  syncGrowth() {
    for (const kingdom of Object.keys(FACTIONS) as Faction[]) {
      const count = this.get('SELECT COUNT(*) n FROM characters WHERE kingdom=?', kingdom)!.n;
      this.run(
        'INSERT INTO kingdom_growth VALUES (?,?) ON CONFLICT(kingdom) DO UPDATE SET high_water=MAX(high_water,excluded.high_water)',
        kingdom,
        count,
      );
      const peak = this.get(
        'SELECT high_water FROM kingdom_growth WHERE kingdom=?',
        kingdom,
      )!.high_water;
      for (const t of WORLD_TERRITORIES.filter(
        (t) => t.home === kingdom && t.unlockAt && peak >= t.unlockAt,
      )) {
        if (
          this.run('INSERT OR IGNORE INTO territories(id,owner) VALUES (?,?)', t.id, kingdom)
            .changes
        )
          this.event(
            'expansion',
            t.name + ' discovered',
            FACTIONS[kingdom].name +
              ' has opened a new frontier. Community growth strengthens its fortress.',
            kingdom,
          );
      }
    }
  }
  ensureChallenges() {
    if ((this.get('SELECT MAX(expires_at) n FROM challenges')?.n ?? 0) > this.now()) return;
    this.run(
      "UPDATE challenges SET status='expired' WHERE status='open' AND expires_at<=?",
      this.now(),
    );
    for (const race of RACES)
      this.run(
        'INSERT INTO challenges(id,template,opened_at,expires_at) VALUES (?,?,?,?)',
        randomUUID(),
        race.id,
        this.now(),
        this.now() + 86400000,
      );
  }
  recordChallenge(metric: string, characterId: string, milestone: string) {
    const character = this.character(characterId, false);
    for (const race of RACES.filter((r) => r.metric === metric)) {
      for (const row of this.all(
        "SELECT * FROM challenges WHERE template=? AND status='open' AND expires_at>?",
        race.id,
        this.now(),
      )) {
        const entity = race.scope === 'kingdom' ? character.kingdom : characterId;
        const inserted = this.run(
          'INSERT OR IGNORE INTO challenge_contributions VALUES (?,?,?,?)',
          row.id,
          characterId,
          milestone,
          character.kingdom,
        );
        if (!inserted.changes) continue;
        this.run(
          'INSERT INTO challenge_progress VALUES (?,?,1) ON CONFLICT(challenge_id,entity_id) DO UPDATE SET score=score+1',
          row.id,
          entity,
        );
        if (
          this.get(
            'SELECT score FROM challenge_progress WHERE challenge_id=? AND entity_id=?',
            row.id,
            entity,
          )!.score < race.target
        )
          continue;
        if (
          !this.run(
            "UPDATE challenges SET status='completed',winner_id=?,completed_at=? WHERE id=? AND status='open'",
            entity,
            this.now(),
            row.id,
          ).changes
        )
          continue;
        const recipients =
          race.scope === 'citizen'
            ? [{ character_id: characterId }]
            : this.all(
                'SELECT DISTINCT character_id FROM challenge_contributions WHERE challenge_id=? AND kingdom=?',
                row.id,
                character.kingdom,
              );
        for (const recipient of recipients)
          this.reward(recipient.character_id, row.id, 'challenge', race.xp, race.gold);
        this.event(
          'challenge',
          race.title + ' won',
          (race.scope === 'kingdom' ? FACTIONS[character.kingdom].name : character.name) +
            ' claimed first place. Contributor rewards have been recorded.',
          character.kingdom,
        );
      }
    }
  }
  challengeSnapshots(): RealmChallenge[] {
    const name = (id: string) =>
      Object.hasOwn(FACTIONS, id)
        ? FACTIONS[id as Faction].name
        : (this.get(
            'SELECT u.name FROM users u JOIN characters c ON c.user_id=u.id WHERE c.id=?',
            id,
          )?.name ?? 'Unknown citizen');
    return this.all('SELECT * FROM challenges ORDER BY opened_at DESC,template LIMIT 12').map(
      (row) => {
        const race = RACES.find((r) => r.id === row.template)!;
        return {
          ...race,
          id: row.id,
          status: row.status === 'open' && this.now() >= row.expires_at ? 'expired' : row.status,
          winner: row.winner_id ? name(row.winner_id) : null,
          openedAt: row.opened_at,
          expiresAt: row.expires_at,
          leaders: this.all(
            'SELECT entity_id,score FROM challenge_progress WHERE challenge_id=? ORDER BY score DESC,entity_id LIMIT 5',
            row.id,
          ).map((p) => ({ id: p.entity_id, name: name(p.entity_id), score: p.score })),
        };
      },
    );
  }
  snapshot(persona?: string): WorldSnapshot {
    const env = this.get('SELECT * FROM environment WHERE id=1')!,
      season = this.get("SELECT * FROM seasons WHERE status='active'")!;
    const active =
      this.get(
        "SELECT id FROM chapters WHERE status IN('open','paused') ORDER BY created_at DESC LIMIT 1",
      ) ?? this.get('SELECT id FROM chapters ORDER BY created_at DESC LIMIT 1');
    const territories = WORLD_TERRITORIES.filter((t) =>
      this.get('SELECT 1 FROM territories WHERE id=?', t.id),
    ).map((t) => {
      const row = this.get('SELECT owner,last_session FROM territories WHERE id=?', t.id)!;
      return { ...t, owner: row.owner, contestedToday: row.last_session === this.day() };
    });
    return {
      worldVersion: 2,
      challenges: this.challengeSnapshots(),
      mode: this.mode,
      generation: env.generation,
      revision: this.get('SELECT COALESCE(MAX(id),0) n FROM events')!.n,
      now: this.now(),
      realm: this.setting('realm')!,
      citizens: this.get('SELECT COUNT(*) n FROM characters')!.n,
      active: this.get(
        'SELECT COUNT(*) n FROM characters WHERE last_active>?',
        this.now() - 900000,
      )!.n,
      kingdoms: (Object.keys(FACTIONS) as Faction[]).map((id) => {
        const score = this.get('SELECT * FROM kingdoms WHERE id=?', id)!,
          lord = this.get(
            'SELECT l.character_id,u.name FROM lords l JOIN characters c ON c.id=l.character_id JOIN users u ON u.id=c.user_id WHERE l.kingdom=? AND l.ends_at>? ORDER BY l.starts_at DESC LIMIT 1',
            id,
            this.now(),
          );
        return {
          id,
          ...FACTIONS[id],
          ...growthFor(
            this.get('SELECT high_water FROM kingdom_growth WHERE kingdom=?', id)?.high_water ?? 0,
          ),
          citizens: this.get('SELECT COUNT(*) n FROM characters WHERE kingdom=?', id)!.n,
          territories: territories.filter((t) => t.owner === id).length,
          lord: lord?.name ?? null,
          lordId: lord?.character_id ?? null,
          points: score.points,
          wins: score.wins,
        };
      }),
      territories,
      chapter: active ? this.chapter(active.id, persona) : null,
      battles: this.all(
        "SELECT id FROM chapters WHERE status IN('resolved','cancelled') ORDER BY created_at DESC LIMIT 12",
      ).map((ch) => this.chapter(ch.id)),
      events: this.all('SELECT * FROM events ORDER BY id DESC LIMIT 50').map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        body: e.body,
        source: e.source,
        kingdom: e.kingdom,
        createdAt: e.created_at,
        narrativeSource: e.narrative_source,
      })),
      elections: this.all('SELECT id FROM elections ORDER BY created_at DESC LIMIT 12').map((e) =>
        this.election(e.id),
      ),
      heroes: this.all('SELECT id FROM characters ORDER BY contribution DESC,id LIMIT 6').map((c) =>
        this.character(c.id, false),
      ),
      season: {
        id: season.id,
        number: season.number,
        startsAt: season.starts_at,
        endsAt: season.ends_at,
        status: season.status,
      },
      settings: this.settings(),
      integration: this.integration(),
      steward: {
        configured: !!process.env.STEWARD_ENDPOINT && !!process.env.STEWARD_API_KEY,
        used: Number(this.setting(`ai:${this.day()}`) ?? 0),
        limit: 60,
        status: this.setting('aiStatus') ?? 'Template narration ready',
      },
    };
  }
  eventsAfter(id: number): WorldEvent[] {
    return this.all('SELECT * FROM events WHERE id>? ORDER BY id LIMIT 100', id).map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      body: e.body,
      source: e.source,
      kingdom: e.kingdom,
      createdAt: e.created_at,
      narrativeSource: e.narrative_source,
    }));
  }
  close() {
    this.db.close();
    this.removeAllListeners();
  }
}
