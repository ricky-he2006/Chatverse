import { useEffect, useState } from 'react';
import type { Mode } from '../shared/types';
import type { WorldTasksState, TaskProof } from '../shared/world-tasks';
import { Button, Panel, PanelTitle, Progress } from './ui';
import { request } from './api';
export function WorldTaskBoard({
  mode,
  realm,
  csrf,
  owner = false,
  connected,
}: {
  mode: Mode;
  realm: string;
  csrf?: string;
  owner?: boolean;
  connected: boolean;
}) {
  const [data, setData] = useState<WorldTasksState | null>(null),
    [proofs, setProofs] = useState<TaskProof[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(''),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [game, setGame] = useState('VALORANT'),
    [title, setTitle] = useState(''),
    [objective, setObjective] = useState(''),
    [unit, setUnit] = useState<'members' | 'teams' | 'single'>('members'),
    [target, setTarget] = useState(10),
    [requireStreamer, setRequireStreamer] = useState(true),
    [hours, setHours] = useState(24);
  const base = owner ? `/api/${mode}/world-tasks` : `/api/companion/${mode}/world-tasks`,
    q = `?realm=${encodeURIComponent(realm)}`;
  const call = async (path: string, body?: unknown) => {
    const url = base + path + q,
      options: RequestInit =
        body === undefined
          ? {}
          : {
              method: 'POST',
              body: JSON.stringify(body),
              headers: { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '' },
            };
    if (owner)
      return request(url, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
    const response = await fetch(url, options),
      value = await response.json();
    if (!response.ok) throw Error(value.message ?? 'Competition request failed.');
    return value;
  };
  const load = async () => {
    setData(await call(''));
    if (owner) setProofs(await call('/proofs'));
  };
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await call('');
        const queue = owner ? await call('/proofs') : [];
        if (active) {
          setData(next);
          setProofs(queue);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [mode, realm, owner, csrf]);
  const act = async (path: string, body: unknown, message: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await call(path, body);
      setNotice(message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (id: string) => {
    const file = files[id];
    if (!file || file.size > 5 * 1024 * 1024) {
      setError('Choose a PNG/JPEG screenshot under 5 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(Error('The screenshot could not be read.'));
        reader.readAsDataURL(file);
      });
      await call('/' + id + (owner ? '/streamer-proof' : '/proofs'), {
        note: notes[id] ?? '',
        image: encoded,
      });
      setNotice('Evidence submitted. Your community’s standings remain provisional until review.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const date = (n: number) => new Date(n).toLocaleString();
  return (
    <div className="world-tasks">
      <header className="experience-heading">
        <span className="eyebrow">STREAMER COMMUNITIES · GAME OBJECTIVES</span>
        <h1>World races</h1>
        <p>
          One objective. Every community working toward it. First, second, third—and rewards for
          every community that finishes.
        </p>
      </header>
      <div className="world-race-scope">
        {mode === 'simulation'
          ? 'LOCAL SIMULATION · Worldwide competition format across four fictional communities.'
          : connected
            ? 'LOCAL LIVE · One Twitch channel connected. This race runs on this installation.'
            : 'LOCAL LIVE · No Twitch channel connected. Connect your channel in Studio to publish a local race.'}
      </div>
      {error && (
        <div className="connection-alert error" role="alert">
          {error}
          <Button onClick={() => void load().catch((e) => setError(e.message))}>Retry</Button>
        </div>
      )}
      {notice && (
        <p role="status" className="companion-notice">
          {notice}
        </p>
      )}
      {!data ? (
        <Panel>
          <p>Loading community competitions…</p>
        </Panel>
      ) : (
        <>
          {data.tasks.length === 0 && (
            <Panel>
              <PanelTitle title="No world race is open" />
              <p>
                The local owner can publish a game objective and its community completion target
                here.
              </p>
            </Panel>
          )}
          {data.tasks.map((task) => (
            <Panel className="world-race" key={task.id}>
              <PanelTitle
                title={task.title}
                eyebrow={`${task.game} · ${task.status === 'finalized' ? 'FINAL RESULTS' : 'PROVISIONAL STANDINGS'}`}
              />
              <p className="race-objective">{task.objective}</p>
              <div className="race-rules">
                <span>
                  {task.target}{' '}
                  {task.unit === 'members'
                    ? task.target === 1
                      ? 'approved member'
                      : 'distinct approved members'
                    : task.unit === 'teams'
                      ? task.target === 1
                        ? 'approved community team'
                        : 'approved community teams'
                      : 'approved finisher'}{' '}
                  to complete{task.requireStreamer ? ' + the streamer must complete it' : ''}
                </span>
                <span>Entries close {date(task.deadline)}</span>
                <span>Review cutoff {date(task.reviewDeadline)}</span>
              </div>
              <p className="race-prizes">
                1st: 100 prestige · 2nd: 75 · 3rd: 50 · later finishers: 25. Exact completion-time
                ties share a place.
              </p>
              <div className="world-race-standings">
                {task.standings.map((row) => (
                  <div key={row.realm} className={row.realm === realm ? 'current-community' : ''}>
                    <strong>{row.place ? '#' + row.place : '—'}</strong>
                    <span>
                      <b>
                        {row.name}
                        {row.realm === realm ? ' · Your community' : ''}
                      </b>
                      <small>
                        {row.approved} approved · {row.pending} awaiting review
                        {row.finishedAt ? ' · Completed ' + date(row.finishedAt) : ''}
                      </small>
                      {task.requireStreamer && (
                        <small>
                          Streamer:{' '}
                          {row.streamerApproved
                            ? 'approved'
                            : row.streamerPending
                              ? 'awaiting review'
                              : 'not completed'}
                        </small>
                      )}
                      <Progress value={Math.min(row.approved, row.target)} max={row.target} />
                    </span>
                    <em>
                      {row.final
                        ? row.points + ' prestige'
                        : row.place
                          ? task.rewards[Math.min(row.place, task.rewards.length) - 1] + ' pending'
                          : row.approved >= row.target &&
                              task.requireStreamer &&
                              !row.streamerApproved
                            ? 'Streamer needed'
                            : 'In progress'}
                    </em>
                  </div>
                ))}
              </div>
              <p className="race-fairness">
                Completion uses the server receipt time of the last required approved submission.
                Placements can change while earlier evidence is pending. Screenshots require human
                review; uploads do not award points automatically.
              </p>
              {owner &&
                task.requireStreamer &&
                task.status === 'open' &&
                data.now < task.deadline && (
                  <div className="proof-submit">
                    <h3>Your streamer completion</h3>
                    <p>
                      {mode === 'simulation'
                        ? 'This is the explicitly simulated streamer for the selected community.'
                        : 'Live streamer evidence is bound to the currently authorized broadcaster.'}{' '}
                      A member cannot submit a streamer flag.
                    </p>
                    {task.standings.find((s) => s.realm === realm)?.streamerApproved ? (
                      <p>Streamer completion approved.</p>
                    ) : task.standings.find((s) => s.realm === realm)?.streamerPending ? (
                      <p>Streamer evidence is awaiting review.</p>
                    ) : (
                      <>
                        <label>
                          Streamer screenshot evidence
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            disabled={busy}
                            onChange={(e) => setFiles({ ...files, [task.id]: e.target.files?.[0] })}
                          />
                        </label>
                        <label>
                          Streamer game name and result
                          <textarea
                            maxLength={1000}
                            value={notes[task.id] ?? ''}
                            onChange={(e) => setNotes({ ...notes, [task.id]: e.target.value })}
                          />
                        </label>
                        <Button
                          disabled={
                            busy || !files[task.id] || (notes[task.id]?.trim().length ?? 0) < 5
                          }
                          onClick={() => void submit(task.id)}
                        >
                          Submit streamer completion
                        </Button>
                      </>
                    )}
                  </div>
                )}
              {!owner && (
                <div className="proof-submit">
                  {task.myProofs?.map((proof) => (
                    <div className="companion-row" key={proof.id}>
                      <strong>
                        Your {proof.role === 'streamer' ? 'streamer' : 'member'} evidence ·{' '}
                        {proof.status}
                      </strong>
                      <p>
                        Received {date(proof.receivedAt)}
                        {proof.reason ? ' · ' + proof.reason : ''}
                      </p>
                      <a
                        href={`${base}/proofs/${proof.id}/image${q}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View your screenshot ↗
                      </a>
                    </div>
                  ))}
                  {task.status === 'open' &&
                    data.now < task.deadline &&
                    !task.myProofs?.some((p) => p.status !== 'rejected') && (
                      <>
                        <label>
                          Screenshot evidence (PNG/JPEG, up to 5 MB)
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            disabled={busy}
                            onChange={(e) => setFiles({ ...files, [task.id]: e.target.files?.[0] })}
                          />
                        </label>
                        <label>
                          Game name, team roster if applicable, and what the screenshot demonstrates
                          <textarea
                            maxLength={1000}
                            value={notes[task.id] ?? ''}
                            onChange={(e) => setNotes({ ...notes, [task.id]: e.target.value })}
                          />
                        </label>
                        <Button
                          variant="primary"
                          disabled={
                            busy || !files[task.id] || (notes[task.id]?.trim().length ?? 0) < 5
                          }
                          onClick={() => void submit(task.id)}
                        >
                          Submit for{' '}
                          {task.standings.find((s) => s.realm === realm)?.name ?? 'your community'}
                        </Button>
                        <p>
                          Only your community identity can submit this entry. Keep personal
                          information out of the screenshot. Evidence is visible to you and
                          authorized local reviewers.
                        </p>
                      </>
                    )}
                </div>
              )}
              {owner && task.status !== 'finalized' && (
                <>
                  <Button
                    disabled={
                      busy ||
                      data.now < task.reviewDeadline ||
                      proofs.some((p) => p.taskId === task.id && p.status === 'pending')
                    }
                    onClick={() =>
                      void act('/' + task.id + '/finalize', {}, 'Final placements recorded once.')
                    }
                  >
                    Finalize placements
                  </Button>
                  <small className="finalize-help">
                    Available after the review cutoff and all pending submissions are reviewed.
                  </small>
                </>
              )}
            </Panel>
          ))}
          {owner && (
            <>
              <Panel>
                <PanelTitle title="Publish a shared game objective" eyebrow="LOCAL OWNER" />
                <div className="race-create-grid">
                  <label>
                    Game
                    <input value={game} maxLength={60} onChange={(e) => setGame(e.target.value)} />
                  </label>
                  <label>
                    Competition name
                    <input
                      value={title}
                      maxLength={100}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    Completion unit
                    <select
                      value={unit}
                      onChange={(e) => {
                        setUnit(e.target.value as typeof unit);
                        setTarget(e.target.value === 'members' ? 10 : 1);
                      }}
                    >
                      <option value="members">Distinct community members</option>
                      <option value="teams">Community team entries</option>
                      <option value="single">One viewer for their community</option>
                    </select>
                  </label>
                  <label>
                    Required completions
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={unit === 'single' ? 1 : target}
                      disabled={unit === 'single'}
                      onChange={(e) => setTarget(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Entry window (hours)
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                    />
                  </label>
                </div>
                <label className="race-checkbox">
                  <input
                    type="checkbox"
                    checked={requireStreamer}
                    onChange={(e) => setRequireStreamer(e.target.checked)}
                  />{' '}
                  Require streamer completion as well
                </label>
                <p>
                  For member races, streamer completion is additional to the member target. For team
                  races, a verified team entry submitted by the streamer can satisfy both
                  requirements.
                </p>
                <label>
                  Objective and acceptable evidence
                  <textarea
                    value={objective}
                    maxLength={1000}
                    onChange={(e) => setObjective(e.target.value)}
                  />
                </label>
                <Button
                  variant="primary"
                  disabled={busy || !game.trim() || !title.trim() || objective.trim().length < 10}
                  onClick={() =>
                    void act(
                      '',
                      { game, title, objective, unit, target, hours, requireStreamer },
                      'Competition published for this environment.',
                    )
                  }
                >
                  Publish competition
                </Button>
                <p>
                  Review cutoff is 24 hours after entries close. Game results are verified by
                  people, not assumed from Twitch events.
                </p>
                {mode === 'simulation' && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        '/advance',
                        { hours: 24 },
                        'Simulation competition clock advanced 24 hours.',
                      )
                    }
                  >
                    Advance Simulation race clock 24 hours
                  </Button>
                )}
              </Panel>
              <Panel>
                <PanelTitle title="Evidence review" eyebrow="PRIVATE · LOCAL OWNER" />
                {proofs.length === 0 ? (
                  <p>No evidence has been submitted.</p>
                ) : (
                  proofs.map((proof) => (
                    <div className="proof-review-row" key={proof.id}>
                      <strong>
                        {proof.name} · {proof.realm} · {proof.role} · {proof.status}
                      </strong>
                      <p>
                        {data.tasks.find((t) => t.id === proof.taskId)?.title} ·{' '}
                        {date(proof.receivedAt)}
                      </p>
                      <p>{proof.note}</p>
                      <Button onClick={() => setSelected(selected === proof.id ? '' : proof.id)}>
                        {selected === proof.id ? 'Close screenshot' : 'Inspect screenshot'}
                      </Button>
                      {selected === proof.id && (
                        <img
                          className="proof-image"
                          src={`${base}/proofs/${proof.id}/image${q}`}
                          alt={`Submitted evidence from ${proof.name}`}
                        />
                      )}{' '}
                      {proof.status === 'pending' ? (
                        <>
                          <label>
                            Review reason
                            <input
                              value={reasons[proof.id] ?? ''}
                              maxLength={500}
                              onChange={(e) =>
                                setReasons({ ...reasons, [proof.id]: e.target.value })
                              }
                            />
                          </label>
                          <Button
                            disabled={busy || (reasons[proof.id]?.trim().length ?? 0) < 5}
                            onClick={() =>
                              void act(
                                '/proofs/' + proof.id + '/review',
                                { decision: 'approved', reason: reasons[proof.id] },
                                'Evidence approved; provisional standings updated.',
                              )
                            }
                          >
                            Approve completion
                          </Button>{' '}
                          <Button
                            disabled={busy || (reasons[proof.id]?.trim().length ?? 0) < 5}
                            onClick={() =>
                              void act(
                                '/proofs/' + proof.id + '/review',
                                { decision: 'rejected', reason: reasons[proof.id] },
                                'Evidence rejected with a recorded reason.',
                              )
                            }
                          >
                            Reject
                          </Button>
                        </>
                      ) : (
                        <p>{proof.reason}</p>
                      )}
                    </div>
                  ))
                )}
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
