import { HeraldPlayer } from './HeraldPlayer';
import { BattlePlayback } from './BattlePlayback';
import { useEffect, useRef, useState } from 'react';
import { Crown, FlaskConical, Swords } from 'lucide-react';
import type { Chapter, Kingdom, Mode, WorldEvent } from '../shared/types';
import { FACTIONS } from '../shared/catalog';
import { Crest } from './WorldMap';
import { countdown } from './ui';
import { realmUrl } from './api';
import { overlayChapterVisible, nextOverlayNotice } from '../shared/overlay';
type Projection = {
  herald?: import('../shared/herald').HeraldSettings;
  heraldLines: import('../shared/herald').HeraldLine[];
  mode: Mode;
  generation: string;
  now: number;
  realm: string;
  kingdoms: Kingdom[];
  chapter: Chapter | null;
  events: WorldEvent[];
  quiet: boolean;
  integration: { connected: boolean; state: string };
};
export function Overlay({
  embedded = false,
  mode: selectedMode,
  realm: selectedRealm,
  presentation,
}: { embedded?: boolean; mode?: Mode; realm?: string; presentation?: string } = {}) {
  const mode: Mode =
    selectedMode ?? (location.pathname.split('/')[2] === 'live' ? 'live' : 'simulation');
  const realm = selectedRealm ?? new URLSearchParams(location.search).get('realm') ?? 'home';
  const options = new URLSearchParams(presentation ?? location.search);
  const anchor = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(
    options.get('anchor') ?? '',
  )
    ? options.get('anchor')!
    : 'top-right';
  const [data, setData] = useState<Projection | null>(null),
    [error, setError] = useState(''),
    [tick, setTick] = useState(Date.now()),
    [notice, setNotice] = useState<WorldEvent | null>(null);
  const observed = useRef<string | null>(null);
  const cursor = useRef<number | null>(null),
    lastNoticeAt = useRef(0),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    offset = useRef(0);
  useEffect(() => {
    if (!embedded) {
      document.body.classList.add('overlay-body');
      document.documentElement.classList.add('overlay-root');
    }
    let events: EventSource | undefined,
      cancelled = false;
    async function start() {
      try {
        const storageKey = `cv:overlay:${mode}:${realm}`;
        const key =
          !embedded &&
          (new URLSearchParams(location.hash.slice(1)).get('key') ??
            sessionStorage.getItem(storageKey));
        if (key) {
          const response = await fetch('/api/overlay/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, key, realm }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.message);
          sessionStorage.setItem(storageKey, key);
          history.replaceState(null, '', location.pathname + location.search);
        }
        const snapshot = await fetch(realmUrl(`/api/${mode}/overlay/snapshot`, realm)),
          body = await snapshot.json();
        if (!snapshot.ok) throw new Error(body.message);
        if (cancelled) return;
        if (body.chapter && ['open', 'paused'].includes(body.chapter.status))
          observed.current = body.chapter.id;
        setData(body);
        offset.current = body.now - Date.now();
        cursor.current = body.events[0]?.id ?? 0;
        events = new EventSource(realmUrl(`/api/${mode}/overlay/events`, realm));
        events.onopen = () => {
          if (!cancelled) setError('');
        };
        events.onmessage = (e) => {
          if (cancelled) return;
          const next: Projection = JSON.parse(e.data);
          if (next.chapter && ['open', 'paused'].includes(next.chapter.status))
            observed.current = next.chapter.id;
          setData(next);
          setError('');
          offset.current = next.now - Date.now();
          if (next.generation !== body.generation) {
            cursor.current = next.events[0]?.id ?? 0;
            body.generation = next.generation;
            setNotice(null);
            lastNoticeAt.current = 0;
          }
          if (next.quiet) observed.current = null;
          const latest = nextOverlayNotice(
            next.events,
            cursor.current ?? 0,
            !!next.chapter?.result,
          );
          const newestId = next.events[0]?.id ?? cursor.current ?? 0;
          const previousCursor = cursor.current ?? 0;
          cursor.current = newestId;
          if (
            next.chapter?.result &&
            next.events.some((event) => event.id > previousCursor && event.type === 'battle')
          ) {
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
            setNotice(null);
          }
          if (latest && latest.id > previousCursor && !next.quiet) {
            cursor.current = newestId;
            if (
              !['battle', 'election', 'announcement', 'milestone'].includes(latest.type) &&
              Date.now() - lastNoticeAt.current < 10000
            )
              return;
            lastNoticeAt.current = Date.now();
            setNotice(latest);
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
            noticeTimer.current = setTimeout(
              () => setNotice(null),
              latest.type === 'join' ? 3000 : latest.type === 'battle' ? 7500 : 6000,
            );
          }
        };
        events.onerror = () => {
          observed.current = null;
          setError('ChatVerse reconnecting');
        };
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    void start();
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      cancelled = true;
      events?.close();
      clearInterval(timer);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (!embedded) {
        document.body.classList.remove('overlay-body');
        document.documentElement.classList.remove('overlay-root');
      }
    };
  }, [mode, realm, embedded]);
  const now = tick + offset.current,
    ch = data?.chapter;
  const active = ch && overlayChapterVisible(ch, now, options.get('ribbon') === 'pinned');
  return (
    <div
      className={`obs-overlay ${mode} anchor-${anchor} ${options.get('motion') === 'off' ? 'motion-off' : ''}`}
    >
      {mode === 'simulation' && (
        <div className="obs-mode">
          <FlaskConical size={16} />
          SIMULATION · SYNTHETIC WORLD
          <small>
            {error
              ? 'Connection interrupted'
              : !data
                ? 'Connecting…'
                : data.quiet
                  ? 'Quiet mode on · Events hidden'
                  : active
                    ? 'Connected · Battle visible'
                    : notice
                      ? 'Connected · Community moment visible'
                      : ch?.status === 'open' || ch?.status === 'paused'
                        ? 'Connected · Battle ribbon hidden after 12s (Moments mode)'
                        : 'Connected · Waiting for a battle or announcement'}
          </small>
        </div>
      )}
      {error && <div className="obs-error">{error}</div>}
      {data && !embedded && <HeraldPlayer mode={mode} realm={realm} data={data} />}
      <div className="obs-cluster">
        {data && !data.quiet && active && (
          <div className="obs-campaign">
            <div className="obs-eyebrow">
              <Crown size={13} />
              {data.realm.toUpperCase()} · {ch.territory.replaceAll('-', ' ').toUpperCase()}
            </div>
            {ch.result ? (
              <BattlePlayback
                key={ch.id}
                chapter={ch}
                compact
                autoplay={observed.current === ch.id && !error}
                staticMode={options.get('motion') === 'off'}
              />
            ) : (
              <>
                <div className="obs-matchup">
                  <div>
                    <Crest faction={ch.attacker} size={28} />
                    <span>
                      {FACTIONS[ch.attacker].name.replace(' Kingdom', '')}
                      <strong>{`${ch.pledged[ch.attacker]} pledged`}</strong>
                    </span>
                  </div>
                  <Swords size={24} />
                  <div>
                    <span>
                      {FACTIONS[ch.defender].name.replace(' Kingdom', '')}
                      <strong>{`${ch.pledged[ch.defender]} pledged`}</strong>
                    </span>
                    <Crest faction={ch.defender} size={28} />
                  </div>
                </div>
                <div className="obs-score-track">
                  <span
                    style={{
                      width: '50%',
                      background: FACTIONS[ch.attacker].color,
                    }}
                  />
                  <span style={{ flex: 1, background: FACTIONS[ch.defender].color }} />
                </div>
                <div className="obs-caption">
                  {ch.status === 'paused'
                    ? 'Council paused'
                    : `New? !join ${ch.attacker} or !join ${ch.defender} · !pledge, then !vote attack | defend | raid · ${countdown(ch.deadline, now)}`}
                </div>
              </>
            )}
          </div>
        )}
        {notice && data && !data.quiet && (
          <div className={'obs-notice ' + (notice.type === 'supporter' ? 'supporter-arrival' : '')}>
            <div>
              <Crown size={29} />
            </div>
            <span>
              <small>
                {notice.source === 'simulated'
                  ? 'SIMULATED CAMPAIGN EVENT'
                  : notice.type === 'milestone'
                    ? 'STREAMER CONFIRMED'
                    : 'YOUR COMMUNITY’S CHRONICLE'}
              </small>
              <strong>{notice.title}</strong>
              {notice.type === 'announcement' && <p>{notice.body}</p>}
              {notice.type === 'milestone' && ch?.status === 'open' && (
                <p>Council open · !pledge then !vote attack | defend | raid</p>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
