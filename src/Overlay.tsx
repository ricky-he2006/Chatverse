import { useEffect, useRef, useState } from 'react';
import { Crown, FlaskConical, Swords } from 'lucide-react';
import type { Chapter, Kingdom, Mode, WorldEvent } from '../shared/types';
import { FACTIONS } from '../shared/catalog';
import { Crest } from './WorldMap';
import { countdown } from './ui';
type Projection = {
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
export function Overlay() {
  const mode: Mode = location.pathname.split('/')[2] === 'live' ? 'live' : 'simulation';
  const [data, setData] = useState<Projection | null>(null),
    [error, setError] = useState(''),
    [tick, setTick] = useState(Date.now()),
    [notice, setNotice] = useState<WorldEvent | null>(null);
  const cursor = useRef<number | null>(null),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    offset = useRef(0);
  useEffect(() => {
    document.body.classList.add('overlay-body');
    let events: EventSource | undefined,
      cancelled = false;
    async function start() {
      try {
        const key = new URLSearchParams(location.hash.slice(1)).get('key');
        if (key) {
          const response = await fetch('/api/overlay/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, key }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.message);
          history.replaceState(null, '', location.pathname);
        }
        const snapshot = await fetch(`/api/${mode}/overlay/snapshot`),
          body = await snapshot.json();
        if (!snapshot.ok) throw new Error(body.message);
        if (cancelled) return;
        setData(body);
        offset.current = body.now - Date.now();
        cursor.current = body.events[0]?.id ?? 0;
        events = new EventSource(`/api/${mode}/overlay/events`);
        events.onmessage = (e) => {
          const next: Projection = JSON.parse(e.data);
          setData(next);
          setError('');
          offset.current = next.now - Date.now();
          if (next.generation !== body.generation) {
            cursor.current = next.events[0]?.id ?? 0;
            body.generation = next.generation;
            setNotice(null);
          }
          const latest = next.events[0];
          if (latest && latest.id > (cursor.current ?? 0) && !next.quiet) {
            cursor.current = latest.id;
            setNotice(latest);
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
            noticeTimer.current = setTimeout(() => setNotice(null), 6500);
          }
        };
        events.onerror = () => setError('ChatVerse reconnecting');
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
      document.body.classList.remove('overlay-body');
    };
  }, [mode]);
  const now = tick + offset.current,
    ch = data?.chapter;
  const active =
    ch &&
    (ch.status === 'open' ||
      ch.status === 'paused' ||
      (ch.status === 'resolved' && now - (ch.resolvedAt ?? 0) < 20000));
  return (
    <div className="obs-overlay">
      {mode === 'simulation' && (
        <div className="obs-mode">
          <FlaskConical size={16} />
          SIMULATION · SYNTHETIC WORLD
        </div>
      )}
      {error && <div className="obs-error">{error}</div>}
      {data && !data.quiet && active && (
        <div className="obs-campaign">
          <div className="obs-eyebrow">
            <Crown size={13} />
            CHATVERSE · {ch.territory.replaceAll('-', ' ').toUpperCase()}
          </div>
          <div className="obs-matchup">
            <div>
              <Crest faction={ch.attacker} size={42} />
              <span>
                {FACTIONS[ch.attacker].name}
                <strong>
                  {ch.result
                    ? ch.result.maxHealthA
                      ? `${ch.result.healthA}/${ch.result.maxHealthA} HP`
                      : ch.result.scoreA
                    : `${ch.pledged[ch.attacker]} pledged`}
                </strong>
              </span>
            </div>
            <Swords size={24} />
            <div>
              <span>
                {FACTIONS[ch.defender].name}
                <strong>
                  {ch.result
                    ? ch.result.maxHealthB
                      ? `${ch.result.healthB}/${ch.result.maxHealthB} HP`
                      : ch.result.scoreB
                    : `${ch.pledged[ch.defender]} pledged`}
                </strong>
              </span>
              <Crest faction={ch.defender} size={42} />
            </div>
          </div>
          <div className="obs-score-track">
            <span
              style={{
                width:
                  ch.result?.maxHealthA && ch.result?.maxHealthB
                    ? ch.result.healthA === 0 && ch.result.healthB === 0
                      ? '50%'
                      : `${(ch.result.healthA! / ch.result.maxHealthA / (ch.result.healthA! / ch.result.maxHealthA + ch.result.healthB! / ch.result.maxHealthB || 1)) * 100}%`
                    : ch.result
                      ? `${(ch.result.scoreA / (ch.result.scoreA + ch.result.scoreB)) * 100}%`
                      : '50%',
                background: FACTIONS[ch.attacker].color,
              }}
            />
            <span style={{ flex: 1, background: FACTIONS[ch.defender].color }} />
          </div>
          <div className="obs-caption">
            {ch.result
              ? ch.result.winner
                ? `${FACTIONS[ch.result.winner].name} prevails`
                : 'An honorable draw'
              : ch.status === 'paused'
                ? 'Council paused'
                : `!pledge · !vote attack | defend | raid · ${countdown(ch.deadline, now)}`}
          </div>
        </div>
      )}
      {notice && data && !data.quiet && (
        <div className="obs-notice">
          <div>
            <Crown size={29} />
          </div>
          <span>
            <small>
              {notice.source === 'simulated'
                ? 'SIMULATED CAMPAIGN EVENT'
                : 'YOUR COMMUNITY’S CHRONICLE'}
            </small>
            <strong>{notice.title}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
