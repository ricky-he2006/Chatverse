import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { RuleError } from './engine';
import { REALMS, realmIdentity } from '../shared/realms';
import type { Mode } from '../shared/types';
import type { GameTask, TaskProof, TaskStanding, WorldTasksState } from '../shared/world-tasks';
const proofFields =
  'id,task_id,realm,subject,generation,name,note,received_at,status,reason,mime,role';
function imageSize(bytes: Buffer, png: boolean): [number, number] {
  if (png) {
    if (bytes.length < 33 || bytes.toString('ascii', 12, 16) !== 'IHDR')
      throw new RuleError('Invalid PNG screenshot.');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  let p = 2;
  while (p + 4 < bytes.length) {
    if (bytes[p++] !== 255) break;
    while (bytes[p] === 255) p++;
    const marker = bytes[p++];
    if (marker === 217 || marker === 218) break;
    if (p + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(p);
    if (length < 2 || p + length > bytes.length) break;
    if (
      [192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) &&
      length >= 8
    )
      return [bytes.readUInt16BE(p + 5), bytes.readUInt16BE(p + 3)];
    p += length;
  }
  throw new RuleError('Invalid JPEG screenshot.');
}

export class WorldTasks {
  private databases: Record<Mode, DatabaseSync>;
  constructor(
    directory?: string,
    private clock = Date.now,
    private liveName = () => 'Authorized Twitch community',
    private liveChannel = () => '',
  ) {
    this.databases = {
      simulation: new DatabaseSync(
        directory ? join(directory, 'world-tasks-simulation.sqlite') : ':memory:',
      ),
      live: new DatabaseSync(directory ? join(directory, 'world-tasks-live.sqlite') : ':memory:'),
    };
    for (const [mode, db] of Object.entries(this.databases)) {
      db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,game TEXT NOT NULL,title TEXT NOT NULL,objective TEXT NOT NULL,unit TEXT NOT NULL,target INTEGER NOT NULL,opens_at INTEGER NOT NULL,deadline INTEGER NOT NULL,review_deadline INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',rewards TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS proofs(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),realm TEXT NOT NULL,subject TEXT NOT NULL,generation TEXT NOT NULL,name TEXT NOT NULL,note TEXT NOT NULL,received_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reason TEXT,reviewed_at INTEGER,mime TEXT NOT NULL,hash TEXT NOT NULL,bytes BLOB NOT NULL,UNIQUE(task_id,subject,realm),UNIQUE(task_id,hash));
    CREATE TABLE IF NOT EXISTS awards(task_id TEXT NOT NULL REFERENCES tasks(id),realm TEXT NOT NULL,place INTEGER NOT NULL,points INTEGER NOT NULL,finished_at INTEGER NOT NULL,PRIMARY KEY(task_id,realm));
    CREATE INDEX IF NOT EXISTS proof_review ON proofs(task_id,status,received_at);`);
      db.exec(
        `CREATE TABLE IF NOT EXISTS proof_hashes(task_id TEXT NOT NULL,hash TEXT NOT NULL,proof_id TEXT NOT NULL,PRIMARY KEY(task_id,hash));CREATE TABLE IF NOT EXISTS proof_reviews(id INTEGER PRIMARY KEY AUTOINCREMENT,proof_id TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT NOT NULL,reviewed_at INTEGER NOT NULL,hash TEXT NOT NULL);`,
      );
      for (const [table, columns] of Object.entries({
        tasks: [
          ['require_streamer', 'INTEGER NOT NULL DEFAULT 0'],
          ['channel', "TEXT NOT NULL DEFAULT ''"],
          ['community_name', "TEXT NOT NULL DEFAULT ''"],
        ],
        proofs: [['role', "TEXT NOT NULL DEFAULT 'member'"]],
      })) {
        const names = (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name);
        for (const [name, definition] of columns)
          if (!names.includes(name))
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
      db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS one_streamer_entry ON proofs(task_id,realm) WHERE role='streamer'",
      );
      if (
        mode === 'simulation' &&
        !Number((db.prepare('SELECT COUNT(*) n FROM tasks').get() as any).n)
      ) {
        this.create('simulation', {
          game: 'VALORANT',
          title: 'First victories of the Reaches',
          objective:
            'Win a match and submit a scoreboard screenshot showing your game name and the victory. Each distinct approved member counts once.',
          unit: 'members',
          target: 10,
          hours: 24,
        });
        this.create('simulation', {
          game: 'Fortnite',
          title: 'Community survival race',
          objective:
            'Finish a match in the top 10 and submit a placement screenshot showing your game name. Each distinct approved member counts once.',
          unit: 'members',
          target: 10,
          hours: 24,
        });
      }
    }
  }
  private db(mode: Mode) {
    return this.databases[mode];
  }
  now(mode: Mode) {
    return (
      this.clock() +
      Number(
        (this.db(mode).prepare("SELECT value FROM meta WHERE key='offset'").get() as any)?.value ??
          0,
      )
    );
  }
  advanceSimulation(hours: number) {
    if (!Number.isInteger(hours) || hours < 1 || hours > 72)
      throw new RuleError('Advance by 1–72 hours.');
    this.db('simulation')
      .prepare(
        "INSERT INTO meta VALUES ('offset',?) ON CONFLICT(key) DO UPDATE SET value=value+excluded.value",
      )
      .run(hours * 3600000);
    return { now: this.now('simulation') };
  }
  private atomic<T>(mode: Mode, fn: () => T) {
    const db = this.db(mode);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  private task(mode: Mode, id: string): GameTask {
    const t = this.db(mode).prepare('SELECT * FROM tasks WHERE id=?').get(id) as any;
    if (!t) throw new RuleError('Competition not found.', 'NOT_FOUND', 404);
    if (mode === 'live' && (!t.channel || t.channel !== this.liveChannel()))
      throw new RuleError(
        'This competition belongs to another authorized channel.',
        'NOT_FOUND',
        404,
      );
    return {
      id: t.id,
      game: t.game,
      title: t.title,
      objective: t.objective,
      unit: t.unit,
      target: t.target,
      requireStreamer: !!t.require_streamer,
      channel: t.channel,
      communityName: t.community_name,
      opensAt: t.opens_at,
      deadline: t.deadline,
      reviewDeadline: t.review_deadline,
      status: t.status,
      rewards: JSON.parse(t.rewards),
    };
  }
  create(
    mode: Mode,
    input: {
      game: string;
      title: string;
      objective: string;
      unit: 'members' | 'teams' | 'single';
      target: number;
      hours: number;
      requireStreamer?: boolean;
    },
  ) {
    if (
      !input.game.trim() ||
      !input.title.trim() ||
      !input.objective.trim() ||
      !['members', 'teams', 'single'].includes(input.unit) ||
      !Number.isInteger(input.target) ||
      input.target < 1 ||
      input.target > 100 ||
      !Number.isInteger(input.hours) ||
      input.hours < 1 ||
      input.hours > 168
    )
      throw new RuleError(
        'Choose a game, objective, target from 1–100 and duration from 1–168 hours.',
      );
    if (mode === 'live' && !this.liveChannel())
      throw new RuleError(
        'Connect the streamer channel before publishing a Live competition.',
        'REALM_OFFLINE',
        503,
      );
    const id = randomUUID(),
      now = this.now(mode),
      deadline = now + input.hours * 3600000;
    this.db(mode)
      .prepare(
        'INSERT INTO tasks(id,game,title,objective,unit,target,opens_at,deadline,review_deadline,status,rewards,require_streamer,channel,community_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        input.game.trim(),
        input.title.trim(),
        input.objective.trim(),
        input.unit,
        input.unit === 'single' ? 1 : input.target,
        now,
        deadline,
        deadline + 86400000,
        'open',
        JSON.stringify([100, 75, 50, 25]),
        input.requireStreamer === false ? 0 : 1,
        mode === 'live' ? this.liveChannel() : '',
        mode === 'live' ? this.liveName() : '',
      );
    return { id };
  }
  private proof(row: any): TaskProof {
    return {
      id: row.id,
      taskId: row.task_id,
      realm: row.realm,
      name: row.name,
      note: row.note,
      receivedAt: row.received_at,
      status: row.status,
      reason: row.reason,
      mime: row.mime,
      role: row.role,
    };
  }
  submit(
    mode: Mode,
    taskId: string,
    actor: {
      realm: string;
      subject: string;
      generation: string;
      name: string;
      role?: 'member' | 'streamer';
      channel?: string | null;
    },
    note: string,
    encoded: string,
  ) {
    return this.atomic(mode, () => {
      const task = this.task(mode, taskId),
        now = this.now(mode);
      if (mode === 'live' && actor.channel !== task.channel)
        throw new RuleError(
          'This identity belongs to another authorized community.',
          'FORBIDDEN',
          403,
        );
      if (
        actor.role === 'streamer' &&
        actor.subject !== (mode === 'live' ? 'twitch:' + task.channel : 'streamer:' + actor.realm)
      )
        throw new RuleError(
          'Streamer completion must use the authorized broadcaster identity.',
          'FORBIDDEN',
          403,
        );
      if (task.status !== 'open' || now < task.opensAt || now >= task.deadline)
        throw new RuleError('This competition is not accepting submissions.');
      if ((mode === 'live' && actor.realm !== 'home') || !REALMS.some((r) => r.id === actor.realm))
        throw new RuleError('This community cannot enter this competition.', 'FORBIDDEN', 403);
      if (
        note.trim().length < 5 ||
        note.length > 1000 ||
        encoded.length > 7000000 ||
        !encoded ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
      )
        throw new RuleError('Add a short explanation and a PNG/JPEG screenshot under 5 MB.');
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.length > 5 * 1024 * 1024 || bytes.length < 24)
        throw new RuleError('Use a PNG/JPEG screenshot under 5 MB.');
      const png = bytes.toString('hex', 0, 8) === '89504e470d0a1a0a',
        jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!png && !jpeg) throw new RuleError('Only PNG and JPEG screenshots are supported.');
      {
        const [w, h] = imageSize(bytes, png);
        if (w < 320 || h < 180 || w * h > 30000000)
          throw new RuleError(
            'Use a readable screenshot at least 320×180 and at most 30 megapixels.',
          );
      }
      const hash = createHash('sha256').update(bytes).digest('hex'),
        db = this.db(mode);
      const existing = db
        .prepare(
          'SELECT id,status,length(bytes) size FROM proofs WHERE task_id=? AND realm=? AND subject=?',
        )
        .get(taskId, actor.realm, actor.subject) as any;
      if (existing && existing.status !== 'rejected')
        throw new RuleError(
          'You already submitted evidence for this competition.',
          'DUPLICATE',
          409,
        );
      if (db.prepare('SELECT 1 FROM proof_hashes WHERE task_id=? AND hash=?').get(taskId, hash))
        throw new RuleError(
          'This screenshot has already been submitted to this competition.',
          'DUPLICATE',
          409,
        );
      const total = Number(
        (db.prepare('SELECT COALESCE(SUM(length(bytes)),0) n FROM proofs').get() as any).n,
      );
      if (total - (existing?.size ?? 0) + bytes.length > 200 * 1024 * 1024)
        throw new RuleError(
          'Local proof storage is full. Ask the owner to review the installation.',
          'STORAGE_LIMIT',
          413,
        );
      const id = existing?.id ?? randomUUID();
      const role = actor.role ?? 'member';
      if (role === 'streamer') {
        const old = db
          .prepare("SELECT id FROM proofs WHERE task_id=? AND realm=? AND role='streamer'")
          .get(taskId, actor.realm) as any;
        if (old && old.id !== id)
          throw new RuleError(
            'This community already has streamer evidence for this competition.',
            'DUPLICATE',
            409,
          );
      }
      if (existing)
        db.prepare(
          "UPDATE proofs SET generation=?,name=?,note=?,received_at=?,status='pending',reason=NULL,reviewed_at=NULL,mime=?,hash=?,bytes=?,role=? WHERE id=?",
        ).run(
          actor.generation,
          actor.name,
          note.trim(),
          now,
          png ? 'image/png' : 'image/jpeg',
          hash,
          bytes,
          role,
          id,
        );
      else
        db.prepare(
          "INSERT INTO proofs(id,task_id,realm,subject,generation,name,note,received_at,status,reason,reviewed_at,mime,hash,bytes,role) VALUES (?,?,?,?,?,?,?,?,'pending',NULL,NULL,?,?,?,?)",
        ).run(
          id,
          taskId,
          actor.realm,
          actor.subject,
          actor.generation,
          actor.name,
          note.trim(),
          now,
          png ? 'image/png' : 'image/jpeg',
          hash,
          bytes,
          role,
        );
      db.prepare('INSERT INTO proof_hashes VALUES (?,?,?)').run(taskId, hash, id);
      return { id, message: 'Evidence submitted for review. Standings remain provisional.' };
    });
  }
  standings(mode: Mode, task: GameTask): TaskStanding[] {
    const db = this.db(mode),
      realms = mode === 'simulation' ? REALMS.map((r) => r.id) : ['home'];
    const rows = realms.map((realm) => {
      const entries = db
        .prepare(
          'SELECT received_at,status,role FROM proofs WHERE task_id=? AND realm=? ORDER BY received_at,id',
        )
        .all(task.id, realm) as any[];
      const qualifying = entries.filter(
        (r) => !(task.requireStreamer && task.unit !== 'teams' && r.role === 'streamer'),
      );
      const approved = qualifying.filter((r) => r.status === 'approved');
      const pending = qualifying.filter((r) => r.status === 'pending').length;
      const streamer = entries.find((r) => r.role === 'streamer' && r.status === 'approved');
      const streamerPending = entries.some((r) => r.role === 'streamer' && r.status === 'pending');
      const membersFinished =
        approved.length >= task.target ? approved[task.target - 1].received_at : null;
      return {
        realm,
        name: mode === 'simulation' ? realmIdentity(realm).name : task.communityName,
        approved: approved.length,
        pending,
        target: task.target,
        streamerApproved: !!streamer,
        streamerPending,
        finishedAt:
          membersFinished !== null && (!task.requireStreamer || streamer)
            ? Math.max(membersFinished, task.requireStreamer ? streamer.received_at : 0)
            : null,
        place: null as number | null,
        points: 0,
        final: task.status === 'finalized',
      };
    });
    rows.sort(
      (a, b) =>
        (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) ||
        b.approved - a.approved ||
        a.realm.localeCompare(b.realm),
    );
    for (const row of rows) {
      if (row.finishedAt !== null)
        row.place =
          1 +
          rows.filter((other) => other.finishedAt !== null && other.finishedAt < row.finishedAt!)
            .length;
      if (task.status === 'finalized') {
        const award = db
          .prepare('SELECT * FROM awards WHERE task_id=? AND realm=?')
          .get(task.id, row.realm) as any;
        row.place = award?.place ?? null;
        row.points = award?.points ?? 0;
      }
    }
    return rows;
  }
  snapshot(
    mode: Mode,
    actor?: { realm: string; subject: string; generation: string },
  ): WorldTasksState {
    const tasks = (
      this.db(mode)
        .prepare(
          "SELECT id FROM tasks WHERE (?='simulation' OR (channel<>'' AND channel=?)) ORDER BY opens_at DESC,id LIMIT 30",
        )
        .all(mode, this.liveChannel()) as any[]
    ).map((r) => {
      const task = this.task(mode, r.id);
      return {
        ...task,
        standings: this.standings(mode, task),
        ...(actor
          ? {
              myProofs: (
                this.db(mode)
                  .prepare(
                    `SELECT ${proofFields} FROM proofs WHERE task_id=? AND realm=? AND subject=? AND generation=? ORDER BY received_at`,
                  )
                  .all(task.id, actor.realm, actor.subject, actor.generation) as any[]
              ).map((r) => this.proof(r)),
            }
          : {}),
      };
    });
    return {
      mode,
      now: this.now(mode),
      scope: mode === 'simulation' ? 'local-simulation' : 'local-live',
      tasks,
    };
  }
  reviewQueue(mode: Mode) {
    return (
      this.db(mode)
        .prepare(
          `SELECT ${proofFields} FROM proofs WHERE (?='simulation' OR task_id IN(SELECT id FROM tasks WHERE channel<>'' AND channel=?)) ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,received_at,id LIMIT 100`,
        )
        .all(mode, this.liveChannel()) as any[]
    ).map((r) => this.proof(r));
  }
  image(mode: Mode, id: string, actor?: { realm: string; subject: string; generation: string }) {
    const row = this.db(mode).prepare('SELECT * FROM proofs WHERE id=?').get(id) as any;
    if (
      !row ||
      (actor &&
        (row.realm !== actor.realm ||
          row.subject !== actor.subject ||
          row.generation !== actor.generation))
    )
      throw new RuleError('Evidence not found.', 'NOT_FOUND', 404);
    this.task(mode, row.task_id);
    return { mime: row.mime, bytes: Buffer.from(row.bytes) };
  }
  review(mode: Mode, id: string, decision: 'approved' | 'rejected', reason: string) {
    return this.atomic(mode, () => {
      const db = this.db(mode),
        row = db.prepare('SELECT * FROM proofs WHERE id=?').get(id) as any;
      if (!row) throw new RuleError('Evidence not found.', 'NOT_FOUND', 404);
      const task = this.task(mode, row.task_id);
      if (task.status === 'finalized') throw new RuleError('This competition is finalized.');
      if (reason.trim().length < 5 || reason.length > 500)
        throw new RuleError('Record a short review reason.');
      if (row.status !== 'pending')
        throw new RuleError('This submission has already been reviewed.', 'CONFLICT', 409);
      db.prepare(
        'INSERT INTO proof_reviews(proof_id,decision,reason,reviewed_at,hash) VALUES (?,?,?,?,?)',
      ).run(id, decision, reason.trim(), this.now(mode), row.hash);
      db.prepare('UPDATE proofs SET status=?,reason=?,reviewed_at=? WHERE id=?').run(
        decision,
        reason.trim(),
        this.now(mode),
        id,
      );
      return { ok: true };
    });
  }
  finalize(mode: Mode, id: string) {
    return this.atomic(mode, () => {
      const task = this.task(mode, id);
      if (task.status === 'finalized') return { ok: true };
      if (this.now(mode) < task.reviewDeadline)
        throw new RuleError('Final standings wait until the review cutoff.');
      if (
        this.db(mode).prepare("SELECT 1 FROM proofs WHERE task_id=? AND status='pending'").get(id)
      )
        throw new RuleError('Review all pending evidence before finalizing.');
      for (const row of this.standings(mode, task))
        if (row.place !== null)
          this.db(mode)
            .prepare('INSERT INTO awards VALUES (?,?,?,?,?)')
            .run(
              id,
              row.realm,
              row.place,
              task.rewards[Math.min(row.place, task.rewards.length) - 1],
              row.finishedAt!,
            );
      this.db(mode).prepare("UPDATE tasks SET status='finalized' WHERE id=?").run(id);
      return { ok: true };
    });
  }
  close() {
    Object.values(this.databases).forEach((db) => db.close());
  }
}
