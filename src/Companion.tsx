import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Crown, Shield, Swords, Compass, Sparkles, LogOut } from 'lucide-react';
import type { CompanionState } from '../shared/companion';
import { ITEMS } from '../shared/catalog';
import { realmIdentity } from '../shared/realms';
import { WorldTaskBoard } from './WorldTasks';
import { Avatar, Button, Panel, PanelTitle, Progress, SupporterBadge } from './ui';
import { Crest, WorldMap } from './WorldMap';
let exchange: { code: string; promise: Promise<any> } | null = null;
export function Companion() {
  const query = new URLSearchParams(location.search),
    mode = query.get('mode') === 'live' ? 'live' : 'simulation',
    realm = query.get('realm') ?? 'home',
    base = `/api/companion/${mode}`,
    suffix = `?realm=${encodeURIComponent(realm)}`;
  const [state, setState] = useState<CompanionState | null>(null),
    [csrf, setCsrf] = useState(''),
    [error, setError] = useState(
      query.get('login') === 'denied' ? 'Twitch sign-in was cancelled. You can try again.' : '',
    ),
    [notice, setNotice] = useState(''),
    [battleFeedback, setBattleFeedback] = useState<{
      chapter: string;
      status: string;
      text: string;
      error: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [config, setConfig] = useState<any>(null),
    [pane, setPane] = useState(
      [
        'story',
        'armory',
        'kingdom',
        'challenges',
        'rankings',
        'map',
        'council',
        'world-tasks',
      ].includes(query.get('pane') ?? '')
        ? query.get('pane')!
        : 'story',
    ),
    [target, setTarget] = useState(''),
    [selected, setSelected] = useState(''),
    [ledger, setLedger] = useState<any[] | null>(null);
  const ledgerOpen = useRef(false),
    ledgerRequest = useRef(0);
  const refreshLedger = async () => {
    if (!ledgerOpen.current) return;
    const serial = ++ledgerRequest.current;
    try {
      const rows = await request(`${base}/ledger${suffix}`);
      if (serial === ledgerRequest.current) setLedger(rows);
    } catch (e) {
      if (serial === ledgerRequest.current) setError((e as Error).message);
    }
  };
  const request = async (path: string, options: RequestInit = {}) => {
    const r = await fetch(path, {
      ...options,
      headers: { 'content-type': 'application/json', ...options.headers },
    });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 401) {
        ledgerOpen.current = false;
        ledgerRequest.current++;
        setLedger(null);
        setCsrf('');
        setState(null);
      }
      throw Error(data.message ?? data.error ?? 'Request failed.');
    }
    return data;
  };
  const reload = async () => setState(await request(`${base}/state${suffix}`));
  const boot = useRef<Promise<any> | null>(null);
  useEffect(() => {
    let active = true;
    if (!boot.current)
      boot.current = (async () => {
        const code = new URLSearchParams(location.hash.slice(1)).get('preview');
        if (code) {
          history.replaceState(null, '', location.pathname + location.search);
          if (exchange?.code !== code)
            exchange = {
              code,
              promise: request('/api/companion/exchange', {
                method: 'POST',
                body: JSON.stringify({ code }),
              }),
            };
          await exchange.promise;
        }
        return await request(`${base}/session${suffix}`);
      })();
    request(`/api/companion/config?mode=${mode}&realm=${encodeURIComponent(realm)}`)
      .then((c) => {
        if (active) setConfig(c);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    boot.current
      .then(async (session) => {
        if (!active) return;
        if (session.authenticated) {
          setCsrf(session.csrf);
          await reload();
        }
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!csrf) return;
    let active = true;
    const timer = setInterval(
      () =>
        request(`${base}/state${suffix}`)
          .then((s) => {
            if (active) {
              setState(s);
              void refreshLedger();
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      5000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [csrf]);
  const act = async (path: string, body: unknown, method = 'POST', battleCommand = false) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    setBattleFeedback(null);
    const phase =
      battleCommand && state?.chapter
        ? { chapter: state.chapter.id, status: state.chapter.status }
        : null;
    try {
      const result = await request(`${base}/${path}${suffix}`, {
        method,
        body: JSON.stringify(body),
        headers: { 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
      });
      const text = result.message ?? 'Saved to your story.';
      if (phase) setBattleFeedback({ ...phase, text, error: false });
      else setNotice(text);
      await reload();
      await refreshLedger();
    } catch (e) {
      if (phase) {
        setBattleFeedback({ ...phase, text: (e as Error).message, error: true });
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const command = (type: string, argument?: string) =>
    void act('commands', { type, argument }, 'POST', type === 'pledge' || type === 'vote');
  const c = state?.character,
    ch = state?.chapter,
    activeChapter = ch && ['open', 'paused'].includes(ch.status),
    inBattle = c && ch && [ch.attacker, ch.defender].includes(c.kingdom),
    previousBattle = state?.personalRecap?.battle,
    nextUpgrade = state?.personalRecap?.upgrade;
  useEffect(() => {
    setBattleFeedback(null);
  }, [ch?.id, ch?.status, c?.id]);
  useEffect(() => {
    if (state && state.role !== 'lord' && pane === 'council') setPane('story');
  }, [state?.role, pane]);
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(location.search);
    q.set('pane', pane);
    history.replaceState(null, '', location.pathname + '?' + q);
  }, [pane, ready]);
  useEffect(() => {
    if (state?.character && !selected)
      setSelected(
        state.territories.find((t) => t.capital && t.owner === state.character!.kingdom)?.id ?? '',
      );
  }, [state?.character?.kingdom]);
  const tabs: [string, string, typeof Shield][] = [
    ['story', 'My story', Shield],
    ['armory', 'Armory & upgrades', Swords],
    ['kingdom', 'My kingdom', Crown],
    ['challenges', 'Challenges', Sparkles],
    ['world-tasks', 'World races', Sparkles],
    ['rankings', 'Season rankings', Crown],
    ['map', 'Realm map', Compass],
    ...(state?.role === 'lord'
      ? ([['council', 'Lord’s council', Swords]] as [string, string, typeof Shield][])
      : []),
  ];
  return (
    <div
      className="companion-shell"
      style={{ '--realm-map-image': `url("${realmIdentity(realm).mapImage}")` } as CSSProperties}
    >
      <header className="companion-header">
        <a
          className="companion-brand"
          href={`/play?mode=${mode}&realm=${encodeURIComponent(realm)}`}
          onClick={(e) => {
            e.preventDefault();
            setPane('story');
          }}
        >
          <Crown />
          ChatVerse
        </a>
        <span>{state?.realm ?? config?.realm ?? 'Your community. Your kingdom.'}</span>
        {state && (
          <Button
            aria-label="Sign out of companion"
            onClick={async () => {
              try {
                await request(`${base}/session${suffix}`, {
                  method: 'DELETE',
                  headers: { 'x-csrf-token': csrf },
                });
                setCsrf('');
                setState(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={14} />
            Sign out
          </Button>
        )}
      </header>
      <main>
        <div className="companion-mode">
          {mode === 'simulation'
            ? 'SIMULATION PREVIEW · FICTIONAL CITIZENS'
            : 'TWITCH LIVE · PERSONAL COMPANION'}
          {state?.preview && (
            <a href={`/?mode=simulation&realm=${realm}`}>Return to Stream room ↗</a>
          )}
        </div>
        {error && (
          <div className="connection-alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="companion-notice" role="status">
            {notice}
          </div>
        )}
        {!ready ? (
          <Panel>
            <p>Opening your story…</p>
          </Panel>
        ) : !state ? (
          <section className="companion-welcome">
            <span className="eyebrow">YOUR COMMUNITY HAS A WORLD</span>
            <h1>
              Become part of
              <br />
              the next chapter.
            </h1>
            <p>
              Choose a kingdom, grow your character, and decide what happens next with your
              community.
            </p>
            {mode === 'live' ? (
              <>
                <Button
                  variant="primary"
                  disabled={!config?.configured || !config?.connected}
                  onClick={() =>
                    location.assign(`/auth/viewer/start?realm=${encodeURIComponent(realm)}`)
                  }
                >
                  Sign in with Twitch
                </Button>
                <p>
                  {!config?.connected
                    ? 'The streamer must connect this local realm first.'
                    : 'Your Twitch identity signs you into your own companion.'}
                </p>
              </>
            ) : (
              <>
                <p>Open a citizen or elected Lord preview from the owner’s Stream room.</p>
                <a className="button primary" href={`/?mode=simulation&realm=${realm}`}>
                  Open Stream room
                </a>
              </>
            )}
          </section>
        ) : !c ? (
          <>
            <div className="experience-heading">
              <span className="eyebrow">WELCOME, {state.identity.name}</span>
              <h1>Choose your banner.</h1>
              <p>Every kingdom needs another story. Yours starts here.</p>
            </div>
            <div className="kingdom-pulse">
              {state.kingdoms.map((k) => (
                <button disabled={busy} key={k.id} onClick={() => command('join', k.id)}>
                  <Crest faction={k.id} />
                  <span>
                    <strong>{k.name}</strong>
                    <small>{k.citizens} citizens · Join kingdom</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <section className="citizen-identity">
              <Avatar character={c} />
              <div>
                <span className="eyebrow">
                  {state.role === 'lord' ? 'ELECTED LORD' : 'CITIZEN'} OF {c.kingdom.toUpperCase()}
                </span>
                <h1>{c.name}</h1>
                <SupporterBadge character={c} />
              </div>
              <aside>
                <strong>Level {c.level}</strong>
                <span>
                  {c.class} · {c.gold} gold
                </span>
                <Progress value={c.levelXp} max={c.nextXp} />
                <small>
                  {c.levelXp} / {c.nextXp} XP
                </small>
              </aside>
            </section>
            <nav className="companion-tabs" aria-label="Companion navigation">
              {tabs.map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={pane === id ? 'active' : ''}
                  aria-current={pane === id ? 'page' : undefined}
                  onClick={() => setPane(id)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
            {(pane === 'story' || pane === 'armory') && (
              <div className={pane === 'armory' ? 'armory-layout' : 'experience-grid'}>
                {pane === 'story' && (
                  <Panel>
                    <PanelTitle
                      title={
                        activeChapter
                          ? 'Your community needs you'
                          : previousBattle
                            ? 'Your last chapter'
                            : 'Your first chapter'
                      }
                      eyebrow="PARTICIPATE"
                    />
                    {activeChapter ? (
                      <>
                        <h3>
                          {ch.attacker} vs {ch.defender}
                        </h3>
                        <p>
                          {state.territories.find((t) => t.id === ch.territory)?.name} ·{' '}
                          {ch.status === 'paused'
                            ? 'Paused'
                            : `${Math.max(0, Math.ceil((ch.deadline - state.now) / 1000))}s remaining`}
                        </p>
                        {inBattle ? (
                          <>
                            <Button
                              disabled={busy || !!ch.myPledge || ch.status !== 'open'}
                              variant="primary"
                              onClick={() => command('pledge')}
                            >
                              {ch.myPledge ? 'Pledged to your kingdom' : 'Pledge to this chapter'}
                            </Button>
                            <p>
                              {ch.status === 'paused'
                                ? 'Voting resumes when the streamer reopens the council.'
                                : !ch.myPledge
                                  ? 'Pledge first to unlock your tactic ballot.'
                                  : 'Your ballot stays sealed. You can change your tactic until the council closes.'}
                            </p>
                            <div className="room-actions">
                              {['attack', 'defend', 'raid'].map((t) => (
                                <Button
                                  key={t}
                                  disabled={busy || !ch.myPledge || ch.status !== 'open'}
                                  aria-pressed={ch.myVote === t}
                                  onClick={() => command('vote', t)}
                                >
                                  {t}
                                  {ch.myVote === t ? ' ✓' : ''}
                                </Button>
                              ))}
                            </div>
                            {battleFeedback?.chapter === ch.id &&
                              battleFeedback.status === ch.status && (
                                <p role={battleFeedback.error ? 'alert' : 'status'}>
                                  {battleFeedback.text}
                                </p>
                              )}
                          </>
                        ) : (
                          <p>
                            Your kingdom is watching this chapter. Keep building for the next one.
                          </p>
                        )}
                      </>
                    ) : previousBattle ? (
                      <div aria-live="polite">
                        <h3>{previousBattle.summary}</h3>
                        <p>{previousBattle.reward}</p>
                        {ch && previousBattle.id !== ch.id && (
                          <p>You did not pledge to the latest chapter.</p>
                        )}
                      </div>
                    ) : (
                      <p>
                        {ch ? 'You did not pledge to the last chapter. ' : ''}
                        When your kingdom’s next council opens, pledge here or type !pledge in chat.
                      </p>
                    )}
                    <Button onClick={() => setPane('challenges')}>Explore challenges</Button>
                  </Panel>
                )}
                {pane === 'story' && (
                  <Panel>
                    <PanelTitle title="Build your character" eyebrow="YOUR PROGRESSION" />
                    <div className="progression-balances">
                      <span>
                        <strong>{c.gold}</strong>Gold to spend
                      </span>
                      <span>
                        <strong>{c.xp}</strong>Total XP
                      </span>
                      <span>
                        <strong>{c.contribution}</strong>Contribution
                      </span>
                    </div>
                    {nextUpgrade ? (
                      nextUpgrade.shortfall > 0 ? (
                        <p>
                          Save {nextUpgrade.shortfall} more gold for {nextUpgrade.name} +
                          {nextUpgrade.level} ({nextUpgrade.cost} gold).
                        </p>
                      ) : (
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={() => command('upgrade', nextUpgrade.definition)}
                        >
                          Upgrade {nextUpgrade.name} to +{nextUpgrade.level} · {nextUpgrade.cost}{' '}
                          gold
                        </Button>
                      )
                    ) : (
                      <p>Your equipped gear is fully upgraded.</p>
                    )}
                    <Button onClick={() => setPane('armory')}>Open armory & upgrades</Button>
                    <h3>Ways to earn</h3>
                    <p>
                      Your first successful action each UTC day grants up to 10 XP and 10 gold. A
                      settled battle grants up to 30 each to winners or 20 each to other
                      participants for your first three rewarded battles that day. Daily rewards are
                      capped at 100 XP and 100 gold.
                    </p>
                    <Button onClick={() => setPane('challenges')}>Find an active challenge</Button>
                  </Panel>
                )}
                {pane === 'armory' && (
                  <Panel>
                    <PanelTitle title="Your armory" eyebrow="EARN · EQUIP · UPGRADE" />
                    <div className="progression-balances">
                      <span>
                        <strong>{c.gold}</strong>Gold available
                      </span>
                      <span>
                        <strong>{c.level}</strong>Character level
                      </span>
                      <span>
                        <strong>
                          {c.levelXp} / {c.nextXp || 'MAX'}
                        </strong>
                        Level XP
                      </span>
                    </div>
                    <p>
                      Spend gold below to upgrade your own gear. Each upgrade previews its effect;
                      equipped bonuses apply when a battle locks.
                    </p>
                    <div className="personal-stats" aria-label="Character statistics">
                      {(['attack', 'defense', 'health', 'speed'] as const).map((stat) => (
                        <span key={stat}>
                          <strong>{c.stats[stat]}</strong>
                          {stat}
                        </span>
                      ))}
                    </div>
                    {c.gear?.map((g) => (
                      <div className="companion-row" key={g.id}>
                        <strong>
                          {g.name} +{g.upgrade}
                        </strong>
                        <p>
                          {g.slot} · {g.bonus} · {g.equipped ? 'Equipped' : 'In inventory'}
                        </p>
                        {g.upgrade < 5 && (
                          <p className="upgrade-comparison">
                            {g.bonus} <span aria-hidden="true">→</span>
                            <span className="design-sr-only"> to </span> +
                            {g.slot === 'weapon'
                              ? 4 + (g.upgrade + 1) * 2
                              : g.slot === 'armor'
                                ? 3 + (g.upgrade + 1) * 2
                                : 10 + (g.upgrade + 1) * 5}{' '}
                            {g.slot === 'weapon'
                              ? 'Attack'
                              : g.slot === 'armor'
                                ? 'Defense'
                                : 'Health'}{' '}
                            <small>
                              {g.equipped
                                ? 'Applies when the next battle locks.'
                                : 'Equip this item to use its bonus.'}
                            </small>
                          </p>
                        )}
                        <Button
                          disabled={busy || c.gold < g.cost || g.upgrade >= 5}
                          onClick={() => command('upgrade', g.id)}
                        >
                          {g.upgrade >= 5 ? 'Fully upgraded' : `Upgrade ${g.slot} · ${g.cost} gold`}
                        </Button>
                        {!g.equipped && (
                          <Button disabled={busy} onClick={() => command('equip', g.id)}>
                            Equip
                          </Button>
                        )}
                      </div>
                    ))}
                    <label>
                      Character class
                      <select
                        value={c.class}
                        disabled={busy}
                        onChange={(e) => command('class', e.target.value)}
                      >
                        {['vanguard', 'ranger', 'rogue'].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <details className="companion-shop">
                      <summary>Visit the armory · cosmetic sidegrades</summary>
                      <p>Build variety with equipment you can equip and upgrade.</p>
                      {ITEMS.filter((item) => !c.gear?.some((g) => g.definition === item.id)).map(
                        (item) => (
                          <div className="companion-row" key={item.id}>
                            <strong>{item.name}</strong>
                            <p>{item.flavor}</p>
                            <Button
                              disabled={busy || c.gold < item.cost}
                              onClick={() => command('buy', item.id)}
                            >
                              Buy · {item.cost} gold
                            </Button>
                          </div>
                        ),
                      )}
                    </details>
                    <Button
                      onClick={() => {
                        ledgerOpen.current = true;
                        void refreshLedger();
                      }}
                    >
                      View my reward ledger
                    </Button>
                    {ledger?.map((r, i) => (
                      <div key={i} className="personal-ledger-row">
                        <p>
                          {r.reason} · {r.delta > 0 ? '+' : ''}
                          {r.delta} gold · balance {r.balance_after}
                          {r.xp != null && ` · +${r.xp} XP`}
                        </p>
                        {r.chapter_id && (
                          <details>
                            <summary>Chapter result · {r.territory.replaceAll('-', ' ')}</summary>
                            <p>
                              {!r.outcome?.winner
                                ? 'Draw · defending banner unchanged'
                                : r.outcome.winner === r.attacker
                                  ? `${r.attacker} captured the territory`
                                  : `${r.defender} held the territory`}
                              .
                            </p>
                            {r.outcome?.maxHealthA && (
                              <p>
                                {r.attacker}: {r.outcome.healthA}/{r.outcome.maxHealthA} HP ·{' '}
                                {r.defender}: {r.outcome.healthB}/{r.outcome.maxHealthB} HP
                              </p>
                            )}
                          </details>
                        )}
                      </div>
                    ))}
                  </Panel>
                )}
              </div>
            )}
            {pane === 'kingdom' && (
              <div className="experience-grid">
                <Panel>
                  <PanelTitle
                    title={state.kingdoms.find((k) => k.id === c.kingdom)?.name ?? 'Your kingdom'}
                    eyebrow="YOUR BANNER"
                  />
                  <p>
                    Lord:{' '}
                    {state.kingdoms.find((k) => k.id === c.kingdom)?.lord ?? 'Council seat open'}
                  </p>
                  <div className="progression-balances">
                    <span>
                      <strong>{state.kingdoms.find((k) => k.id === c.kingdom)?.citizens}</strong>
                      Citizens
                    </span>
                    <span>
                      <strong>{state.kingdoms.find((k) => k.id === c.kingdom)?.territories}</strong>
                      Territories
                    </span>
                    <span>
                      <strong>
                        {state.kingdoms.find((k) => k.id === c.kingdom)?.fortressHealth}
                      </strong>
                      Fortress HP
                    </span>
                  </div>
                  <PanelTitle title="People behind your banner" />
                  {state.citizens.map((h) => (
                    <div className="companion-person" key={h.id}>
                      <Avatar small character={h} />
                      <span>
                        <strong>{h.name}</strong>
                        <small>
                          Level {h.level} · {h.class}
                        </small>
                      </span>
                      <SupporterBadge character={h} />
                    </div>
                  ))}
                </Panel>
                <Panel>
                  <PanelTitle title="The people's council" />
                  {state.elections.length === 0 ? (
                    <p>No election is open. Your streamer can open nominations.</p>
                  ) : (
                    state.elections.map((e) => (
                      <div key={e.id}>
                        <h3>
                          {e.status === 'nominating'
                            ? 'Nominations open'
                            : e.status === 'voting'
                              ? 'Ballots open'
                              : 'Election concluded'}
                        </h3>
                        <p>{e.reason ?? `${e.ballots} ballots · quorum ${e.quorum}`}</p>
                        {e.status === 'nominating' && (
                          <Button
                            disabled={busy || c.level < 2}
                            onClick={() => command('nominate')}
                          >
                            Nominate myself · Level 2 required
                          </Button>
                        )}
                        {e.candidates.map((candidate) => (
                          <div className="companion-row" key={candidate.id}>
                            <strong>{candidate.name}</strong>{' '}
                            <Button
                              disabled={busy || e.status !== 'voting'}
                              onClick={() => command('elect', candidate.id)}
                            >
                              Vote
                            </Button>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                  <p>Subscription rank is cosmetic. Lordship comes from elections.</p>
                </Panel>
              </div>
            )}
            {pane === 'kingdom' && (
              <Panel>
                <PanelTitle
                  title="Develop your territories"
                  eyebrow="COMMUNITY-FUNDED FORTIFICATIONS"
                />
                <p>
                  Population unlocks new land. Citizens can spend their own gold to fortify
                  territory their kingdom owns. Each level adds 60 fortress HP when defending that
                  territory, up to 180 HP. Capturing it destroys its fortifications.
                </p>
                {state.territories
                  .filter((t) => t.owner === c.kingdom && !t.capital)
                  .map((t) => (
                    <div className="companion-row" key={t.id}>
                      <strong>
                        {t.name} · Level {t.development?.level ?? 0}/3
                      </strong>
                      <p>Current defense: +{t.development?.healthBonus ?? 0} fortress HP</p>
                      <Button
                        disabled={
                          busy ||
                          t.development?.nextCost === null ||
                          c.gold < (t.development?.nextCost ?? 100)
                        }
                        onClick={() =>
                          void act(`districts/${t.id}/upgrade`, {
                            expectedLevel: t.development?.level ?? 0,
                          })
                        }
                      >
                        {t.development?.nextCost === null
                          ? 'Fully fortified'
                          : `Fund next level · ${t.development?.nextCost ?? 100} gold`}
                      </Button>
                    </div>
                  ))}
              </Panel>
            )}
            {pane === 'rankings' && (
              <Panel>
                <PanelTitle
                  title={`Season ${state.season.number} · Kingdom rankings`}
                  eyebrow="SEASONAL INFLUENCE"
                />
                <p>
                  Influence ranks kingdoms; it is separate from your spendable gold and character
                  XP. The season ends {new Date(state.season.endsAt).toLocaleString()}.
                </p>
                <div className="kingdom-scoreboard">
                  {[...state.kingdoms]
                    .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))
                    .map((k) => (
                      <div key={k.id} className={k.id === c.kingdom ? 'your-kingdom' : ''}>
                        <strong>
                          #{1 + state.kingdoms.filter((other) => other.points > k.points).length}
                        </strong>
                        <Crest faction={k.id} />
                        <span>
                          <strong>
                            {k.name}
                            {k.id === c.kingdom ? ' · Your kingdom' : ''}
                          </strong>
                          <small>
                            {k.wins} battles won · {k.territories} territories
                          </small>
                        </span>
                        <b>{k.points} influence</b>
                      </div>
                    ))}
                </div>
                <p>
                  Your character has {c.contribution} contribution. Use gold in the Armory to
                  improve your equipment.
                </p>
                <Button onClick={() => setPane('armory')}>Open armory</Button>
              </Panel>
            )}
            {pane === 'world-tasks' && (
              <WorldTaskBoard
                key={`${mode}:${realm}`}
                mode={mode}
                realm={realm}
                csrf={csrf}
                connected={state.connected}
              />
            )}
            {pane === 'challenges' && (
              <div className="experience-grid">
                {state.challenges.map((r) => (
                  <Panel key={r.id}>
                    <PanelTitle title={r.title} eyebrow={r.status.toUpperCase()} />
                    <p>{r.description}</p>
                    <p>
                      {r.xp} XP · {r.gold} gold per eligible contributor
                    </p>
                    {r.leaders.map((l) => (
                      <div className="companion-row" key={l.id}>
                        <strong>{l.name}</strong>
                        <Progress value={l.score} max={r.target} />
                        <small>
                          {l.score} / {r.target}
                        </small>
                      </div>
                    ))}
                    {r.winner && <p>Winner: {r.winner}</p>}
                  </Panel>
                ))}
              </div>
            )}
            {pane === 'map' && (
              <Panel>
                <PanelTitle title={state.realm} eyebrow="YOUR STREAMER’S REALM" />
                <p>
                  Your {c.kingdom} kingdom holdings are highlighted. Neighboring kingdoms remain
                  visible for context.
                </p>
                <div className="room-actions">
                  {state.territories
                    .filter((t) => t.owner === c.kingdom)
                    .map((t) => (
                      <Button
                        key={t.id}
                        aria-pressed={selected === t.id}
                        onClick={() => setSelected(t.id)}
                      >
                        {t.name}
                      </Button>
                    ))}
                </div>
                <WorldMap
                  realmId={state.realmId}
                  focusFaction={c.kingdom}
                  territories={state.territories}
                  realmName={state.realm}
                  selected={selected}
                  onSelect={setSelected}
                />
                {selected && (
                  <p>
                    {state.territories.find((t) => t.id === selected)?.name} ·{' '}
                    {state.territories.find((t) => t.id === selected)?.owner} kingdom
                  </p>
                )}
              </Panel>
            )}
            {pane === 'council' && state.role === 'lord' && (
              <div className="experience-grid">
                <Panel>
                  <PanelTitle title="Guide your kingdom" eyebrow="ELECTED OFFICE" />
                  <p>
                    Your term ends {new Date(state.lordEndsAt!).toLocaleString()}. Suggest one
                    eligible territory per UTC day. Your streamer reviews every proposal.
                  </p>
                  <label>
                    Target territory
                    <select value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value="">Choose a frontier</option>
                      {state.territories
                        .filter(
                          (t) =>
                            !t.capital &&
                            !t.contestedToday &&
                            t.owner !== c.kingdom &&
                            t.neighbors.some((id) =>
                              state.territories.some((n) => n.id === id && n.owner === c.kingdom),
                            ),
                        )
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    variant="primary"
                    disabled={
                      busy ||
                      !target ||
                      state.proposals.some(
                        (p) =>
                          p.characterId === c.id &&
                          new Date(p.createdAt).toISOString().slice(0, 10) ===
                            new Date(state.now).toISOString().slice(0, 10),
                      )
                    }
                    onClick={() => void act('proposals', { territory: target })}
                  >
                    {state.proposals.some(
                      (p) =>
                        p.characterId === c.id &&
                        new Date(p.createdAt).toISOString().slice(0, 10) ===
                          new Date(state.now).toISOString().slice(0, 10),
                    )
                      ? 'Daily proposal submitted'
                      : 'Send proposal to streamer'}
                  </Button>
                </Panel>
                <Panel>
                  <PanelTitle title="Council record" />
                  {state.proposals.length === 0 ? (
                    <p>Your council has not sent a proposal yet.</p>
                  ) : (
                    state.proposals.map((p) => (
                      <div className="companion-row" key={p.id}>
                        <strong>
                          {p.name} · {p.status}
                        </strong>
                        <p>{state.territories.find((t) => t.id === p.territory)?.name}</p>
                        {p.reason && <p>{p.reason}</p>}
                      </div>
                    ))
                  )}
                </Panel>
              </div>
            )}
            <Panel>
              <PanelTitle title="The living chronicle" />
              {state.events.slice(0, 3).map((e) => (
                <div className="companion-row" key={e.id}>
                  <strong>{e.title}</strong>
                  <p>{e.body}</p>
                </div>
              ))}
            </Panel>
          </>
        )}
      </main>
      <footer className="companion-footer">
        A world built by its people. · Local-first companion
      </footer>
    </div>
  );
}
