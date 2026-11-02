import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldTasks } from '../server/world-tasks';
import { removeOwnedTestDirectory } from './helpers';
const images = [
  'everfall-realms-v2.png',
  'realm-emberwatch-v1.png',
  'realm-moonharbor-v1.png',
  'realm-stormgarden-v1.png',
].map((name) => readFileSync(new URL('../public/' + name, import.meta.url)).toString('base64'));
const actor = (realm: string, subject: string) => ({
  realm,
  subject,
  generation: 'generation-1',
  name: subject,
});
const input = {
  game: 'Example game',
  title: 'Community victory race',
  objective: 'Complete the objective and show a readable scoreboard.',
  unit: 'members' as const,
  target: 2,
  hours: 1,
  requireStreamer:false,
};
test('combined races require the member target plus a separately verified streamer completion',()=>{
 let now=Date.UTC(2026,9,28,12);const races=new WorldTasks(undefined,()=>now);try{
  const defaults=races.snapshot('simulation').tasks;assert(defaults.every(t=>t.target===10&&t.requireStreamer));
  const id=races.create('simulation',{...input,target:1,requireStreamer:true}).id;
  const member=races.submit('simulation',id,actor('home','member-a'),'Member completed objective',images[0]).id;races.review('simulation',member,'approved','Member objective verified.');
  let row=races.snapshot('simulation').tasks.find(t=>t.id===id)!.standings.find(s=>s.realm==='home')!;assert.equal(row.approved,1);assert.equal(row.finishedAt,null);assert.equal(row.streamerApproved,false);
  assert.throws(()=>races.submit('simulation',id,{...actor('home','ordinary-user'),role:'streamer'},'Fake streamer evidence',images[1]),/authorized broadcaster/);
  now+=100;const streamer=races.submit('simulation',id,{...actor('home','streamer:home'),role:'streamer'},'Streamer completed objective',images[1]).id;
  row=races.snapshot('simulation').tasks.find(t=>t.id===id)!.standings.find(s=>s.realm==='home')!;assert.equal(row.streamerPending,true);assert.equal(row.finishedAt,null);
  races.review('simulation',streamer,'approved','Streamer objective verified.');row=races.snapshot('simulation').tasks.find(t=>t.id===id)!.standings.find(s=>s.realm==='home')!;assert.equal(row.approved,1);assert.equal(row.streamerApproved,true);assert.equal(row.finishedAt,now);
  const teamId=races.create('simulation',{...input,unit:'teams',target:2,requireStreamer:true}).id;
  const team1=races.submit('simulation',teamId,{...actor('emberwatch','streamer:emberwatch'),role:'streamer'},'Streamer leads the first team',images[2]).id;races.review('simulation',team1,'approved','Team roster and objective verified.');
  let team=races.snapshot('simulation').tasks.find(t=>t.id===teamId)!.standings.find(s=>s.realm==='emberwatch')!;assert.equal(team.approved,1);assert.equal(team.streamerApproved,true);assert.equal(team.finishedAt,null);
  const team2=races.submit('simulation',teamId,actor('emberwatch','team-representative'),'Another distinct team roster',images[3]).id;races.review('simulation',team2,'approved','Second team roster verified.');team=races.snapshot('simulation').tasks.find(t=>t.id===teamId)!.standings.find(s=>s.realm==='emberwatch')!;assert.equal(team.approved,2);assert.notEqual(team.finishedAt,null);
 }finally{races.close()}
});
test('Live competitions bind evidence and streamer identity to the authorized channel',()=>{
 let channel='42';const races=new WorldTasks(undefined,Date.now,()=> 'Authorized Host',()=>channel);try{
  const id=races.create('live',{...input,target:1,requireStreamer:true}).id;
  assert.throws(()=>races.submit('live',id,{...actor('home','twitch:7'),role:'streamer',channel:'42'},'Impersonated streamer',images[0]),/authorized broadcaster/);
  assert.throws(()=>races.submit('live',id,{...actor('home','twitch:7'),channel:'other'},'Wrong channel evidence',images[0]),/another authorized/);
  const proof=races.submit('live',id,{...actor('home','twitch:42'),role:'streamer',channel:'42'},'Verified streamer entry',images[0]).id;races.review('live',proof,'approved','Streamer result verified.');
  const row=races.snapshot('live').tasks[0].standings[0];assert.equal(row.approved,0);assert.equal(row.streamerApproved,true);assert.equal(row.finishedAt,null);
  channel='new-channel';assert.equal(races.snapshot('live').tasks.length,0);assert.equal(races.reviewQueue('live').length,0);assert.throws(()=>races.image('live',proof),/another authorized/);
 }finally{races.close()}
});
test('world races rank community completion by receipt time, not review speed, and settle placement points once', () => {
  let now = Date.UTC(2026, 9, 28, 12);
  const races = new WorldTasks(undefined, () => now);
  try {
    const id = races.create('simulation', input).id;
    now += 100;
    const a1 = races.submit(
      'simulation',
      id,
      actor('home', 'a1'),
      'Scoreboard evidence A1',
      images[0],
    ).id;
    now += 100;
    const a2 = races.submit(
      'simulation',
      id,
      actor('home', 'a2'),
      'Scoreboard evidence A2',
      images[1],
    ).id;
    now += 100;
    const b1 = races.submit(
      'simulation',
      id,
      actor('emberwatch', 'b1'),
      'Scoreboard evidence B1',
      images[2],
    ).id;
    now += 100;
    const b2 = races.submit(
      'simulation',
      id,
      actor('emberwatch', 'b2'),
      'Scoreboard evidence B2',
      images[3],
    ).id;
    for (const proof of [b1, b2])
      races.review('simulation', proof, 'approved', 'Matches the stated objective.');
    let task = races.snapshot('simulation').tasks.find((t) => t.id === id)!;
    assert.equal(task.standings.find((s) => s.realm === 'emberwatch')!.place, 1);
    assert.equal(task.standings.find((s) => s.realm === 'home')!.pending, 2);
    assert.equal(task.standings.find((s) => s.realm === 'emberwatch')!.points, 0);
    for (const proof of [a1, a2])
      races.review('simulation', proof, 'approved', 'Matches the stated objective.');
    task = races.snapshot('simulation').tasks.find((t) => t.id === id)!;
    assert.equal(task.standings.find((s) => s.realm === 'home')!.place, 1);
    assert.equal(task.standings.find((s) => s.realm === 'emberwatch')!.place, 2);
    assert.throws(() => races.finalize('simulation', id), /cutoff/);
    races.advanceSimulation(26);
    races.finalize('simulation', id);
    races.finalize('simulation', id);
    task = races.snapshot('simulation').tasks.find((t) => t.id === id)!;
    assert.equal(task.status, 'finalized');
    assert.equal(task.standings.find((s) => s.realm === 'home')!.points, 100);
    assert.equal(task.standings.find((s) => s.realm === 'emberwatch')!.points, 75);
  } finally {
    races.close();
  }
});
test('world race evidence is identity-private, deduplicated, mode isolated, and can be corrected after rejection', () => {
  let now = Date.UTC(2026, 9, 28, 12);
  const races = new WorldTasks(undefined, () => now);
  try {
    const id = races.create('simulation', input).id,
      a = actor('home', 'one'),
      b = actor('home', 'two');
    const proof = races.submit('simulation', id, a, 'My game name and scoreboard', images[0]).id;
    assert.throws(
      () => races.submit('simulation', id, a, 'Duplicate member entry', images[1]),
      /already submitted/,
    );
    assert.throws(
      () => races.submit('simulation', id, b, 'Duplicate image entry', images[0]),
      /already been submitted/,
    );
    assert.throws(() => races.image('simulation', proof, b), /not found/);
    assert.throws(
      () => races.image('simulation', proof, { ...a, generation: 'different' }),
      /not found/,
    );
    assert.throws(() => races.image('live', proof), /not found/);
    assert(races.image('simulation', proof, a).bytes.length > 1000);
    assert.equal(races.snapshot('simulation').tasks.find((t) => t.id === id)!.myProofs, undefined);
    assert(!JSON.stringify(races.snapshot('simulation')).includes('My game name'));
    races.review('simulation', proof, 'rejected', 'The objective is not shown.');
    now += 1000;
    const correction = races.submit(
      'simulation',
      id,
      a,
      'Corrected readable scoreboard',
      images[1],
    );
    assert.equal(correction.id, proof);
    const own = races.snapshot('simulation', a).tasks.find((t) => t.id === id)!.myProofs![0];
    assert.equal(own.status, 'pending');
    assert.equal(own.receivedAt, now);
    assert.throws(
      () => races.submit('simulation', id, b, 'Rejected image reused', images[0]),
      /already been submitted/,
    );
    assert.throws(
      () =>
        races.submit(
          'simulation',
          id,
          b,
          'Not an image',
          Buffer.from('<svg>malicious proof content</svg>').toString('base64'),
        ),
      /PNG and JPEG/,
    );
    const bomb = Buffer.from(images[2], 'base64');
    bomb.writeUInt32BE(90000, 16);
    assert.throws(
      () =>
        races.submit('simulation', id, b, 'Oversized pixel dimensions', bomb.toString('base64')),
      /megapixels/,
    );
    assert.throws(
      () => races.submit('live', id, a, 'Cross mode submission', images[2]),
      /not found/,
    );
    races.advanceSimulation(26);
    assert.throws(() => races.finalize('simulation', id), /pending/);
    assert.throws(
      () => races.submit('simulation', id, b, 'Late valid screenshot', images[3]),
      /not accepting/,
    );
  } finally {
    races.close();
  }
});
test('world race ties, review decisions and awards survive restart in isolated databases', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chatverse-world-races-'));
  let now = Date.UTC(2026, 9, 28, 12),
    races = new WorldTasks(directory, () => now);
  try {
    const id = races.create('simulation', { ...input, unit: 'teams', target: 1 }).id;
    assert.equal(races.snapshot('simulation').tasks.find((t) => t.id === id)!.target, 1);
    const first = races.submit(
        'simulation',
        id,
        actor('home', 'team-a'),
        'Team scoreboard A',
        images[0],
      ).id,
      second = races.submit(
        'simulation',
        id,
        actor('emberwatch', 'team-b'),
        'Team scoreboard B',
        images[1],
      ).id;
    races.review('simulation', first, 'approved', 'Team objective is complete.');
    races.review('simulation', second, 'approved', 'Team objective is complete.');
    races.advanceSimulation(26);
    races.finalize('simulation', id);
    races.close();
    races = new WorldTasks(directory, () => now);
    const task = races.snapshot('simulation').tasks.find((t) => t.id === id)!;
    assert.equal(task.status, 'finalized');
    assert.equal(task.standings.filter((s) => s.place === 1 && s.points === 100).length, 2);
    assert.equal(races.snapshot('live').tasks.length, 0);
    assert.equal(races.reviewQueue('simulation').length, 2);
  } finally {
    races.close();
    removeOwnedTestDirectory(directory);
  }
});
